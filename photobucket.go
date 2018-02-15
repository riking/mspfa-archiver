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

func downloadPhotobucket(uri string, dir advDir) error {
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

	destination := toRelativeArchiveURL(uri)
	destFile := dir.File(destination)
	err := os.MkdirAll(filepath.Dir(destFile), 0755)
	if err != nil {
		return errors.Wrapf(err, "error creating output folder")
	}
	exists, err := photobucketFileExists(destFile)
	if err != nil {
		return errors.Wrap(err, "photobucket: check for existing file")
	} else if exists {
		// success: already downloaded
		return nil
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

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			fmt.Println("photobucket: REDIRECT TO", req.URL)
			if strings.HasSuffix(req.URL.Path, "bwe.png") {
				return errPhotobucketBWE
			}
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return errors.Wrapf(err, "downloading %s", uri)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return errors.Errorf("Error code %s downloading %s", resp.Status, uri)
	}
	f, err := os.Create(destFile)
	if err != nil {
		return errors.Wrapf(err, "downloading %s", uri)
	}
	io.Copy(f, resp.Body)
	return errors.Wrapf(f.Close(), "downloading %s", uri)
}

func downloadPhotobucketURLs(dir advDir) error {
	list, err := os.Open(dir.File("photobucket.txt"))
	if os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return errors.Wrap(err, "photobucket")
	}
	sc := bufio.NewScanner(list)

	failed := false
	for sc.Scan() {
		url := sc.Text()
		err = downloadPhotobucket(url, dir)
		if err != nil {
			fmt.Println(err)
			failed = true
			continue
		}
	}
	if sc.Err() != nil {
		return errors.Wrap(err, "photobucket")
	}

	if failed {
		return errors.Wrap(stdErrors.New("Some downloads failed, check log for details"), "photobucket")
	}
	return nil
}
