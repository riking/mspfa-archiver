package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"io/ioutil"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pkg/errors"
	"github.com/smartystreets/go-aws-auth"
)

var authCreds awsauth.Credentials

func loadAuthKey() {
	var auth awsauth.Credentials
	f, err := os.Open("ias3.json")
	if err != nil {
		return
	}
	err = json.NewDecoder(f).Decode(&auth)
	if err != nil {
		return
	}
	authCreds = auth
}

type uploadProgress struct {
	file    string
	err     error
	percent float64
	stage   int
}

func uploadFile(localPath, remotePath string, headers url.Values, progress chan uploadProgress, wg *sync.WaitGroup) {
	defer wg.Done()
	err := _uploadFile(localPath, remotePath, headers, progress)
	if err != nil {
		progress <- uploadProgress{file: remotePath, err: err}
	}
}

func _uploadFile(localPath, remotePath string, headers url.Values, progress chan uploadProgress) error {
	stat, err := os.Stat(localPath)
	if err != nil {
		return errors.Wrap(err, "stat failed, file missing?")
	}
	size := stat.Size()
	f, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer f.Close()

	uri := fmt.Sprintf("https://s3.us.archive.org/%s/%s", url.PathEscape(*iaIdentifier), url.PathEscape(remotePath))
	req, err := http.NewRequest("PUT", uri, nil)
	if err != nil {
		return errors.Wrap(err, "failed to construct new request")
	}

	for k, v := range headers {
		req.Header[k] = v
	}
	req.Header.Set("Content-Length", fmt.Sprint(size))

	progress <- uploadProgress{file: remotePath, stage: 1}
	req = awsauth.SignS3(req, authCreds)
	req.Body = &progressReportingReader{
		ReadCloser: req.Body,
		curSize:    0,
		totalSize:  size,
		name:       remotePath,
		ch:         progress,
		lastReport: time.Now(),
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return errors.Wrap(err, "failed to upload")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return errors.Errorf("status code %s", resp.Status)
	}
	progress <- uploadProgress{file: remotePath, stage: 3}
	io.Copy(ioutil.Discard, resp.Body)
	progress <- uploadProgress{file: remotePath, stage: 4}
	return nil
}

type progressReportingReader struct {
	io.ReadCloser
	curSize    int64
	totalSize  int64
	name       string
	ch         chan uploadProgress
	lastReport time.Time
}

// implements io.Reader
func (pr *progressReportingReader) Read(p []byte) (n int, err error) {
	n, err = pr.ReadCloser.Read(p)
	pr.curSize += int64(n)
	if time.Now().Add(-500 * time.Millisecond).After(pr.lastReport) {
		pr.ch <- uploadProgress{
			stage:   2,
			file:    pr.name,
			percent: float64(pr.totalSize) / float64(pr.curSize),
		}
	}
	return n, err
}

func uploadItem(story *StoryJSON, dir advDir) error {
	sharedHeaders := calculateArchiveMetadata(story, dir)
	sharedHeaders.Set("User-Agent", userAgent)
	sizeSum, err := sumItemSize(dir)
	if err != nil {
		return err
	}
	sharedHeaders.Set("X-Archive-Size-Hint", fmt.Sprint(sizeSum))
	sharedHeaders.Set("X-Amz-Auto-Make-Bucket", "1")

	var wg sync.WaitGroup
	wg.Add(1)
	ch := make(chan uploadProgress)
	defer close(ch)
	go func() {
		for p := range ch {
			if p.err != nil {
				fmt.Printf("  [%s] %v\n", p.file, p.err)
			} else if p.stage == 2 {
				fmt.Printf("  [%s] Uploading.. %2.2f\n", p.file, p.percent)
			} else if p.stage == 4 {
				fmt.Printf("  [%s] Complete\n", p.file)
			}
		}
	}()

	relName := fmt.Sprintf("story/%s.json", story.ID)
	go uploadFile(dir.File(relName), relName, sharedHeaders, ch, &wg)
	wg.Wait()
	// TODO
	return nil
}

