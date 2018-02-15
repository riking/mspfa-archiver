package main

import (
	"bytes"
	"encoding/base64"
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
	errPhotobucketBWE    = errors.Errorf("photobucket: bandwidth exceeded, wait 6 hours and try again")
)

func getPhotobucketMediaID(filename string) string {
	var buf bytes.Buffer
	enc := base64.NewEncoder(base64.StdEncoding, &buf)
	enc.Write([]byte("path:"))
	enc.Write([]byte(filename))
	enc.Close()
	return buf.String()
}

func downloadPhotobucket(uri string, dir advDir) error {
	fmt.Println("Downloading", uri)

	match := photobucketDirectRgx.FindStringSubmatch(uri)
	if match == nil {
		return errors.Errorf("Failed to match photobucket direct regex against '%s'", uri)
	}
	// key, err := url.QueryUnescape(match[1])
	// if err != nil {
	// return errors.Wrapf(err, "Bad URL escaping in '%s'", uri)
	// }
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

	req, err := http.NewRequest("GET", uri, nil)
	if err != nil {
		return errors.Wrapf(err, "downloading %s", uri)
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
