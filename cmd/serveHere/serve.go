package main

import (
	"flag"
	"log"
	"net/http"
)

func main() {
	port := flag.String("p", "8100", "port to serve on")
	directory := flag.String("d", ".", "the directory of static file to host")
	flag.Parse()

	http.Handle("/", http.FileServer(http.Dir(*directory)))

	log.Printf("Serving %s on HTTP port: %s\n", *directory, *port)
	log.Fatal(http.ListenAndServe(":"+*port, printReqs{wrap: http.DefaultServeMux}))
}

type printReqs struct {
	wrap http.Handler
}

func (p printReqs) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Printf("%s - %s\n", r.RemoteAddr, r.URL.RequestURI())
	p.wrap.ServeHTTP(w, r)
}