var tmplDescription = template.Must(template.New("ia-description").Parse(
	`<div>An archival copy of {{.S.Name}} (<a href="https://mspfa.com/?s={{.S.ID}}">https://mspfa.com/?s={{.S.ID}}</a>) as of {{.MonthYear}}.</div>
<div><br></div>
<div>Start Reading: <a href="https://archive.org/download/{{.Identifier}}/view.html?s={{.S.ID}}&p=1">https://archive.org/download/{{.Identifier}}/view.html?s={{.S.ID}}&p=1</a></div>
<div><br></div>
<div>{{.FilterDesc}}</div>`))

func calculateArchiveMetadata(story *StoryJSON, dir advDir) url.Values {
	if *iaIdentifier == "" {
		return nil // skip
	}

	var headers = url.Values{}
	var counts = make(map[string]int)
	setHdr := func(h, v string) {
		headers.Set(textproto.CanonicalMIMEHeaderKey(
			fmt.Sprintf("x-archive-meta-%s", h)),
			fmt.Sprintf("uri(%s)", url.PathEscape(v)))
	}
	addHdr := func(h, v string) {
		n := counts[h] + 1
		counts[h] = n
		headers.Set(textproto.CanonicalMIMEHeaderKey(
			fmt.Sprintf("x-archive-meta%3d-%s", n, h)),
			fmt.Sprintf("uri(%s)", url.PathEscape(v)))
	}

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
				// extraFiles = append(extraFiles, toRelativeArchiveURL(s))
			}),
			S: story,
		}
		err := tmplDescription.Execute(&buf, dataDesc)
		if err != nil {
			panic(err)
		}
		setHdr("description", buf.String())
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
		setHdr("date", newestPageDate.Format("2006-01-02"))
		setHdr("title", fmt.Sprintf("MSPFA Archive - %s", story.Name))
	}
	addHdr("collection", "opensource_media")
	addHdr("collection", "test_collection") // TEST
	setHdr("mediatype", "texts")
	addHdr("subject", "mspfa")
	setHdr("publisher", "MS Paint Fan Adventures")
	setHdr("mspfa-id", fmt.Sprint(story.ID))
	setHdr("scanner", userAgent)
	{
		var authors []string
		for _, au := range strings.Split(story.Author, ",") {
			authors = append(authors, strings.TrimSpace(au))
		}
		for _, u := range story.Mirroring {
			user, err := downloadUserJSON(u, dir)
			if err != nil {
				panic(err)
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
		for _, au := range authors {
			addHdr("creator", au)
		}
	}

	return headers
}

const dirReadMax = 500

func sumItemSize(dir advDir) (int64, error) {
	var sum int64
	for _, dirName := range [...]string{"linked", "videos", "users", "assets", "story"} {
		subsum, err := sumFileSize(dir.File(dirName))
		sum += subsum
		if err != nil {
			return sum, err
		}
	}
	return sum, nil
}

func sumFileSize(dir string) (int64, error) {
	f, err := os.OpenFile(dir, os.O_RDONLY, 0755)
	if err != nil {
		return 0, errors.Wrapf(err, "sizescan: open directory '%s'", dir)
	}

	var sum int64

	for {
		names, err := f.Readdirnames(dirReadMax)
		if err == io.EOF {
			break
		} else if err != nil {
			return sum, errors.Wrapf(err, "sizescan: scanning directory '%s'", dir)
		}

		for _, name := range names {
			filename := filepath.Join(dir, name)
			stat, err := os.Stat(filename)
			if err != nil {
				return sum, errors.Wrapf(err, "sizescan: stat '%s'", filename)
			}
			m := stat.Mode()
			if m.IsDir() {
				subsize, err := sumFileSize(filename)
				sum += subsize
				if err != nil {
					return sum, err
				}
			} else if m.IsRegular() {
				subsize := stat.Size()
				sum += subsize
			}
		}
		// loop Readdirnames
	}
	return sum, nil
}
