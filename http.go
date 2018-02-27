package main

import (
	"net/http"
	"time"
)

var shortTimeout = 20 * time.Second
var longTimeout = 10 * time.Minute

var _defaultTransport = &http.Transport{
	TLSHandshakeTimeout: shortTimeout,
	// IAS3 delays response headers while it prepares the destination and
	// queues jobs
	ResponseHeaderTimeout: longTimeout,
}

type uaRoundTripper struct{ http.RoundTripper }

func (wrap uaRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", userAgent)
	}
	return wrap.RoundTripper.RoundTrip(req)
}

func init() {
	httpClient = &http.Client{
		Transport: uaRoundTripper{RoundTripper: _defaultTransport},
	}
}
