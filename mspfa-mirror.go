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
// need:

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
	Q         string        `json:"q"` // contains URLs
	X         string        `json:"x"`

	// used by template
	footerImages string `json:"-"`
}

type RscType int

const (
	tLink RscType = iota
	tSrc
	tVideo
)

// Rsc is an adventure resource.
type Rsc struct {
	// URL
	U    string
	Type RscType
}

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

func getStoryJSON(storyID string, dir advDir) (*StoryJSON, error) {
	stat, err := os.Stat(dir.File("adventure.json"))
	if err != nil {
		t := stat.ModTime()
		if *forceAdvUpdate || t.Before(time.Now().Add(24*7*time.Hour)) {
			_ = downloadStoryJSON(storyID, dir)
		}

		// exists
	} else {
		err = downloadStoryJSON(storyID, dir)
		if err != nil {
			return nil, err
		}
	}
	f, err := os.Open(dir.File("adventure.json"))
	if err != nil {
		return nil, errors.Wrap(err, "read adventure.json")
	}
	dec := json.NewDecoder(f)
	// dec.DisallowUnknownFields() // Go 1.10
	var story *StoryJSON
	err = dec.Decode(&story)
	if err != nil {
		return nil, errors.Wrap(err, "adventure.json decode error")
	}
	return story, nil
}

func downloadStoryJSON(storyID string, dir advDir) error {
	// wget --post-data "do=story&s=21746" https://mspfa.com/
	form := url.Values{}
	form.Set("do", "story")
	form.Set("s", storyID)
	resp, err := http.PostForm("https://mspfa.com/", form)
	if err != nil {
		return errors.Wrapf(err, "get story %s", storyID)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		by, _ := ioutil.ReadAll(resp.Body)
		return errors.Errorf("get story %s: response code %s: %s", storyID, resp.Status, by)
	}

	f, err := os.Create(dir.File("adventure.json"))
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	if err != nil {
		return errors.Wrapf(err, "get story %s", storyID)
	}
	return f.Close()
}

func downloadUserJSON(userID string, dir advDir) error {
	// wget --post-data "do=user&u=1234456789"

	os.Mkdir(dir.File("users"), 0755)
	f, err := os.Create(dir.File(fmt.Sprintf("users/%s.json", userID)))
	if err != nil {
		return err
	}
	defer f.Close()
	form := url.Values{}
	form.Set("do", "user")
	form.Set("u", userID)
	resp, err := http.PostForm("https://mspfa.com/", form)
	if err != nil {
		return errors.Wrapf(err, "get user %s", userID)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		by, _ := ioutil.ReadAll(resp.Body)
		return errors.Errorf("get user %s: response code %s: %s", userID, resp.Status, by)
	}

	_, err = io.Copy(f, resp.Body)
	if err != nil {
		return errors.Wrapf(err, "get user %s", userID)
	}
	return nil
}

