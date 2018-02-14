package main

import (
	"bufio"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"io"
	"io/ioutil"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/glenn-brown/golang-pkg-pcre/src/pkg/pcre"
	cssparse "github.com/gorilla/css/scanner"
	"github.com/pkg/errors"
	"golang.org/x/net/html"
)

type Page struct {
	Date    float64 `json:"d"`
	Caption string  `json:"c"`
	Body    string  `json:"b"`
	Next    []int   `json:"n"`
}

type UserID string

// need to cover:
// do:story
// do:user

type StoryJSON struct {
	ID        int64         `json:"i"`
	D         float64       `json:"d"`
	Updated   float64       `json:"u"`
	C         string        `json:"c"`
	Mirroring []UserID      `json:"e"`
	Name      string        `json:"n"`
	Desc      template.HTML `json:"r"` // contains URLs
	H         float64       `json:"h"`
	Tags      []string      `json:"t"`
	Author    string        `json:"a"`
	AuthLink  string        `json:"w"` // contains URLs
	Icon      string        `json:"o"` // contains URLs
	B         float64       `json:"b"`
	CSS       template.CSS  `json:"y"` // contains URLs
	J         string        `json:"j"`
	V         string        `json:"v"`
	F         []string      `json:"f"`
	M         string        `json:"m"`
	Pages     []Page        `json:"p"` // contains URLs
	G         []string      `json:"g"`
	K         float64       `json:"k"`
	// thumbnail
	Q string `json:"q"` // contains URLs
	X string `json:"x"`

	// used by template
	Conf *OutputConf `json:"-"`
}

type User struct {
	ID   string      `json:"i"`
	D    float64     `json:"d"`
	Name string      `json:"n"`
	V    float64     `json:"v"`
	H    float64     `json:"h"`
	W    string      `json:"w"`
	R    string      `json:"r"`
	Icon string      `json:"o"` // contains URLs
	G    interface{} `json:"g"`
	A    float64     `json:"a"`
	S    struct {
		K struct {
			P float64 `json:"p"`
			N float64 `json:"n"`
			S float64 `json:"s"`
		} `json:"k"`
		S float64 `json:"s"`
		P float64 `json:"p"`
	} `json:"s"`
	U float64 `json:"u"`
}

type OutputConf struct {
	IsArchiveOrg bool
	IAIdentifier string
	footerImages string
}

type RscType int

const (
	tLink RscType = iota
	tSrc
	tVideo
	tLinkedStory
	tPhotobucket
)

// Rsc is an adventure resource.
type Rsc struct {
	// URL
	U    string
	Type RscType
}

var authHeader string

type advDir string

func (a advDir) JSONFile() string {
	return filepath.Join(string(a), "adventure.json")
}

func (a advDir) LatestCrawlFile() string {
	return filepath.Join(string(a), "latest_crawl")
}

func (a advDir) File(name string) string {
	return filepath.Join(string(a), name)
}

const stampFormat = "20060102150405"
const userAgent = "MSPFA Archiver/0.8"

func decodeJSON(r io.Reader, v interface{}) error {
	dec := json.NewDecoder(r)
	// dec.DisallowUnknownFields() // Go 1.10
	return dec.Decode(v)
}

func getStoryJSON(storyID string, dir advDir) (*StoryJSON, error) {
	stat, statErr := os.Stat(dir.File("adventure.json"))
	if os.IsNotExist(statErr) {
		return downloadStoryJSON(storyID, dir)
	} else if statErr != nil {
		return nil, statErr
	} else { // stat success
		t := stat.ModTime()
		if *forceAdvUpdate || t.Before(time.Now().Add(24*7*time.Hour)) {
			// try to ignore errors and use existing file
			story, _ := downloadStoryJSON(storyID, dir)
			if story != nil {
				return story, nil
			}
		}
	}

	f, err := os.Open(dir.File("adventure.json"))
	if err != nil {
		return nil, errors.Wrap(err, "read adventure.json")
	}
	var story *StoryJSON
	err = decodeJSON(f, &story)
	return story, errors.Wrap(err, "adventure.json decode error")
}

