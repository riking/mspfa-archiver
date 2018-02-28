package main

import (
	"bufio"
	"compress/gzip"
	"encoding/csv"
	"fmt"
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
	CDXWriter  *csv.Writer
	WARCInfoID string

	warcFile *os.File
	warcGz   *gzip.Writer
	cdxFile  *os.File

	cdxFormat CDXFormat
}

func (w *warcWriter) WriteRecordsAndCDX(reqRec, respRec *warc.Record) {
	if w.WARCInfoID != "" {
		reqRec.Header.Set(warc.FieldNameWARCWarcinfoID, w.WARCInfoID)
		respRec.Header.Set(warc.FieldNameWARCWarcinfoID, w.WARCInfoID)
	}
}

func (w *warcWriter) Close() error {
	w.WARCWriter.Close()
	w.warcGz.Flush()
	w.warcGz.Close()
	w.warcFile.Close()
	w.CDXWriter.Flush()
	w.cdxFile.Close()
	return nil
}

func prepareWarcWriter(dir advDir) (*warcWriter, error) {
	warcF, err := os.OpenFile(dir.File("resources.warc.gz"), os.O_APPEND|os.O_RDWR, 0)
	if err != nil {
		return nil, err
	}
	warcGZ := gzip.NewWriter(warcF)

	warcW, err := warc.NewWriterCompressed(warcF, warcGZ)
	if err != nil {
		return nil, err
	}
	cdxF, err := os.OpenFile(dir.File("resources.cdx"), os.O_APPEND|os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return nil, err
	}

	cdxW := csv.NewWriter(cdxF)
	cdxW.Comma = ' ' // cdx files use space delimiters

	return &warcWriter{
		WARCWriter: warcW,
		warcFile:   warcF,
		warcGz:     warcGZ,
		CDXWriter:  cdxW,
		cdxFile:    cdxF,

		// Use the wpull CDX format.
		// https://github.com/chfoo/wpull/blob/d0a9dffd2f79e62242e5ddb603c5e77e5b012e91/wpull/warc/recorder.py#L425
		cdxFormat: CDXFormat{
			'a': 1,
			'b': 2,
			'm': 3,
			's': 4,
			'k': 5,
			'S': 6,
			'V': 7,
			'g': 8,
			'u': 9,
		},
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

// Writes the CDX fields that can be determined from the record into the target
// array.  Not all fields are implemented or can be implemented, see source for
// details.  Fields not written are left at their original values.
func CDXLine(r *warc.Record, format CDXFormat, line []string) error {
	if r.Type != warc.RecordTypeResponse {
		return nil
	}
	var httpResp *http.Response
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
			set(idx, r.Headers[warc.FieldNameWARCPayloadDigest])
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
		case CDXUUID:
			set(idx, r.Headers[warc.FieldNameWARCRecordID])
		case CDXUncompressedOffset: // 'v'
			// must be set by writer
		default:
			fmt.Printf("unhandled cdx field %c\n", f)
		}
	}
	return storedErr
}
