package main

import (
	"bufio"
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	stdErrors "errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/datatogether/warc"
	"github.com/pkg/errors"
)

var (
	// match groups: key, album, username, filename
	photobucketDirectRgx = regexp.MustCompile(`img\.photobucket\.com\/(albums\/([\w\-]+)\/([\w\-]+)\/(.*))`)
	// match groups: key, album, username, filename
	photobucketDirectHTMLRgx = regexp.MustCompile(`\w*\.photobucket\.com\/(albums\/([\w\-]+)\/([\w\-]+)\/(.*))`)
	errPhotobucketBWE        = stdErrors.New("photobucket: bandwidth exceeded, wait 6 hours and try again")
	bweSHA1, _               = hex.DecodeString("ec057900112e21a3147b2cc422bac00675fbf1c0")
)

func getPhotobucketMediaID(filename string) string {
	var buf bytes.Buffer
	enc := base64.NewEncoder(base64.StdEncoding, &buf)
	enc.Write([]byte("path:"))
	enc.Write([]byte(filename))
	enc.Close()
	return buf.String()
}

// Check if the destination file exists, with an additional check that if it's
// bwe.png, delete it.
func photobucketFileExists(destFile string) (bool, error) {
	stat, err := os.Stat(destFile)
	if os.IsNotExist(err) {
		return false, nil
	} else if err != nil {
		return false, errors.Wrapf(err, "error checking output file")
	} else {
		// File exists
		if stat.Size() == 8334 {
			// but it's a bwe. Confirm with sha256
			h := sha1.New()
			f, err := os.Open(destFile)
			if err != nil {
				return false, errors.Wrapf(err, "error checking output file")
			}
			n, err := io.Copy(h, f)
			if err != nil {
				return false, errors.Wrapf(err, "error checking output file")
			} else if n != 8334 {
				return false, errors.Errorf("Didn't copy right number of bytes!?!? File size %d copied %d", 8334, n)
			}
			sha := h.Sum(nil)
			if hmac.Equal(sha, bweSHA1) {
				fmt.Println("photobucket: found downloaded copy of bwe.png")
				os.Remove(destFile)
				return false, nil
			}
			// oops it was just a size match, we have the actual photo
		}
		return true, nil
	}
}

func (g *downloadG) downloadPhotobucket(uri string, httpClient *http.Client) error {
	match := photobucketDirectRgx.FindStringSubmatch(uri)
	if match == nil {
		match = photobucketDirectHTMLRgx.FindStringSubmatch(uri)
	}
	if match == nil {
		return errors.Errorf("Failed to match photobucket direct regex against '%s'", uri)
	}
	// album := match[2]
	username := match[3]
	filename := match[4]
	mediaID := getPhotobucketMediaID(filename)

	// fixups
	if strings.HasSuffix(filename, ".pn") {
		filename = filename + "g"
		uri = uri + "g"
	}

	destination := toRelativeArchiveURL(uri)
	destFile := g.dir.File(destination)
	err := os.MkdirAll(filepath.Dir(destFile), 0755)
	if err != nil {
		return errors.Wrapf(err, "error creating output folder")
	}

	fmt.Println("Downloading", uri)
	req, err := http.NewRequest("GET", uri, nil)
	if err != nil {
		return errors.Wrapf(err, "photobucket: downloading %s", uri)
	}

	req.Header.Set("Accept", "image/webp,image/*,*/*;q=0.8")
	req.Header.Set("Referer", fmt.Sprintf("http://photobucket.com/gallery/user/%s/media/%s", username, mediaID))
	// chrome on iOS "request as desktop" user-agent
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_4) AppleWebKit/600.7.12 (KHTML, like Gecko) Version/8.0.7 Safari/600.7.12")

	//shadow-ignore: httpClient
	resp, err := httpClient.Do(req)
	if err != nil {
		return errors.Wrapf(err, "downloading %s", uri)
	}
	defer resp.Body.Close()

	// not bothering to capture remote-IP right now
	captureHelper := warc.CaptureHelper{}

	if resp.StatusCode != 200 {
		return errors.Errorf("Error code %s downloading %s", resp.Status, uri)
	}

	reqRec, respRec, err := warc.NewRequestResponseRecords(captureHelper, req, resp)
	if err != nil {
		return errors.Wrapf(err, "photobucket: warc prep %s", uri)
	}
	err = g.warcWriter.WriteRecordsAndCDX(&reqRec, &respRec, resp)
	if err != nil {
		return errors.Wrapf(err, "photobucket: warc saving %s", uri)
	}
	return nil
}

func (g *downloadG) photobucketInfoRecord(uriList []string) error {
	rec := &warc.Record{
		Format:  warc.RecordFormatWarc,
		Type:    warc.RecordTypeWarcInfo,
		Headers: make(warc.Header),
		Content: new(bytes.Buffer),
	}
	// rec.SetDate()
	rec.Headers[warc.FieldNameWARCDate] = time.Now().Format(warc.TimeFormat)
	id := warc.NewUUID()
	rec.Headers[warc.FieldNameWARCRecordID] = id
	rec.Headers[warc.FieldNameWARCWarcinfoID] = id
	rec.Headers[warc.FieldNameContentType] = "application/warc-fields"

	values := make(http.Header)
	values.Set("Software", userAgent)
	values.Set("Format", "WARC File Format 1.0")
	values.Set("Conformsto", "http://bibnum.bnf.fr/WARC/WARC_ISO_28500_version1_latestdraft.pdf")
	values.Set("Download-Stage", "photobucket")
	for _, uri := range uriList {
		values.Add("Photobucket-Url", uri)
	}
	values.Write(rec.Content)
	rec.Headers[warc.FieldNameWARCBlockDigest] = warc.Sha1Digest(rec.Content.Bytes())

	fmt.Printf("%s\n", rec.Content)
	rec.Write(os.Stderr)
	return errors.Wrap(g.warcWriter.WriteWarcinfo(rec), "photobucket: warcinfo record")
}

func (g *downloadG) downloadPhotobucketURLs() error {
	list, err := os.Open(g.dir.File("photobucket.txt"))
	if os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return errors.Wrap(err, "photobucket")
	}
	sc := bufio.NewScanner(list)

	// Error out on redirects
	pbClient := new(http.Client)
	*pbClient = *httpClient
	pbClient.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		fmt.Println("photobucket: REDIRECT TO", req.URL)
		if strings.HasSuffix(req.URL.Path, "bwe.png") {
			return errPhotobucketBWE
		}
		return http.ErrUseLastResponse
	}

	var uriList []string

	failed := false
	for sc.Scan() {
		uri := sc.Text()
		if g.downloadedURLs[uri] {
			// success: already downloaded
			continue
		}
		uriList = append(uriList, uri)
	}
	if sc.Err() != nil {
		return errors.Wrap(err, "photobucket.txt")
	}
	if len(uriList) == 0 {
		// Nothing to do
		return nil
	}

	err = g.photobucketInfoRecord(uriList)
	if err != nil {
		return err
	}
	defer func() {
		g.warcWriter.WARCInfoID = ""
	}()
	for _, uri := range uriList {
		err = g.downloadPhotobucket(uri, pbClient)
		if err != nil {
			g.downloadedURLs[uri] = false
			fmt.Println(err)
			failed = true
			continue
		}
		g.downloadedURLs[uri] = true
	}

	if failed {
		return errors.Wrap(stdErrors.New("Some downloads failed, check log for details"), "photobucket")
	}
	return nil
}
