package main

import (
	"bufio"
	"compress/gzip"
	"encoding/csv"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/datatogether/warc"
)

type warcWriter struct {
	WARCWriter *warc.Writer
	WARCInfoID string

	warcFile     *os.File
	warcGz       *gzip.Writer
	warcFileName string

	curRecord    *warc.Record
	curResp      *http.Response
	lastStartPos int64
	lastEndPos   int64

	*cdxWriter
}

func (w *warcWriter) SetCDXWriter(cdxWriter *cdxWriter) {
	w.cdxWriter = cdxWriter
	if cdxWriter != nil {
		cdxWriter.WARCFileName = w.warcFileName
	}
	if w.cdxWriter != nil && w.WARCWriter != nil {
		w.WARCWriter.RecordCallback = func(rec *warc.Record, startPos int64, endPos int64) {
			w.cdxWriter.CDXAddRecord(rec, w.curResp, startPos, endPos)
		}
	}
}

// Write a WARCInfo record and save its ID as w.WARCInfoID.
func (w *warcWriter) WriteWarcinfo(rec *warc.Record) error {
	w.checkInit()
	err := w.WARCWriter.WriteRecord(rec)
	if err != nil {
		return err
	}
	w.WARCInfoID = rec.Headers.Get(warc.FieldNameWARCWarcinfoID)
	return nil
}

// Write a record with no special processing.
func (w *warcWriter) WriteRecord(rec *warc.Record) error {
	w.checkInit()
	return w.WARCWriter.WriteRecord(rec)
}

// Write a request/response pair and CDX line.
//
// If the HTTP response object is unavailable, simply pass nil - it will be
// parsed from the response WARC record.  The body need not be readable.
func (w *warcWriter) WriteRecordsAndCDX(reqRec, respRec *warc.Record, httpResp *http.Response) error {
	w.checkInit()
	if w.WARCInfoID != "" {
		reqRec.Headers.Set(warc.FieldNameWARCWarcinfoID, w.WARCInfoID)
		respRec.Headers.Set(warc.FieldNameWARCWarcinfoID, w.WARCInfoID)
	}

	err := w.WARCWriter.WriteRecord(reqRec)
	if err != nil {
		return err
	}
	w.curRecord = respRec
	w.curResp = httpResp
	err = w.WARCWriter.WriteRecord(respRec)
	if err != nil {
		return err
	}
	if w.cdxWriter != nil && w.cdxWriter.Err() != nil {
		return w.cdxWriter.Err()
	}
	return nil
}

func (w *warcWriter) Close() error {
	if w.WARCWriter != nil {
		w.WARCWriter.Close()
		w.warcGz.Flush()
		w.warcGz.Close()
	}
	w.warcFile.Close()

	if w.cdxWriter != nil {
		w.cdxWriter.Close()
	}
	return nil
}

func (w *warcWriter) checkInit() {
	if w.WARCWriter != nil {
		return
	}
	w.warcGz = gzip.NewWriter(w.warcFile)
	warcW, err := warc.NewWriterCompressed(w.warcFile, w.warcGz)
	if err != nil {
		panic(err)
	}
	w.WARCWriter = warcW
	if w.cdxWriter != nil {
		w.WARCWriter.RecordCallback = func(rec *warc.Record, startPos int64, endPos int64) {
			w.cdxWriter.CDXAddRecord(rec, w.curResp, startPos, endPos)
		}
	}
}

func prepareWARCWriter(cdxWriter *cdxWriter, dir advDir) (*warcWriter, error) {
	relFilename := "resources.warc.gz"
	warcF, err := os.OpenFile(dir.File(relFilename), os.O_APPEND|os.O_RDWR, 0)
	if err != nil {
		return nil, err
	}
	// gzip initialization is delayed - we might not have to write any records at all

	if cdxWriter != nil {
		cdxWriter.WARCFileName = relFilename
	}

	return &warcWriter{
		warcFile:     warcF,
		warcFileName: relFilename,

		cdxWriter: cdxWriter,
	}, nil
}

type cdxWriter struct {
	WARCFileName string
	csvWriter    *csv.Writer
	cdxFile      *os.File

	stickyErr error

	cdxFormat CDXFormat
	cdxLine   []string
}

// CDXAddRecord writes the WARC record to the CDX file.
//
// If the HTTP response object is unavailable, simply pass nil - it will be
// parsed from the response WARC record.  The body need not be readable.
func (cw *cdxWriter) CDXAddRecord(rec *warc.Record, httpResp *http.Response, startPos, endPos int64) {
	if rec.Type != warc.RecordTypeResponse {
		return
	}
	CDXLine(rec, httpResp, cw.cdxFormat, cw.cdxLine)
	cdxSet(cw.cdxFormat, cw.cdxLine, CDXCompressedOffset, fmt.Sprint(startPos))
	cdxSet(cw.cdxFormat, cw.cdxLine, CDXCompressedSize, fmt.Sprint(endPos-startPos))
	cdxSet(cw.cdxFormat, cw.cdxLine, CDXArcFileName, cw.WARCFileName)

	fmt.Println(cw.cdxLine)
	err := cw.csvWriter.Write(cw.cdxLine)
	if err != nil && cw.stickyErr == nil {
		cw.stickyErr = err
	}
}

