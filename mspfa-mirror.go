package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
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

type StoryJSON struct {
	ID          int64         `json:"i"`
	D           float64       `json:"d"`
	Updated     float64       `json:"u"`
	C           string        `json:"c"`
	E           []string      `json:"e"`
	Name        string        `json:"n"`
	Description template.HTML `json:"r"` // contains URLs
	H           float64       `json:"h"`
	Tags        []string      `json:"t"`
	Author      string        `json:"a"`
	AuthorLink  string        `json:"w"` // contains URLs
	Icon        string        `json:"o"` // contains URLs
	B           float64       `json:"b"`
	CSS         template.CSS  `json:"y"` // contains URLs
	J           string        `json:"j"`
	V           string        `json:"v"`
	F           []string      `json:"f"`
	M           string        `json:"m"`
	Pages       []Page        `json:"p"` // contains URLs
	G           []string      `json:"g"`
	K           float64       `json:"k"`
	Q           string        `json:"q"` // contains URLs
	X           string        `json:"x"`
}

type advDir string

func (a advDir) JSONFile() string {
	return filepath.Join(string(a), "adventure.json")
}

func (a advDir) URLsFile() string {
	return filepath.Join(string(a), "urls.txt")
}

func (a advDir) LatestCrawlFile() string {
	return filepath.Join(string(a), "latest_crawl")
}

func (a advDir) File(name string) string {
	return filepath.Join(string(a), name)
}

const stampFormat = "20060102150405"
const userAgent = "MSPFA Archiver/0.8"

func downloadStoryJSON(storyID string, dir advDir) error {
	// wget --post-data "do=story&s=21746" https://mspfa.com/

	_, err := os.Stat(dir.JSONFile())
	if err == nil {
		return nil // already downloaded
	} else if !os.IsNotExist(err) {
		return errors.Wrap(err, "stat adventure json destination")
	}

	absDir, err := filepath.Abs(string(dir))
	if err != nil {
		return errors.Wrap(err, "determining abs path")
	}

	cmd := exec.Command("wget",
		"--post-data", fmt.Sprintf("do=story&s=%s", storyID),
		fmt.Sprintf("--warc-file=%s", filepath.Join(absDir, "adventure")),
		"-O", advDir(absDir).JSONFile(),
		"--warc-header", "operator: MSPFA Archiver Tool",
		"https://mspfa.com/",
	)
	cmd.Dir = string(dir)
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = os.Stderr
	err = cmd.Run()
	return errors.Wrap(err, "wget: download adventure json")
}

func downloadResources(dir advDir) error {
	// ../../wpull --warc-file ../resources --warc-append --warc-cdx --wait 0.1 --page-requisites --tries 3 --retry-connrefused --retry-dns-error --database ../wpull.db --output-file ../wpull-$(date +%s).log --user-agent "MSPFA Archiver/0.8" --span-hosts-allow page-requisites -l 3
	cmd := exec.Command("./wpull",
		"--database", dir.File("wpull.db"),
		"--input-file", dir.URLsFile(),
		"--output-file", dir.File(time.Now().Format("wpull-"+stampFormat+".log")),
		"--user-agent", userAgent,
		"--concurrent", "2",
		"--warc-file", dir.File("resources"),
		"--warc-append", "--warc-cdx",
		"--warc-tempdir", string(dir),
		"--page-requisites",
		// "--span-hosts-allow", "page-requisites",
		"--wait", "0.1",
		"--tries", "3",
		"--retry-connrefused", "--retry-dns-error",
		"-P", dir.File("files"),
		"--exclude-domains", "discordapp.com,youtube.com,mspfa.com",
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

func downloadYouTube(dir advDir) error {
	return nil
}

func scanHTML(desc string, out chan<- string) error {
	tz := html.NewTokenizer(strings.NewReader(desc))
	for {
		tt := tz.Next()
		switch {
		case tt == html.ErrorToken:
			if tz.Err() != io.EOF {
				return tz.Err()
			}
			return nil
		case tt == html.StartTagToken:
			t := tz.Token()

			for _, at := range t.Attr {
				if at.Key == "href" {
					out <- at.Val
				} else if at.Key == "src" {
					out <- at.Val
				}
			}
		}
	}
}

var cssTrimLeft = regexp.MustCompile(`^url\((['"]?)`)

func scanURL(maybeURL string, out chan<- string) {
	_, err := url.Parse(maybeURL)
	if err == nil {
		out <- maybeURL
	}
}

func scanCSS(src template.CSS, out chan<- string) {
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

func scanBBCode(p *Page, out chan<- string) {
	matcher := new(pcre.Matcher)

	for k, rgx := range bbRegex {
		for matcher.ResetString(rgx, p.Body, 0); matcher.Matches(); matcher.Next(0) {
			switch k {
			case "url1", "img1":
				out <- matcher.GroupString(1)
			case "url2":
				out <- matcher.GroupString(2)
			case "img3", "flash3":
				out <- matcher.GroupString(3)
			}
		}
	}

	scanHTML(p.Body, out)
}

func scanURLs(story *StoryJSON, out chan<- string) error {
	for idx := range story.Pages {
		scanBBCode(&story.Pages[idx], out)
	}
	scanHTML(string(story.Description), out)
	scanURL(story.Icon, out)
	scanCSS(story.CSS, out)
	scanURL(story.Q, out)
	scanURL(story.AuthorLink, out)

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

	urlChan := make(chan string)
	var scanErr error
	go func() {
		scanErr = scanURLs(story, urlChan)
		close(urlChan)
	}()

	urlList := make(map[string]struct{})
	videoList := make(map[string]struct{})
	for resource := range urlChan {
		for _, videoStr := range videoURLs {
			if strings.Contains(resource, videoStr) {
				videoList[resource] = struct{}{}
			}
		}
		urlList[resource] = struct{}{}
	}

	writeURLsFile(urlList, videoList, dir)

	return nil
}

func main() {
	outDir := flag.String("o", ".", "Output directory where the archive folders should be created.")
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
			os.Exit(1)
		}
	}
}
