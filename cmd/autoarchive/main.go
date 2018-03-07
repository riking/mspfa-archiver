package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"time"
)

var startID = flag.Int("s", -1, "story id to start at")
var endID = flag.Int("e", 50000, "story id to end at")

func doarchive(id int) {
	timeStamp := time.Now().UTC().Format(time.RFC3339)
	logFile, err := os.Create(fmt.Sprintf("./logs/log-%v-%s.log", id, timeStamp))
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
		errFile, err2 := os.Create(fmt.Sprintf("./logs/failure-%v-%s.err", id, timeStamp))
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

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt)

loop:
	for id := *startID; id < *endID; id++ {
		doarchive(id)

		select {
		case <-sigCh:
			fmt.Printf("======= autoarchive interrupt, stopping at story ID %v\n", id)
			break loop
		default:
		}
	}
}
