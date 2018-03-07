package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"
)

var startID = flag.Int("s", -1, "story id to start at")
var endID = flag.Int("e", 50000, "story id to end at")

func doarchive(id int) {
	logFile, err := os.Create(fmt.Sprintf("./logs/log-%v-%s.log", id, time.Now().UTC().Format(time.RFC3339)))
	if err != nil {
		panic(err)
	}

	cmd := exec.Command("./mspfa-archiver", "-dl", "-ident", "auto", "-s", fmt.Sprint(id))
	pipeOut := io.MultiWriter(logFile, os.Stdout)
	cmd.Stdin = nil
	cmd.Stdout = pipeOut
	cmd.Stderr = pipeOut

	err = cmd.Run()
	if err != nil {
		errFile, err2 := os.Create(fmt.Sprintf("./logs/failure-%v-%s.err", id, time.Now().UTC().Format(time.RFC3339)))
		if err2 != nil {
			fmt.Println(err)
			panic(err2)
		}
		fmt.Fprintf(errFile, "%+v\n", err)
		errFile.Close()
	}
	logFile.Close()
}

func main() {
	flag.Parse()
	if *startID < 0 {
		fmt.Println("autoarchive: must specify starting story id")
		os.Exit(2)
	}

	for id := *startID; id < *endID; id++ {
		doarchive(id)
	}
}
