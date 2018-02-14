package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
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
var authHeader string

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
	authHeader = fmt.Sprintf("LOW %s:%s", auth.AccessKeyID, auth.SecretAccessKey)
	authCreds = auth
}

type archiveFilesXML struct {
	Files []struct {
		FileName   string `xml:"name,attr"`
		FileSource string `xml:"source,attr"`
		// MTime      string `xml:"mtime"`
		Size int64  `xml:"size"`
		MD5  string `xml:"md5"`
		// Sha1 string `xml:"sha1"`
		// Format     string `xml:"format"`
	} `xml:"file"`
	md5index map[string][]byte
}

func (idx *archiveFilesXML) BuildIndex() error {
	index := make(map[string][]byte)
	idx.md5index = index
	for _, v := range idx.Files {
		if v.FileSource == "original" {
			sum, err := hex.DecodeString(v.MD5)
			if err != nil {
				return err
			}
			index[v.FileName] = sum
		}
	}
	return nil
}

// If file does not exist, returns its md5 for use in Content-Md5 header.
func (idx *archiveFilesXML) FileExists(localPath, remotePath string, size int64) (bool, string, error) {
	if idx.md5index == nil {
		panic("Must build index before checking FileExists")
	}

	f, err := os.Open(localPath)
	if err != nil {
		return false, "", err
	}
	defer f.Close()
	h := md5.New()
	if _, err := io.Copy(h, f); err != nil {
		return false, "", err
	}
	sum := h.Sum(nil)
	expect := idx.md5index[remotePath]
	if hmac.Equal(sum, expect) {
		return true, "", nil
	}

	_ = size
	return false, hex.EncodeToString(sum), nil
}

type uploadProgress struct {
	file    string
	err     error
	percent float64
	stage   int
}

var errAlreadyUploaded = errors.Errorf("")

func uploadFile(localPath, remotePath string, idx *archiveFilesXML, headers url.Values, progress chan uploadProgress, wg *sync.WaitGroup) {
	var err error
	defer func() {
		if err == errAlreadyUploaded {
			progress <- uploadProgress{file: remotePath, stage: 5}
		} else if err != nil {
			progress <- uploadProgress{file: remotePath, err: err}
		} else {
			progress <- uploadProgress{file: remotePath, stage: 4}
		}
		wg.Done()
	}()
	err = _uploadFile(localPath, remotePath, idx, headers, progress)
}

func _uploadFile(localPath, remotePath string, idx *archiveFilesXML, headers url.Values, progress chan uploadProgress) error {
	stat, err := os.Stat(localPath)
	if err != nil {
		return errors.Wrap(err, "stat failed, file missing?")
	}
	size := stat.Size()
	exists, md5Hash, err := idx.FileExists(localPath, remotePath, size)
	if err != nil {
		return errors.Wrap(err, "checking hash")
	} else if exists {
		return errAlreadyUploaded
	}

	if size == 0 {
		return nil
	}

	f, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer f.Close()

	uri := fmt.Sprintf("https://s3.us.archive.org/%s/%s", url.PathEscape(*iaIdentifier), url.PathEscape(remotePath))
	req, err := http.NewRequest("PUT", uri, f)
	if err != nil {
		return errors.Wrap(err, "failed to construct new request")
	}

	for k, v := range headers {
		req.Header[k] = v
	}
	req.ContentLength = size

	progress <- uploadProgress{file: remotePath, stage: 1}
	//req = awsauth.Sign(req, authCreds)
	req.Header.Set("Authorization", authHeader)
	req.Header.Set("Content-Md5", md5Hash)
	req.Body = &progressReportingReader{
		ReadCloser: req.Body,
		curSize:    0,
		totalSize:  size,
		name:       remotePath,
		ch:         progress,
		lastReport: time.Now(),
	}
	req.ContentLength = size

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
			percent: float64(pr.curSize) / float64(pr.totalSize),
		}
	}
	return n, err
}