func downloadStoryJSON(storyID string, dir advDir) (*StoryJSON, error) {
	// wget --post-data "do=story&s=21746" https://mspfa.com/
	form := url.Values{}
	form.Set("do", "story")
	form.Set("s", storyID)
	fmt.Println("Fetching", form)
	resp, err := http.PostForm("https://mspfa.com/", form)
	if err != nil {
		return nil, errors.Wrapf(err, "get story %s", storyID)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		by, _ := ioutil.ReadAll(resp.Body)
		return nil, errors.Errorf("get story %s: response code %s: %s", storyID, resp.Status, by)
	}

	f, err := os.Create(dir.File("adventure.json"))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	copyBody := io.TeeReader(resp.Body, f)
	var story *StoryJSON
	err = decodeJSON(copyBody, &story)
	return story, errors.Wrap(err, "adventure.json decode error")
}

func downloadUserJSON(userID UserID, dir advDir) (*User, error) {
	// wget --post-data "do=user&u=1234456789"

	os.Mkdir(dir.File("users"), 0755)
	fileName := dir.File(fmt.Sprintf("users/%s.json", userID))
	_, statErr := os.Stat(fileName)
	if os.IsNotExist(statErr) {
		goto statcontinue
	} else if statErr != nil {
		return nil, statErr
	} else { // stat success
		f, err := os.Open(fileName)
		if err != nil {
			goto statcontinue
		}
		var user *User
		err = decodeJSON(f, &user)
		return user, err
	}
statcontinue:

	form := url.Values{}
	form.Set("do", "user")
	form.Set("u", string(userID))
	fmt.Println("Fetching", form)
	resp, err := http.PostForm("https://mspfa.com/", form)
	if err != nil {
		return nil, errors.Wrapf(err, "get user %s", userID)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		by, _ := ioutil.ReadAll(resp.Body)
		return nil, errors.Errorf("get user %s: response code %s: %s", userID, resp.Status, by)
	}

	f, err := os.Create(fileName)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	copyBody := io.TeeReader(resp.Body, f)
	var user *User
	err = decodeJSON(copyBody, &user)
	return user, err
}

func downloadResources(dir advDir) error {
	os.MkdirAll(dir.File("linked"), 0755)

	// ../../wpull --warc-file ../resources --warc-append --warc-cdx --wait 0.1 --page-requisites --tries 3 --retry-connrefused --retry-dns-error --database ../wpull.db --output-file ../wpull-$(date +%s).log --user-agent "MSPFA Archiver/0.8" --span-hosts-allow page-requisites -l 3
	cmd := exec.Command("./wpull",
		"--database", dir.File("wpull.db"),
		"--input-file", dir.File("urls.txt"),
		"--output-file", dir.File(time.Now().Format("wpull-"+stampFormat+".log")),
		"--user-agent", userAgent,
		"--concurrent", "2",
		"--warc-file", dir.File("resources"),
		"--warc-append", "--warc-cdx",
		"--warc-tempdir", string(dir),
		"--page-requisites",
		"--span-hosts-allow", "page-requisites",
		"--wait", "0.1",
		"--tries", "3",
		"--retry-connrefused", "--retry-dns-error",
		"-P", dir.File("linked"),
		"--exclude-domains", "discordapp.com,youtube.com,assets.tumblr.com",
		// "--youtube-dl",
	)
	// cmd.Dir = string(dir)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	fmt.Println("Ready to run wpull")
	fmt.Println(cmd.Args)
	err := cmd.Run()
	return errors.Wrap(err, "wpull")
}

func downloadFile(uri string, dest string) error {
	resp, err := http.Get(uri)
	if err != nil {
		return errors.Wrapf(err, "downloading %s", uri)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return errors.Errorf("Error code %s downloading %s", resp.Status, uri)
	}
	f, err := os.Create(dest)
	if err != nil {
		return errors.Wrapf(err, "downloading %s", uri)
	}
	io.Copy(f, resp.Body)
	return errors.Wrapf(f.Close(), "downloading %s", uri)
}

