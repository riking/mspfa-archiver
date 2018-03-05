package main

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/datatogether/warc"
	"github.com/pkg/errors"
)

type warcRespMeta struct {
	failing      bool
	failedResp   *http.Response
	foundSuccess bool
}

func (g *downloadG) waybackPull404s(info map[string]warcRespMeta) error {
	var list404s []string
	for uri, ok := range g.downloadedURLs {
		if !ok {
			list404s = append(list404s, uri)
		}
	}

	for _, uri := range list404s {
		ok, err := g.waybackAttemptPull(uri)
		fmt.Println(uri, ok, err)
	}

	return nil
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

func (g *downloadG) waybackAttemptPull(uri string) (bool, error) {
	index, err := waybackGetIndex(uri)
	if err != nil {
		return false, err
	}
	/// Find a successful timestamp
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

	retrieveQ := fmt.Sprintf("https://web.archive.org/web/%sif_/%s", targetTimestamp, url.PathEscape(uri))
	for {
		req, err := http.NewRequest("GET", retrieveQ, nil)
		if err != nil {
			return false, errors.Wrapf(err, "wayback %s: parse url", uri)
		}
		resp, err := httpClient.Do(req)
		if err != nil {
			return false, errors.Wrapf(err, "wayback %s: contact archive", uri)
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			fmt.Println("non-200 from wayback, please debug", resp)
			return false, nil
		}
		reqRec, respRec, err := warc.NewRequestResponseRecords(warc.CaptureHelper{}, req, resp)
		if err != nil {
			return false, errors.Wrapf(err, "wayback %s: prepare warc", uri)
		}
		reqRec.Headers[warc.FieldNameWARCTargetURI] = uri
		respRec.Headers[warc.FieldNameWARCTargetURI] = uri
		err = g.warcWriter.WriteRecordsAndCDX(&reqRec, &respRec, resp)
		if err != nil {
			return false, errors.Wrapf(err, "wayback %s: save warc", uri)
		}
		return true, nil
	} // loop for redirects I think
}

// TODO: rewrite cdx?
func (g *downloadG) waybackFind404s() (map[string]warcRespMeta, error) {
	var failingResponses = make(map[string]warcRespMeta)
	relFilename := "resources.warc.gz"
	warcF, err := os.Open(g.dir.File(relFilename))
	if os.IsNotExist(err) {
		return failingResponses, nil
	} else if err != nil {
		return nil, err
	}
	g.cdxWriter.WARCFileName = relFilename
	warcBR := bufio.NewReader(warcF)

	readPos := func() int64 {
		pos_, err := warcF.Seek(0, io.SeekCurrent)
		if err != nil {
			panic(errors.Wrap(err, "writing cdx: reading warc: seek current"))
		}
		return pos_ - int64(warcBR.Buffered())
	}

	var startPos, endPos int64
	startPos = readPos()

	warcR, err := gzip.NewReader(warcBR)
	if err != nil {
		return nil, errors.Wrap(err, "open warc")
	}

	for {
		warcR.Multistream(false)

		record, err := readWARCRecord(warcR)
		if err == io.EOF {
			// empty record
			goto _continue
		} else if err != nil {
			return nil, errors.Wrapf(err, "writing cdx: reading warc\nrecord: %v", record)
		}
		endPos = readPos()

		err = g.processWARCRecord(&record, startPos, endPos, failingResponses)
		if err != nil {
			return nil, errors.Wrapf(err, "writing cdx: process warc\nrecord: %v", record)
		}

	_continue:
		startPos = readPos()
		err = warcR.Reset(warcBR)
		if err == io.EOF {
			break // real EOF
		} else if err != nil {
			return nil, errors.Wrap(err, "writing cdx: reading warc")
		}
	}

	return failingResponses, nil
}

func readWARCRecord(r io.Reader) (warc.Record, error) {
	recReader, err := warc.NewReader(r)
	if err != nil {
		return warc.Record{}, err
	}

	record, err := recReader.Read()
	if err != nil {
		return record, err
	}
	expectNoRecord, expectEOF := recReader.Read()
	if expectEOF != io.EOF {
		fmt.Println("[BUGCHECK] gzip not properly segmented")
		fmt.Println("Already read record:", record.Headers, len(record.Content.Bytes()))
		fmt.Println("Extra read record:", expectNoRecord)
		fmt.Println("Extra read err:", expectEOF)
		os.Exit(3)
	}
	return record, err
}

func (g *downloadG) processWARCRecord(rec *warc.Record, startPos, endPos int64, infoMap map[string]warcRespMeta) error {
	if rec.Type != warc.RecordTypeResponse {
		return nil
	}

	httpB := bufio.NewReader(bytes.NewReader(rec.Content.Bytes()))
	resp, err := http.ReadResponse(httpB, nil)
	if err != nil {
		return errors.Wrap(err, "read response")
	}
	target := rec.Headers.Get("WARC-Target-URI")
	if resp.StatusCode >= 400 {
		fmt.Println("Found failing response for", target, "code", resp.StatusCode)
		_, ok := infoMap[target]
		if !ok {
			infoMap[target] = warcRespMeta{
				failing:    true,
				failedResp: resp,
			}
		}
		g.downloadedURLs[target] = false
	} else {
		existing, ok := infoMap[target]
		if ok {
			fmt.Println("Found later success for", target, "code", resp.StatusCode)
			existing.foundSuccess = true
			infoMap[target] = existing
		}
		g.downloadedURLs[target] = true
	}

	g.cdxWriter.CDXAddRecord(rec, resp, startPos, endPos)
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
