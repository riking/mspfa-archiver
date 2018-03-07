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
	"time"

	"github.com/datatogether/warc"
	"github.com/pkg/errors"
)

type warcRespMeta struct {
	failing      bool
	failedResp   *http.Response
	foundSuccess bool
}

func (g *downloadG) waybackWriteWarcinfo(uriList []string) error {
	rec := &warc.Record{
		Format:  warc.RecordFormatWarc,
		Type:    warc.RecordTypeWarcInfo,
		Headers: make(warc.Header),
		Content: new(bytes.Buffer),
	}
	rec.Headers[warc.FieldNameWARCDate] = time.Now().Format(warc.TimeFormat)
	id := warc.NewUUID()
	rec.Headers[warc.FieldNameWARCRecordID] = id
	rec.Headers[warc.FieldNameWARCWarcinfoID] = id
	rec.Headers[warc.FieldNameContentType] = "application/warc-fields"

	values := make(http.Header)
	values.Set("Software", userAgent)
	values.Set("Format", "WARC File Format 1.0")
	values.Set("Conformsto", "http://bibnum.bnf.fr/WARC/WARC_ISO_28500_version1_latestdraft.pdf")
	values.Set("Download-Stage", "wayback-rescue")
	for _, uri := range uriList {
		values.Add("Target-Url", uri)
	}
	values.Write(rec.Content)
	rec.Headers[warc.FieldNameWARCBlockDigest] = warc.Sha1Digest(rec.Content.Bytes())

	return errors.Wrap(g.warcWriter.WriteWarcinfo(rec), "wayback: warcinfo record")
}

func (g *downloadG) waybackPull404s(info map[string]warcRespMeta) (int, error) {
	var list404s []string
	for uri, ok := range g.downloadedURLs {
		if !ok {
			list404s = append(list404s, uri)
		}
	}
	if len(list404s) == 0 {
		return 0, nil
	}

	g.waybackWriteWarcinfo(list404s)
	var log bytes.Buffer
	numFailed := 0
	logPut := io.MultiWriter(&log, os.Stdout)

	fmt.Fprintf(logPut, "%s Starting attempt to retrieve %d URLs\n", time.Now().UTC().Format(time.RFC3339), len(list404s))
	for _, uri := range list404s {
		ok, err := g.waybackAttemptPull(logPut, uri)
		if err != nil {
			fmt.Fprintf(logPut, "%v Error on %s: %s\n", time.Now().UTC().Format(time.RFC3339), uri, err)
			numFailed++
		} else if ok {
			fmt.Fprintf(logPut, "%v Retrieved: %s\n", time.Now().UTC().Format(time.RFC3339), uri)
		} else {
			fmt.Fprintf(logPut, "%v No saved copy of: %s\n", time.Now().UTC().Format(time.RFC3339), uri)
			numFailed++
		}
	}
	fmt.Fprintf(logPut, "%v End\n", time.Now().UTC().Format(time.RFC3339))

	// Write log record
	rec := &warc.Record{
		Format:  warc.RecordFormatWarc,
		Type:    warc.RecordTypeResource,
		Headers: make(warc.Header),
		Content: &log,
	}
	rec.Headers[warc.FieldNameWARCDate] = time.Now().Format(warc.TimeFormat)
	rec.Headers[warc.FieldNameWARCRecordID] = warc.NewUUID()
	rec.Headers[warc.FieldNameWARCWarcinfoID] = g.warcWriter.WARCInfoID
	rec.Headers[warc.FieldNameContentType] = "text/plain"
	rec.Headers[warc.FieldNameWARCTargetURI] = "urn:X-mspfarchiver:log"

	rec.Headers[warc.FieldNameWARCBlockDigest] = warc.Sha1Digest(rec.Content.Bytes())
	err := errors.Wrap(g.warcWriter.WriteRecord(rec), "wayback: warc log record")

	return numFailed, err
}