func downloadVideo(uri string, dir advDir) error {
	parsed, err := url.Parse(uri)
	if err != nil {
		return err
	}

	cmd := exec.Command("youtube-dl",
		"-o", dir.File("videos/"+parsed.Host+"/%(id)s.%(ext)s"),
		// "-k", // keep bestvideo/bestaudio fragments
		"-r", "3M",
		"-f", "bestvideo+bestaudio/best",
		"--http-chunk-size", "3M",
		uri,
	)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	fmt.Println("Ready to run youtube-dl")
	fmt.Println(cmd.Args)
	err = cmd.Run()
	return errors.Wrap(err, "youtube-dl")
}

func downloadVideos(dir advDir) error {
	f, err := os.Open(dir.File("videos.txt"))
	if err != nil {
		return errors.Wrap(err, "reading videos.txt")
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		err = downloadVideo(line, dir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "%+v\n", err)
		}
	}
	if sc.Err() != nil {
		return errors.Wrap(err, "reading videos.txt")
	}
	return nil
}

func toAbsoluteArchiveURL(up string) string {
	u, err := url.Parse(up)
	if err != nil {
		return up
	}
	if *iaIdentifier == "" {
		return up
	}
	if u.RawQuery == "" {
		return fmt.Sprintf("https://archive.org/download/%s/linked/%s%s", *iaIdentifier, u.Host, u.Path)
	}
	return fmt.Sprintf("https://archive.org/download/%s/linked/%s%s?%s", *iaIdentifier, u.Host, u.Path, u.RawQuery)
}

func toRelativeArchiveURL(up string) string {
	u, err := url.Parse(up)
	if err != nil {
		return up
	}
	if u.RawQuery == "" {
		return fmt.Sprintf("linked/%s%s", u.Host, u.Path)
	}
	return fmt.Sprintf("linked/%s%s?%s", u.Host, u.Path, u.RawQuery)
}

// for templates
func (sj *StoryJSON) PlainDesc() string {
	var buf bytes.Buffer

	// Grab all text from description
	tz := html.NewTokenizer(strings.NewReader(string(sj.Desc)))
	for {
		tt := tz.Next()
		switch tt {
		case html.ErrorToken:
			s := buf.String()
			if strings.TrimSpace(s) == "" {
				return "(no description)"
			}
			return s
		case html.TextToken:
			buf.WriteString(strings.TrimSpace(tz.Token().Data))
		}
	}
}

func (sj *StoryJSON) GetIcon() string {
	if sj.Icon != "" {
		return toRelativeArchiveURL(sj.Icon)
	}
	return "./assets/wat/wat.njs." + strconv.Itoa(rand.New(rand.NewSource(sj.ID)).Intn(4))
}

func (sj *StoryJSON) FooterImages() string {
	return sj.Conf.footerImages
}

func writeHTML(story *StoryJSON, dir advDir, tmpl *template.Template, which string) error {
	destFile, err1 := os.Create(dir.File(which + ".html"))
	if err1 != nil {
		return errors.Wrapf(err1, "write %s.html", which)
	}
	err1 = tmpl.Execute(destFile, story)
	err2 := destFile.Close()
	if err1 != nil {
		return errors.Wrapf(err1, "write %s.html", which)
	}
	if err2 != nil {
		return errors.Wrapf(err2, "write %s.html", which)
	}
	return nil
}

func copyAsset(name string, dir advDir, wg *sync.WaitGroup) error {
	dest, err := os.Create(dir.File("assets/" + name))
	if err != nil {
		panic(err)
	}
	src, err := os.Open("template/assets/" + name)
	if err != nil {
		panic(err)
	}
	go func() {
		defer wg.Done()
		defer dest.Close()
		defer src.Close()
		io.Copy(dest, src)
	}()
	return nil
}

