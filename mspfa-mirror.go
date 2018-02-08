package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"

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
	W           string        `json:"w"`
	Icon        string        `json:"o"` // contains URLs
	B           float64       `json:"b"`
	Y           template.CSS  `json:"y"` // contains URLs
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

func downloadStoryJSON(storyID string, dir advDir) error {
	// wget --post-data "do=story&s=21746" https://mspfa.com/

	absDir, err := filepath.Abs(string(dir))
	if err != nil {
		return errors.Wrap(err, "determining abs path")
	}

	cmd := exec.Command("wget",
		"--post-data", fmt.Sprintf("do=story&s=%s", storyID),
		fmt.Sprintf("--warc-file=%s", filepath.Join(absDir, "adventure")),
		"-O", advDir(absDir).JSONFile(),
		"--warc-header", "MSPFA Archiver Tool",
	)
	cmd.Dir = string(dir)
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	err = cmd.Run()
	return errors.Wrap(err, "wget: download adventure json")
}

func htmlScanURLs(tz *html.Tokenizer, out chan<- string) {
	for {
		tt := tz.Next()
		switch {
		case tt == html.ErrorToken:
			return
		case tt == html.StartTagToken:
			t := tz.Token()

			for _, a := range t.Attr {
				if a.Key == "href" {
					// Description typically has external links
					// out <- a.Val
				} else if a.Key == "src" {
					out <- a.Val
				}
			}
		}
	}
}

var bbRegex = map[string]*regexp.Regexp{
	// Taken directly from MSPFA source
	"url1":   regexp.MustCompile(`\[url\]([^"]*?)\[/url\]`),
	"url2":   regexp.MustCompile(`\[url=("?)([^"]*?)\1\]((?:(?!\[url(?:=.*?)\]).)*?)\[/url\]`),
	"img1":   regexp.MustCompile(`\[img\]([^"]*?)\[/img\]`),
	"img3":   regexp.MustCompile(`\[img=(\d*?)x(\d*?)\]([^"]*?)\[/img\]`),
	"flash3": regexp.MustCompile(`\[flash=(\d*?)x(\d*?)\](.*?)\[\/flash\]`),
}

func scanBBCode(p *Page, out chan<- string) {
	for k, rgx := range bbRegex {
		m := rgx.FindAllStringSubmatch(p.Body, -1)
		for _, match := range m {
			switch k {
			case "url1", "img1":
				out <- match[1]
			case "img2":
				out <- match[2]
			case "img3", "flash3":
				out <- match[3]
			}
		}
	}
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

func archiveStory(storyID string, dir advDir) error {
	// err := downloadStoryJSON(storyID, dir)
	// if err != nil {
	// return err
	// }

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

	for url := range urlChan {
		fmt.Println(url)
	}
	if scanErr != nil {
		fmt.Println("Error while URL scanning:", scanErr)
	}
}

func main() {
	outDir := flag.String("o", ".", "Output directory where the archive folders should be created.")

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
}