func downloadResources(dir advDir) error {
	os.MkdirAll(dir.File("files"), 0755)

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
		"-P", dir.File("files"),
		"--exclude-domains", "discordapp.com,youtube.com,assets.tumblr.com,mspfa.com",
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

func downloadVideo(uri string, dir advDir) error {
	parsed, err := url.Parse(uri)
	if err != nil {
		return err
	}

	cmd := exec.Command("youtube-dl",
		"-o", dir.File("videos/"+parsed.Host+"/%(id)s.%(format_id)s.%(ext)s"),
		// "-k", // keep bestvideo/bestaudio fragments
		"-r", "3M",
		"-f", "bestvideo+bestaudio/best,bestvideo[height<=480]+bestaudio/best[height<=480]",
		"--http-chunk-size", "3M",
		uri,
	)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
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
func toArchiveURL(up string) string {
	u, err := url.Parse(up)
	if err != nil {
		return up
	}
	if u.RawQuery == "" {
		return fmt.Sprintf("./files/%s%s", u.Host, u.Path)
	}
	return fmt.Sprintf("./files/%s%s?%s", u.Host, u.Path, u.RawQuery)
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
		return toArchiveURL(sj.Icon)
	}
	return "./assets/wat/wat.njs." + strconv.Itoa(rand.New(rand.NewSource(sj.ID)).Intn(4))
}

func (sj *StoryJSON) FooterImages() string {
	return sj.footerImages
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
	story.footerImages = choices.String()
	fmt.Println(story.footerImages)
	wg.Wait()

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

var cssTrimLeft = regexp.MustCompile(`^url\((['"]?)`)

func scanURL(maybeURL string, out chan<- Rsc) {
	if maybeURL == "" {
		return
	}

	u, err := url.Parse(maybeURL)
	if err == nil {
		if u.Host == "" {
			return
		}
		out <- Rsc{U: maybeURL}
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
			scanURL(matched, out)
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

func scanURLs(story *StoryJSON, out chan<- Rsc) error {
	for idx := range story.Pages {
		scanBBCode(&story.Pages[idx], out)
	}
	scanHTML(string(story.Desc), out)
	if strings.HasPrefix(story.Icon, "/images") {
		u, err := url.Parse(story.Icon)
		if err != nil {
			return err
		}
		u = u.ResolveReference(mspfaBaseURL)
		out <- Rsc{U: u.String(), Type: tSrc}
	} else {
		scanURL(story.Icon, out)
	}
	scanCSS(story.CSS, out)
	scanURL(story.Q, out)
	scanURL(story.AuthLink, out)

	return nil
}

func readStoryJSON(dir advDir) (*StoryJSON, error) {
	f, err := os.Open(dir.JSONFile())
	if err != nil {
		return nil, errors.Wrap(err, "adventure.json does not exist")
	}

	dec := json.NewDecoder(f)
	// dec.DisallowUnknownFields() // Go 1.10
	var out *StoryJSON
	err = dec.Decode(&out)
	if err != nil {
		return nil, errors.Wrap(err, "adventure.json decode error")
	}
	return out, nil
}

func writeURLsFile(urlList, videoList map[string]struct{}, dir advDir) error {
	urls := make([]string, 0, len(urlList))
	for link := range urlList {
		_, isVideo := videoList[link]
		if !isVideo {
			urls = append(urls, link)
		}
	}
	videos := make([]string, 0, len(videoList))
	for link := range videoList {
		videos = append(videos, link)
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

func archiveStory(storyID string, dir advDir) error {
	err := downloadStoryJSON(storyID, dir)
	if err != nil {
		return err
	}

	story, err := readStoryJSON(dir)
	if err != nil {
		return err
	}

	urlChan := make(chan Rsc)
	var scanErr error
	go func() {
		scanErr = scanURLs(story, urlChan)
		close(urlChan)
	}()

	resourceList := make(map[Rsc]struct{})
	for resource := range urlChan {
		u, err := url.Parse(resource.U)
		if err != nil {
			fmt.Println(resource, err)
			continue
		}
		isVideo := false
		if resource.Type == tLink {
			for _, videoStr := range videoURLs {
				if strings.Contains(resource.U, videoStr) {
					resource.Type = tVideo
				}
			}
			// Do not download internal links
			if u.Host == "mspfa.com" {
				continue
			}
		}

		resourceList[resource] = struct{}{}
	}

	writeURLsFile(urlList, videoList, dir)

	err = copyAssets(story, dir)
	if err != nil {
		return err
	}

	return nil
}

var tmplDescription = template.Must(template.New("ia-description").Parse(
	`<div>An archival copy of {{.S.Title}} (<a href="https://mspfa.com/?s={{.S.ID}}">https://mspfa.com/?s={{.S.ID}}</a>) as of {{.MonthYear}}.</div>
<div><br></div>
<div>Start Reading: <a href="https://archive.org/download/{{.Identifier}}/view.html?s={{.S.ID}}&p=1">https://archive.org/download/{{.Identifier}}/view.html?s={{.S.ID}}&p=1</a><</div>
<div><br></div>
<div>{{.S.Desc}}</div>`))

func writeMetadataCSV(story *StoryJSON, dir advDir) error {
	f, err := os.Create(dir.File("ia-upload-view.csv"))
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	headers := []string{"identifier", "file"}

	var metaFields map[string]string

	var buf bytes.Buffer
	var dataDesc = struct {
		Identifier string
		MonthYear  string
		S          *StoryJSON
	}{
		Identifier: *iaIdentifier,
		MonthYear:  time.Now().Format("2006-01"),
		S:          story,
	}
	err = tmplDescription.Execute(&buf, dataDesc)
	if err != nil {
		return err
	}
	metaFields["description"] = buf.String()

}

func writeUploadFilesCSV(dir advDir) error {
	f, err := os.Create(dir.File("ia-upload-files.csv"))
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	w.Write([]string{"identifier", "file"})
}

var iaIdentifier = flag.String("ident", "", "Internet Archive item identifier")
var forceAdvUpdate = flag.Bool("f", false, "Force update of adventure.json")

func main() {
	outDir := flag.String("o", "./target", "Output directory where the archive folders should be created.")
	download := flag.Bool("dl", false, "Download files instead of just listing them")

	flag.Parse()

	if flag.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "Usage: mspfa-mirror [adventure ID]\n"+
			"  Downloads the adventure.json and all images of a MSPFA adventure.")
		flag.PrintDefaults()
	}

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

	err = archiveStory(storyID, advDir(folder))
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