func copyAssets(story *StoryJSON, dir advDir) error {
	var wg sync.WaitGroup
	fmt.Println("Copying assets...")

	os.Mkdir(dir.File("assets"), 0755)
	assets, err := ioutil.ReadDir("template/assets/")
	if err != nil {
		panic(err)
	}
	for _, fent := range assets {
		name := fent.Name()
		if name != "random" && name != "wat" {
			wg.Add(1)
			copyAsset(name, dir, &wg)
		}
	}
	wg.Wait()

	os.Mkdir(dir.File("assets/wat"), 0755)
	wg.Add(4)
	for i := 0; i < 4; i++ {
		copyAsset(fmt.Sprintf("wat/wat.njs.%d", i), dir, &wg)
	}
	os.Mkdir(dir.File("assets/random"), 0755)
	// A consistent random based on story ID is used to reduce filesize
	// (there are ~80 possible images)
	wg.Add(10)
	rand := rand.New(rand.NewSource(story.ID))
	var choices bytes.Buffer
	for i := 0; i < 10; i++ {
		n := rand.Intn(80)
		if i != 0 {
			choices.WriteByte(',')
		}
		fmt.Fprint(&choices, n)
		copyAsset(fmt.Sprintf("random/random.njs.%d", n), dir, &wg)
	}
	story.Conf.footerImages = choices.String()

	// Thumbnail
	if story.Icon != "" {
		err = downloadFile(story.Icon, dir.File("cover.png"))
	} else {
		wat := rand.Intn(4)
		err = os.Link(dir.File(fmt.Sprintf("assets/wat/wat.njs.%d", wat)), dir.File("cover.png"))
	}
	if err != nil {
		return err
	}

	wg.Wait()

	return nil
}

var seenElementTypes = make(map[string]bool)

func scanHTML(desc string, out chan<- Rsc) error {
	tz := html.NewTokenizer(strings.NewReader(desc))
	for {
		tt := tz.Next()
		switch tt {
		case html.ErrorToken:
			if tz.Err() != io.EOF {
				return tz.Err()
			}
			return nil
		case html.StartTagToken, html.SelfClosingTagToken:
			t := tz.Token()

			for _, at := range t.Attr {
				if at.Key == "href" {
					out <- Rsc{U: at.Val, Type: tLink}
					if !seenElementTypes[t.Data] {
						seenElementTypes[t.Data] = true
						fmt.Println("Found href on", t.Data)
					}
				} else if at.Key == "src" {
					out <- Rsc{U: at.Val, Type: tSrc}
					if !seenElementTypes[t.Data] {
						seenElementTypes[t.Data] = true
						fmt.Println("Found src on", t.Data)
					}
				}
			}
		}
	}
}

func toArchiveHTML(desc template.HTML, mandatoryDownload func(s string)) template.HTML {
	context, err := html.Parse(strings.NewReader("<span></span>"))
	if err != nil {
		panic(err)
	}
	nodes, err := html.ParseFragment(strings.NewReader(string(desc)), context.FirstChild.LastChild)
	if err != nil {
		return template.HTML("(Bad HTML in description: <pre>" + html.EscapeString(err.Error()) + "</pre>")
	}
	var scanEl func(n *html.Node)
	scanEl = func(n *html.Node) {
		for ch := n.FirstChild; ch != nil; ch = ch.NextSibling {
			scanEl(ch)
		}
		if n.Type == html.ElementNode {
			for idx := range n.Attr {
				if n.Attr[idx].Key == "src" {
					mandatoryDownload(n.Attr[idx].Val)
					n.Attr[idx].Val = toAbsoluteArchiveURL(n.Attr[idx].Val)
				} else if n.Attr[idx].Key == "href" {
					// toWebArchiveURL()
					// v.Value = toArchiveURL(v.Value)
				}
			}
		}
	}
	for _, n := range nodes {
		scanEl(n)
	}

	var buf bytes.Buffer
	for _, n := range nodes {
		fmt.Println(n)
		err = html.Render(&buf, n)
		if err != nil {
			return template.HTML("(Could not re-render HTML: <pre>" + html.EscapeString(err.Error()) + "</pre>")
		}
	}
	fmt.Println(buf.String())
	return template.HTML(buf.String())
}

var cssTrimLeft = regexp.MustCompile(`^url\((['"]?)`)

func scanURL(maybeURL string, out chan<- Rsc, ty RscType) {
	if maybeURL == "" {
		return
	}

	u, err := url.Parse(maybeURL)
	if err == nil {
		if u.Host == "" {
			return
		}
		out <- Rsc{U: maybeURL, Type: ty}
	}
}