func waybackGetIndex(uri string) ([][]string, error) {
	apiQ := fmt.Sprintf("https://web.archive.org/cdx/search/cdx?url=%s&limit=50&matchType=exact",
		url.QueryEscape(uri),
	)
	resp, err := httpClient.Get(apiQ)
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

func (g *downloadG) waybackAttemptPull(log io.Writer, uri string) (bool, error) {
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
		} else if false {
			// redirects...
			continue
		}
		reqRec, respRec, err := warc.NewRequestResponseRecords(warc.CaptureHelper{}, req, resp)
		if err != nil {
			return false, errors.Wrapf(err, "wayback %s: prepare warc", uri)
		}
		reqRec.Headers[warc.FieldNameWARCTargetURI] = uri
		respRec.Headers[warc.FieldNameWARCTargetURI] = uri
		// reqRec.Headers[warc.FieldNameWARCDate] = uri
		// respRec.Headers[warc.FieldNameWARCDate] = uri
		err = g.warcWriter.WriteRecordsAndCDX(&reqRec, &respRec, resp)
		if err != nil {
			return false, errors.Wrapf(err, "wayback %s: save warc", uri)
		}
		return true, nil
	} // loop for redirects I think
}

func (g *downloadG) find404s() (map[string]warcRespMeta, error) {
	var failingResponses = make(map[string]warcRespMeta)
	err := g.find404ScanWARC("resources.warc.gz", failingResponses)
	if err != nil {
		return nil, err
	}
	err = g.find404ScanWARC("wayback.warc.gz", failingResponses)
	if err != nil {
		return nil, err
	}

	// Find URLs that have no WARC entry - e.g. DNS failures
	urlF, err := os.Open(g.dir.File("urls.txt"))
	if err != nil {
		return nil, errors.Wrap(err, "read urls.txt")
	}
	defer urlF.Close()
	sc := bufio.NewScanner(urlF)
	for sc.Scan() {
		uri := sc.Text()
		_, ok := g.downloadedURLs[uri]
		if !ok {
			fmt.Println("found missing file", uri)
			g.downloadedURLs[uri] = false
		}
	}
	if sc.Err() != nil {
		return nil, errors.Wrap(err, "read urls.txt")
	}

	return failingResponses, nil
}

func (g *downloadG) find404ScanWARC(filename string, failingResponses map[string]warcRespMeta) error {
	stat, err := os.Stat(g.dir.File(filename))
	if os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return errors.Wrap(err, "find404: stat")
	} else if stat.Size() == 0 {
		// file is empty
		return nil
	}
	warcF, err := os.Open(g.dir.File(filename))
	if err != nil {
		return errors.Wrap(err, "find404")
	}
	defer warcF.Close()
	g.cdxWriter.WARCFileName = filename

	warcBR := bufio.NewReader(warcF)
	readPos := func() int64 {
		pos_, err := warcF.Seek(0, io.SeekCurrent)
		if err != nil {
			panic(errors.Wrap(err, "writing cdx: reading warc: seek current"))
		}
		return pos_ - int64(warcBR.Buffered())
	}

	var startPos, endPos int64
	startPos = readPos() // has to be before gzip.NewReader() / gzip.Reset()

	warcR, err := gzip.NewReader(warcBR)
	if err != nil {
		return errors.Wrap(err, "open warc")
	}
	defer warcR.Close()

	for {
		warcR.Multistream(false)

		record, err := readWARCRecord(warcR)
		if err == io.EOF {
			// empty record
			goto _continue
		} else if err != nil {
			return errors.Wrapf(err, "writing cdx: reading warc\nrecord: %v", record)
		}
		endPos = readPos()

		err = g.processWARCRecord(&record, startPos, endPos, failingResponses)
		if err != nil {
			return errors.Wrapf(err, "writing cdx: process warc\nrecord: %v", record)
		}

	_continue:
		startPos = readPos()
		err = warcR.Reset(warcBR)
		if err == io.EOF {
			break // real EOF
		} else if err != nil {
			return errors.Wrap(err, "writing cdx: reading warc")
		}
	}

	return nil
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

var known404Redirects = []string{
	"http://tinypic.com/images/404.gif",
	"https://tinypic.com/images/404.gif",
	"https://imageshack.com/",
	"http://i.imgur.com/removed.png",
	"https://i.imgur.com/removed.png",
	"http://www.freeimagehosting.net",
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
	} else if resp.StatusCode >= 300 {
		// Redirect
		loc := resp.Header.Get("Location")
		found := false
		for _, v := range known404Redirects {
			if loc == v {
				found = true
				break
			}
		}
		if found {
			fmt.Println("Found failing 3xx for", target, "code", resp.StatusCode, resp)
			g.downloadedURLs[target] = false
		} else {
			g.downloadedURLs[target] = true
		}
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