func getFilesXML() (*archiveFilesXML, error) {
	var idx = new(archiveFilesXML)
	defer idx.BuildIndex()

	url := fmt.Sprintf("https://archive.org/download/%s/%s_files.xml", *iaIdentifier, *iaIdentifier)
	resp, err := http.Get(url)
	if err != nil {
		return nil, errors.Wrap(err, "Failed to fetch files.xml")
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		// Item does not exist
		return idx, nil
	}
	if resp.StatusCode != 200 {
		return nil, errors.Errorf("Failed to fetch files.xml: %s: %s", url, resp.Status)
	}

	err = xml.NewDecoder(resp.Body).Decode(idx)
	if err != nil {
		return nil, errors.Wrap(err, "Failed to fetch files.xml")
	}
	return idx, nil
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

	existingIdx, err := getFilesXML()
	if err != nil {
		return err
	}
	if len(existingIdx.Files) > 0 {
		fmt.Println("loaded index of", len(existingIdx.md5index), "existing files")
	}

	var wg sync.WaitGroup
	var wg2 sync.WaitGroup
	ch := make(chan uploadProgress)
	limitCh := make(chan struct{}, 10)
	for i := 0; i < 10; i++ {
		limitCh <- struct{}{}
	}

	wg2.Add(1)
	go func() {
		defer wg2.Done()
		var fileIDs = make(map[string]int)
		var maxFileID = 0
		for p := range ch {
			id, ok := fileIDs[p.file]
			if !ok {
				maxFileID = maxFileID + 1
				id = maxFileID
				fileIDs[p.file] = id
			}
			if p.err != nil {
				fmt.Printf("  [%4d] %s Error: %v\n", id, p.file, p.err)
				limitCh <- struct{}{}
			} else if p.stage == 4 {
				fmt.Printf("  [%4d] %s Complete\n", id, p.file)
				limitCh <- struct{}{}
			} else if p.stage == 5 {
				fmt.Printf("  [%4d] %s Already Uploaded\n", id, p.file)
				limitCh <- struct{}{}
			} else if p.stage == 1 {
				fmt.Printf("  [%4d] %s Uploading...\n", id, p.file)
			} else if p.stage == 2 {
				fmt.Printf("  [%4d] %s Uploading... %2.2f%%\n", id, p.file, p.percent*100)
			}
		}
	}()

	files := [...]string{
		"linked", "videos", "users", "story", "assets",
		"resources.cdx", "resources.warc.gz",
		"cover.png",
		"log.html", "search.html", "view.html",
		"urls.txt", "videos.txt",
	}

	for _, f := range files {
		iterateFolder(dir.File(f), f, func(file, relPath string) error {
			<-limitCh
			wg.Add(1)
			go uploadFile(file, relPath, existingIdx, sharedHeaders, ch, &wg)
			return nil
		})
	}

	wg.Wait()
	close(ch)
	wg2.Wait()
	return nil
}

var tmplDescription = template.Must(template.New("ia-description").Parse(
	`<div>An archival copy of {{.S.Name}} (<a href="https://mspfa.com/?s={{.S.ID}}">https://mspfa.com/?s={{.S.ID}}</a>) as of {{.MonthYear}}.
<div><br>
<div>Start Reading: <a href="https://archive.org/download/{{.Identifier}}/view.html?s={{.S.ID}}&p=1">https://archive.org/download/{{.Identifier}}/view.html?s={{.S.ID}}&p=1</a>
<div><br>
<div>{{.FilterDesc}}`))

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
			fmt.Sprintf("x-archive-meta%03d-%s", n, h)),
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
		err := iterateFolder(dir.File(dirName), dirName, func(file, _ string) error {
			stat, err := os.Stat(file)
			if err != nil {
				return err
			}
			sum += stat.Size()
			return nil
		})
		if err != nil {
			return sum, err
		}
	}
	return sum, nil
}

func iterateFolder(dir, relPath string, cb func(file, relPath string) error) error {
	stat, err := os.Stat(dir)
	if os.IsNotExist(err) {
		fmt.Println("iterateFolder: file does not exist:", relPath)
		return nil
	} else if err != nil {
		return errors.Wrap(err, "iterateFolder")
	}
	if !stat.IsDir() {
		if stat.Mode().IsRegular() {
			return cb(dir, relPath)
		}
	}

	f, err := os.OpenFile(dir, os.O_RDONLY, 0755)
	if err != nil {
		return errors.Wrap(err, "iterateFolder")
	}

	for {
		names, err := f.Readdirnames(dirReadMax)
		if err == io.EOF {
			break
		} else if err != nil {
			return errors.Wrapf(err, "iterateFolder: scanning directory '%s'", dir)
		}

		for _, name := range names {
			file := filepath.Join(dir, name)
			subPath := filepath.Join(relPath, name)

			iterateFolder(file, subPath, cb)
		}
	}
	return nil
}