func scanCSS(src template.CSS, out chan<- Rsc) {
	sc := cssparse.New(string(src))
	for {
		tok := sc.Next()
		switch tok.Type {
		case cssparse.TokenEOF:
			return
		case cssparse.TokenURI:
			matched := tok.Value
			locs := cssTrimLeft.FindStringSubmatchIndex(matched)
			quoteChar := matched[locs[1*2]:locs[1*2+1]]
			matched = matched[locs[0*2+1]:]
			matched = strings.TrimSuffix(matched, quoteChar+")")
			// fmt.Println("DEBUG: css uri extraction:", matched)
			scanURL(matched, out, tSrc)
		}
	}
}

var pcreFlags = pcre.CASELESS | pcre.MULTILINE

var bbRegex = map[string]pcre.Regexp{
	// Taken directly from MSPFA source
	"url1":   pcre.MustCompile(`\[url\]([^"]*?)\[/url\]`, pcreFlags),
	"url2":   pcre.MustCompile(`\[url=("?)([^"]*?)\1\]((?:(?!\[url(?:=.*?)\]).)*?)\[/url\]`, pcreFlags),
	"img1":   pcre.MustCompile(`\[img\]([^"]*?)\[/img\]`, pcreFlags),
	"img3":   pcre.MustCompile(`\[img=(\d*?)x(\d*?)\]([^"]*?)\[/img\]`, pcreFlags),
	"flash3": pcre.MustCompile(`\[flash=(\d*?)x(\d*?)\](.*?)\[\/flash\]`, pcreFlags),
}

var bbRegexGroup = map[string]int{
	"url1":   1,
	"url2":   2,
	"img1":   1,
	"img3":   3,
	"flash3": 3,
}

func scanBBCode(p *Page, out chan<- Rsc) {
	matcher := new(pcre.Matcher)

	for k, rgx := range bbRegex {
		for matcher.ResetString(rgx, p.Body, 0); matcher.Matches(); matcher.Next(0) {
			switch k {
			case "url1":
				out <- Rsc{U: matcher.GroupString(1), Type: tLink}
			case "url2":
				out <- Rsc{U: matcher.GroupString(2), Type: tLink}
			case "img1":
				out <- Rsc{U: matcher.GroupString(1), Type: tSrc}
			case "img3", "flash3":
				out <- Rsc{U: matcher.GroupString(3), Type: tSrc}
			}
		}
	}

	scanHTML(p.Body, out)
}

var mspfaBaseURL, _ = url.Parse("https://mspfa.com/")

func scanPages(story *StoryJSON, out chan<- Rsc) {
	for idx := range story.Pages {
		scanBBCode(&story.Pages[idx], out)
	}
}

