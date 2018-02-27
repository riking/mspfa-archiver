package main

const shortTimeout = 20 * time.Second
const longTimeout = 10 * time.Minute

var _defaultTransport = &http.Transport{
	TLSHandshakeTimeout: shortTimeout,
	// IAS3 delays response headers while it prepares the destination and
	// queues jobs
	ResponseHeaderTimeout: longTimeout,
}

type uaRoundTripper http.RoundTripper

func (wrap uaRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", userAgent)
	}
	return wrap.RoundTrip(req)
}

func init() {
	httpClient = &http.Client{
		Transport: uaRoundTripper(_defaultTransport),
	}
}
