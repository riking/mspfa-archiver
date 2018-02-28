package main

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/pkg/errors"
)

type warcRespMeta struct {
	failing      bool
	failedResp   *http.Response
	foundSuccess bool
}

func waybackPull404s(dir advDir) error {
	info, err := waybackFind404s(dir.File("resources.warc.gz"))
	if err != nil {
		return err
	}

	// wr := prepareWARCWriter(dir)

	for k, v := range info {
		if v.foundSuccess {
			continue
		}

		ok, err := waybackAttemptPull(k)
		fmt.Println(k, ok, err)
	}

	return nil
}

func waybackAttemptPull(uri string /*, wr WriteFlusher*/) (bool, error) {
	index, err := waybackGetIndex(uri)
	if err != nil {
		return false, err
	}
	// urlkey, timestamp, original_url, mimetype, statuscode, chksum, length
	var targetTimestamp string
	for _, fields := range index {
		statusCode, err := strconv.Atoi(fields[4])
		if err != nil {
			fmt.Println("error status code not int", fields[4])
			continue
		}
		if 200 <= statusCode && statusCode <= 399 {
			// success (?)
			// need to filter bwe...
			targetTimestamp = fields[1]
			break
		}
	}
	if targetTimestamp == "" {
		return false, nil // not found
	}

	retrieveQ := fmt.Sprintf("https://web.archive.org/web/%s/%s", targetTimestamp, url.PathEscape(uri))
	resp, err := http.Get(retrieveQ)
	if err != nil {
		return false, errors.Wrap(err, "contact archive")
	}
	fmt.Println(retrieveQ, resp.Status)
	resp.Body.Close()
	return true, nil
}

func waybackGetIndex(uri string) ([][]string, error) {
	apiQ := fmt.Sprintf("https://web.archive.org/cdx/search/cdx?url=%s&limit=50&matchType=exact",
		url.QueryEscape(uri),
	)
	resp, err := http.Get(apiQ) // TODO custom client
	if err != nil {
		return nil, errors.Wrap(err, "contact archive")
	}
	defer resp.Body.Close()
	var records [][]string
	sc := bufio.NewScanner(resp.Body)
	for sc.Scan() {
		records = append(records, strings.Fields(sc.Text()))
	}
	return records, errors.Wrap(sc.Err(), "read archive cdx")
}

// TODO: rewrite cdx?
func waybackFind404s(filename string) (map[string]warcRespMeta, error) {
	warcGZ, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	warc, err := gzip.NewReader(warcGZ)
	if err != nil {
		return nil, errors.Wrapf(err, "find 404s %s", filename)
	}
	bufr := bufio.NewReader(warc)
	textp := textproto.NewReader(bufr)

	var failingResponses = make(map[string]warcRespMeta)
	for {
		err = checkWARCEntry(bufr, textp, failingResponses)
		if err == io.EOF {
			fmt.Println("got eof")
			break
		} else if err != nil {
			fmt.Println("got err", err)
			return nil, err
		}
	}

	return failingResponses, nil
}

func checkWARCEntry(bufr *bufio.Reader, textp *textproto.Reader, infoMap map[string]warcRespMeta) error {
	warcProtoLine, err := textp.ReadLine()
	for err == nil && warcProtoLine == "" {
		// skip empty lines
		warcProtoLine, err = textp.ReadLine()
	}
	if err == io.EOF {
		return err
	} else if err != nil {
		return errors.Wrap(err, "read WARC header")
	}
	if !strings.HasPrefix(warcProtoLine, "WARC/") {
		return errors.Errorf("bad WARC header, got %s", warcProtoLine)
	}
	warcHeader, err := textp.ReadMIMEHeader()
	if err != nil {
		return errors.Wrap(err, "read WARC header")
	}
	recordType := warcHeader.Get("WARC-Type")
	contentLength := warcHeader.Get("Content-Length")
	length, err := strconv.Atoi(contentLength)
	if err != nil {
		return errors.Wrap(err, "read content length")
	}
	switch recordType {
	case "warcinfo", "request", "resource", "metadata", "revisit", "conversion", "continuation":
		bufr.Discard(length)
	case "response":
		httpContent := make([]byte, length)
		io.ReadFull(bufr, httpContent)
		httpB := bufio.NewReader(bytes.NewReader(httpContent))
		resp, err := http.ReadResponse(httpB, nil)
		if err != nil {
			return errors.Wrap(err, "read response")
		}
		target := warcHeader.Get("WARC-Target-URI")
		if resp.StatusCode >= 400 {
			fmt.Println("Found failing response for", target, "code", resp.StatusCode)
			_, ok := infoMap[target]
			if !ok {
				infoMap[target] = warcRespMeta{
					failing:    true,
					failedResp: resp,
				}
			}
		} else {
			existing, ok := infoMap[target]
			if ok {
				fmt.Println("Found later success for", target, "code", resp.StatusCode)
				existing.foundSuccess = true
				infoMap[target] = existing
			}
		}
	}
	return nil
}

// parseRequestLine parses "GET /foo HTTP/1.1" into its three parts.
func parseRequestLine(line string) (method, requestURI, proto string, ok bool) {
	s1 := strings.Index(line, " ")
	s2 := strings.Index(line[s1+1:], " ")
	if s1 < 0 || s2 < 0 {
		return
	}
	s2 += s1 + 1
	return line[:s1], line[s1+1 : s2], line[s2+1:], true
}