func writeURLsFile(resourceList map[Rsc]struct{}, dir advDir) error {
	urls := make([]string, 0, len(resourceList))
	videos := make([]string, 0, 5)
	for rsc := range resourceList {
		switch rsc.Type {
		case tLink, tSrc:
			urls = append(urls, rsc.U)
		case tVideo:
			videos = append(videos, rsc.U)
		}
	}
	sort.Strings(urls)
	sort.Strings(videos)

	f, err := os.Create(dir.File("urls.txt"))
	if err != nil {
		return errors.Wrap(err, "writing urls file")
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	for _, link := range urls {
		fmt.Fprintln(w, link)
	}
	err = w.Flush()
	if err != nil {
		return errors.Wrap(err, "writing urls file")
	}

	f, err = os.Create(dir.File("videos.txt"))
	if err != nil {
		return errors.Wrap(err, "writing videos file")
	}
	defer f.Close()
	w = bufio.NewWriter(f)
	for _, link := range videos {
		fmt.Fprintln(w, link)
	}
	err = w.Flush()
	if err != nil {
		return errors.Wrap(err, "writing urls file")
	}

	return err
}

var videoURLs = []string{
	"youtube.com/watch",
	"youtu.be",
	"newgrounds.com/audio",
	"soundcloud.com",
	"bandcamp.com/track",
}

func buildResourceList(urlChan chan Rsc) map[Rsc]struct{} {
	resourceList := make(map[Rsc]struct{})
	for resource := range urlChan {
		u, err := url.Parse(resource.U)
		if err != nil {
			fmt.Println(resource, err)
			continue
		}
		u = u.ResolveReference(mspfaBaseURL)
		if resource.Type == tLink {
			for _, videoStr := range videoURLs {
				if strings.Contains(resource.U, videoStr) {
					resource.Type = tVideo
				}
			}
			// Do not download internal links
			if u.Host == "mspfa.com" {
				fetchAnyways := false
				switch {
				case u.Path == "", u.Path == "/":
					q := u.Query()
					if q.Get("s") != "" {
						resource.Type = tLinkedStory
					}
				case strings.HasPrefix(u.Path, "/images"):
					resource.Type = tSrc
					fetchAnyways = true
				}

				if !fetchAnyways {
					continue
				}
			}
			if strings.Contains(u.Host, "photobucket") {
				// fuck photobucket
				resource.Type = tPhotobucket
			}
		}

		resourceList[resource] = struct{}{}
	}
	return resourceList
}

func archiveStory(story *StoryJSON, dir advDir) error {
	story.Conf = new(OutputConf)
	story.Conf.IsArchiveOrg = *iaIdentifier != ""
	story.Conf.IAIdentifier = *iaIdentifier

	urlChan := make(chan Rsc)
	var scanErr error
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				if rErr, ok := rec.(error); ok {
					scanErr = errors.Wrap(rErr, "scanning")
				} else {
					scanErr = errors.Errorf("scanning: %v", rec)
				}
			}
		}()
		out := urlChan
		scanPages(story, out)
		scanHTML(string(story.Desc), out)
		scanURL(story.Icon, out, tSrc)
		scanCSS(story.CSS, out)
		scanURL(story.Q, out, tSrc)
		scanURL(story.AuthLink, out, tLink)
		close(urlChan)
	}()

	resourceList := buildResourceList(urlChan)

	var err error
	err = writeURLsFile(resourceList, dir)
	if err != nil {
		return err
	}
	err = writeMetadataCSV(story, dir)
	if err != nil {
		return err
	}

	err = copyAssets(story, dir)
	if err != nil {
		return err
	}

	fmt.Println("Writing view HTML...")
	for _, f := range [...]string{"view", "log", "search"} {
		tmpl, err := template.ParseFiles("template/"+f+".fragment.html", "template/layout.html")
		if err != nil {
			panic(err)
		}
		err = writeHTML(story, dir, tmpl, f)
		if err != nil {
			return err
		}
	}

	return nil
}

var tmplDescription = template.Must(template.New("ia-description").Parse(
	`<div>An archival copy of {{.S.Name}} (<a href="https://mspfa.com/?s={{.S.ID}}">https://mspfa.com/?s={{.S.ID}}</a>) as of {{.MonthYear}}.</div>
<div><br></div>
<div>Start Reading: <a href="https://archive.org/download/{{.Identifier}}/view.html?s={{.S.ID}}&p=1">https://archive.org/download/{{.Identifier}}/view.html?s={{.S.ID}}&p=1</a></div>
<div><br></div>
<div>{{.FilterDesc}}</div>`))