func (cw *cdxWriter) Err() error {
	return cw.stickyErr
}

func (cw *cdxWriter) Close() error {
	cw.csvWriter.Flush()
	err := cw.csvWriter.Error()
	if err != nil && cw.stickyErr == nil {
		cw.stickyErr = err
	}
	err = cw.cdxFile.Close()
	if err != nil && cw.stickyErr == nil {
		cw.stickyErr = err
	}
	return cw.stickyErr
}

func cdxLineToFormat(line string) CDXFormat {
	format := make(CDXFormat)
	split := strings.Split(strings.TrimPrefix(line, " CDX "), " ")
	for idx, str := range split {
		format[str[0]] = idx
	}
	return format
}

const cdxFormat1 = " CDX a b m s k S V g u" // used by wpull
const cdxFormat2 = " CDX N b a m s k r M S V g"

func prepareCDXWriter(dir advDir) (*cdxWriter, error) {
	cdxFile, err := os.Create(dir.File("resources.cdx"))
	if err != nil {
		return nil, err
	}
	format := cdxLineToFormat(cdxFormat2)
	io.WriteString(cdxFile, cdxFormat2)
	io.WriteString(cdxFile, "\n")
	csvWriter := csv.NewWriter(cdxFile)
	csvWriter.Comma = ' '

	return &cdxWriter{
		cdxFile:   cdxFile,
		csvWriter: csvWriter,
		cdxFormat: format,
		cdxLine:   make([]string, len(format)),
	}, nil
}

const (
	CDXCanonizedURL = 'A' + iota
	CDXNewsgroup
	CDXRulespaceCategory
	CDXCompressedDATOffset
	_ // 'E'
	CDXCanonizedFrame
	CDXLanguageDescription
	CDXCanonizedHost
	CDXCanonizedImage
	CDXCanonizedJumpPoint
	CDXUnknownFBISChanges // 'K'
	CDXCanonizedLink
	CDXMetaTags
	CDXMassagedURL
	_ // 'O'
	CDXCanonizedPath
	CDXLanguage
	CDXCanonizedRedirect
	CDXCompressedSize
	_ // 'T'
	CDXUniqness
	CDXCompressedOffset
	_ // 'W'
	CDXCanonizedHrefURL
	CDXCanonizedSrcURL
	CDXCanonizedScriptURL // 'Z'
)
const (
	CDXOriginalURL = 'a' + iota
	CDXDate
	CDXOldChecksum
	CDXUncompressedDATOffset
	CDXIP
	CDXFrame
	CDXArcFileName
	CDXOriginalHost
	CDXImage
	CDXJumpPoint
	CDXDigest
	CDXLink
	CDXMimeType
	CDXUncompressedSize
	CDXPort
	CDXOriginalPath
	_ // 'q'
	CDXRedirect
	CDXResponseCode
	CDXTitle
	CDXUUID // 'u'
	CDXUncompressedOffset
	_ // 'w'
	CDXHrefURL
	CDXSrcURL
	CDXScriptURL // 'z'

	CDXComment = '#'
)

func iaMassageHost(host string) string {
	rgx := regexp.MustCompile(`www\d*\.`)
	m := rgx.FindStringIndex(host)
	if m != nil {
		return host[m[1]:]
	}
	return host
}

func surtHost(host string) string {
	// ip addresses ARE reversed
	split := strings.Split(host, ".")
	for i, j := 0, len(split)-1; i < j; i, j = i+1, j-1 {
		split[i], split[j] = split[j], split[i]
	}
	return strings.Join(split, ",")
}

func alphaReorderQuery(query string) string {
	if len(query) <= 1 {
		return query
	}
	split := strings.Split(query, "&")
	// this is a deviation from the python version
	// I can't tell if the split on = actually does anything useful
	sort.Strings(split)
	return strings.Join(split, "&")
}

func iaMassagedURL(u1 *url.URL) string {
	u := new(url.URL)
	*u = *u1
	u.Host = strings.ToLower(u.Host)
	host, port, err := net.SplitHostPort(u.Host)
	if err != nil {
		host = u.Host
	} else if err == nil {
		if u.Scheme == "http" && port == "80" {
			port = ""
		} else if u.Scheme == "https" && port == "443" {
			port = ""
		}
	}
	host = iaMassageHost(host)
	u.Scheme = ""
	u.User = nil
	u.Path = strings.ToLower(u.Path)
	// u.Path = stripPathSessionID(u.Path)
	if true { // path_strip_trailing_slash_unless_empty
		if u.Path != "/" {
			u.Path = strings.TrimSuffix(u.Path, "/")
		}
	}
	if u.RawQuery != "" {
		// u.RawQuery = stripQuerySessionID(u.RawQuery)
		u.RawQuery = strings.ToLower(u.RawQuery)
		u.RawQuery = alphaReorderQuery(u.RawQuery)
	}
	u.ForceQuery = false
	u.Fragment = ""
	// -----
	host = surtHost(host)
	if port != "" {
		u.Host = host + ":" + port + ")"
	} else {
		u.Host = host + ")"
	}
	u.Scheme = "XXX"
	return strings.TrimPrefix(u.String(), "XXX://")
}

