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

func waybackPull404s(wr *warcWriter, info map[string]warcRespMeta, dir advDir) error {

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
func waybackFind404s(cdxWriter *cdxWriter, dir advDir) (map[string]warcRespMeta, error) {
	warcF, err := os.Open(dir.File("resources.warc.gz"))
	if err != nil {
		return nil, err
	}
	warcBR := bufio.NewReader(warcF)
	warcR, err := gzip.NewReader(warcBR)
	if err != nil {
		return nil, errors.Wrap(err, "open warc")
	}

	readPos := func() int64 {
		pos_, err := warcF.Seek(0, io.SeekCurrent)
		if err != nil {
			panic(errors.Wrap(err, "writing cdx: reading warc: seek current"))
		}
		return pos_ - int64(warcBR.Buffered())
	}

	var failingResponses = make(map[string]warcRespMeta)
	var startPos, endPos int64
	for {
		warcR.Multistream(false)

		startPos = readPos()
		record, err := readWARCRecord(warcR)
		if err == io.EOF {
			goto _continue
		} else if err != nil {
			return nil, errors.Wrapf(err, "writing cdx: reading warc\nrecord: %v", record)
		}
		endPos = readPos()

		fmt.Println("processing warc record", record.Headers[warc.FieldNameWARCRecordID])
		err = processWARCRecord(&record, cdxWriter, startPos, endPos, failingResponses)
		if err != nil {
			return nil, errors.Wrapf(err, "writing cdx: process warc\nrecord: %v", record)
		}

	_continue:
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

func processWARCRecord(rec *warc.Record, cdxWriter *cdxWriter, startPos, endPos int64, infoMap map[string]warcRespMeta) error {
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
	} else {
		existing, ok := infoMap[target]
		if ok {
			fmt.Println("Found later success for", target, "code", resp.StatusCode)
			existing.foundSuccess = true
			infoMap[target] = existing
		}
	}

	cdxWriter.CDXAddRecord(rec, resp, startPos, endPos)
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