func writeMetadataCSV(story *StoryJSON, dir advDir) error {
	if *iaIdentifier == "" {
		return nil // skip
	}

	f, err := os.Create(dir.File("ia-upload-view.csv"))
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()

	headers := make([]string, 0, 10)
	values := make([]string, 0, 10)
	addHV := func(h, v string) {
		headers = append(headers, h)
		values = append(values, v)
	}
	var extraFiles []string

	addHV("identifier", *iaIdentifier)
	addHV("file", "adventure.json")
	{
		var buf bytes.Buffer
		var dataDesc = struct {
			Identifier string
			MonthYear  string
			FilterDesc template.HTML
			S          *StoryJSON
		}{
			Identifier: *iaIdentifier,
			MonthYear:  time.Now().Format("2006-01"),
			FilterDesc: toArchiveHTML(story.Desc, func(s string) {
				extraFiles = append(extraFiles, toRelativeArchiveURL(s))
			}),
			S: story,
		}
		err = tmplDescription.Execute(&buf, dataDesc)
		if err != nil {
			f.Close()
			return err
		}
		addHV("description", buf.String())
	}
	{
		var newestPage float64
		for idx := range story.Pages {
			p := &story.Pages[len(story.Pages)-idx-1]
			if p.Date > newestPage {
				newestPage = p.Date
			}
		}
		newestPageDate := time.Unix(
			int64(newestPage/1000),
			int64(newestPage*float64(time.Millisecond/time.Nanosecond))%int64(time.Second))
		addHV("date", newestPageDate.Format("2006-01-02"))
		addHV("title", fmt.Sprintf("MSPFA Archive - %s", story.Name))
	}
	addHV("collection[1]", "opensource_media")
	addHV("collection[2]", "test_collection") // TEST
	addHV("mediatype", "texts")
	addHV("subject[1]", "mspfa")
	addHV("publisher", "MS Paint Fan Adventures")
	addHV("mspfa-id", fmt.Sprint(story.ID))
	addHV("scanner", userAgent)
	{
		var authors []string
		for _, au := range strings.Split(story.Author, ",") {
			authors = append(authors, strings.TrimSpace(au))
		}
		for _, u := range story.Mirroring {
			user, err := downloadUserJSON(u, dir)
			if err != nil {
				f.Close()
				return err
			}
			found := false
			for _, v := range authors {
				if strings.EqualFold(v, user.Name) {
					found = true
				}
			}
			if !found {
				authors = append(authors, user.Name)
			}
		}
		for idx, au := range authors {
			addHV(fmt.Sprintf("creator[%d]", idx+1), au)
		}
	}

	w.Write(headers)
	w.Write(values)

	addFile := func(filename string) {
		values := make([]string, len(headers))
		values[0] = *iaIdentifier
		values[1] = filename
		w.Write(values)
	}
	addFile("log.html")
	addFile("search.html")
	addFile("view.html")
	addFile("cover.png")
	for _, v := range extraFiles {
		addFile(v)
	}
	return nil
}

func writeUploadFilesCSV(dir advDir) error {
	return nil // TODO

	f, err := os.Create(dir.File("ia-upload-files.csv"))
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	w.Write([]string{"identifier", "file"})

	return nil
}

func loadAuthKey() {
	var auth struct {
		AccessKey string
		SecretKey string
	}
	f, err := os.Open("ias3.json")
	if err != nil {
		return
	}
	err = json.NewDecoder(f).Decode(&auth)
	if err != nil {
		return
	}
	authHeader = fmt.Sprintf("LOW %s:%s", auth.AccessKey, auth.SecretKey)
}

var iaIdentifier = flag.String("ident", "", "Internet Archive item identifier")
var forceAdvUpdate = flag.Bool("f", false, "Force update of adventure.json")

func main() {
	outDir := flag.String("o", "./target", "Output directory where the archive folders should be created.")
	download := flag.Bool("dl", false, "Download files instead of just listing them")

	flag.Parse()

	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "Usage: mspfa-mirror [-o folder] [-ident Identifier] [-dl] [adventure ID]\n"+
			"  Downloads the adventure.json and all images of a MSPFA adventure.")
		flag.PrintDefaults()
	}

	loadAuthKey()

	storyID := flag.Arg(0)
	_, err := strconv.Atoi(storyID)
	if err != nil {
		fmt.Fprintln(os.Stderr, "story ID must be an integer")
		os.Exit(1)
	}

	folder := filepath.Join(*outDir, storyID)

	err = os.MkdirAll(folder, 0755)
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to create directories:", err)
		os.Exit(1)
	}

	story, err := getStoryJSON(storyID, advDir(folder))
	if err != nil {
		fmt.Fprintf(os.Stderr, "%+v\n", err)
		os.Exit(1)
	}

	err = archiveStory(story, advDir(folder))
	if err != nil {
		fmt.Fprintf(os.Stderr, "%+v\n", err)
		os.Exit(1)
	}

	if *download {
		err = downloadResources(advDir(folder))
		if err != nil {
			fmt.Fprintf(os.Stderr, "%+v\n", err)
		}
		err = downloadVideos(advDir(folder))
		if err != nil {
			fmt.Fprintf(os.Stderr, "%+v\n", err)
		}
	}
}