// The CDXFormat type maps a CDX header character (the key) to an array index.
// Values should be contiguous.
type CDXFormat map[byte]int

func cdxSet(format CDXFormat, line []string, key byte, value string) {
	idx, ok := format[key]
	if !ok {
		return
	}
	if value == "" {
		value = "-"
	}
	line[idx] = value
}

// Writes the CDX fields that can be determined from the record into the target
// array.  Not all fields are implemented or can be implemented, see source for
// details.  Fields not written are left at their original values.
func CDXLine(r *warc.Record, _httpResp *http.Response, format CDXFormat, line []string) error {
	if r.Type != warc.RecordTypeResponse {
		return nil
	}
	var httpResp *http.Response = _httpResp
	var targetURI *url.URL
	var storedErr error

	set := func(idx int, s string) {
		if s == "" {
			line[idx] = "-"
		} else {
			line[idx] = s
		}
	}

	getTargetURI := func() *url.URL {
		if targetURI == nil {
			u, err := url.Parse(r.Headers[warc.FieldNameWARCTargetURI])
			if err != nil {
				storedErr = err
				// return dummy value
				targetURI, _ = url.Parse("")
			} else {
				targetURI = u
			}
		}
		return targetURI
	}
	getResponse := func() *http.Response {
		if httpResp == nil {
			rdr := bufio.NewReader(r.Content)
			fmt.Printf("%s\n", r.Content)
			resp, err := http.ReadResponse(rdr, nil)
			if err != nil {
				storedErr = err
				fmt.Println(err)
				// return a dummy value
				httpResp = &http.Response{Header: http.Header{}}
			} else {
				httpResp = resp
			}
		}
		return httpResp
	}

	for f, idx := range format {
		switch f {
		case CDXMetaTags: // 'M'
			// TODO ?
			line[idx] = "-"
		case CDXMassagedURL: // 'N'
			u := getTargetURI()
			set(idx, iaMassagedURL(u))
		case CDXCompressedSize: // 'S'
			// must be set by writer
		case CDXCompressedOffset: // 'V'
			// must be set by writer
		case CDXOriginalURL: // 'a'
			set(idx, r.Headers[warc.FieldNameWARCTargetURI])
		case CDXDate: // 'b'
			t, err := time.Parse(time.RFC3339, r.Headers[warc.FieldNameWARCDate])
			if err != nil {
				line[idx] = "-"
				continue
			}
			line[idx] = strconv.FormatInt(t.Unix(), 10)
		case CDXIP: // 'e'
			set(idx, r.Headers[warc.FieldNameWARCIPAddress])
		case CDXArcFileName: // 'g'
			// must be set by writer
		case CDXOriginalHost: // 'h'
			hp := getTargetURI().Host
			host, _, err := net.SplitHostPort(hp)
			if strings.Contains(err.Error(), "missing port") {
				host = hp
			}
			set(idx, host)
		case CDXDigest: // 'k'
			set(idx, strings.TrimPrefix(r.Headers[warc.FieldNameWARCPayloadDigest], "sha1:"))
		case CDXMimeType: // 'm'
			mediatype, _, _ := mime.ParseMediaType(getResponse().Header.Get("Content-Type"))
			set(idx, mediatype)
		case CDXUncompressedSize: // 'n'
			// must be set by writer
		case CDXPort: // 'o'
			hp := getTargetURI().Host
			_, port, err := net.SplitHostPort(hp)
			if strings.Contains(err.Error(), "missing port") {
				if getTargetURI().Scheme == "http" {
					port = "80"
				} else if getTargetURI().Scheme == "https" {
					port = "443"
				}
			}
			set(idx, port)
		case CDXOriginalPath: // 'p'
			set(idx, getTargetURI().EscapedPath())
		case CDXRedirect: // 'r'
			resp := getResponse()
			if resp.StatusCode >= 300 && resp.StatusCode <= 399 {
				set(idx, resp.Header.Get("Location"))
			} else {
				set(idx, "")
			}
		case CDXResponseCode: // 's'
			set(idx, strconv.Itoa(getResponse().StatusCode))
		case CDXUUID: // 'u'
			set(idx, r.Headers[warc.FieldNameWARCRecordID])
		case CDXUncompressedOffset: // 'v'
			// must be set by writer
		default:
			fmt.Printf("unhandled cdx field %c\n", f)
		}
	}
	return storedErr
}
