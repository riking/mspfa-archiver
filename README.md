# MSPFA Archiver

The MSPFA script is at templates/assets/mspfa.js. All edits are annotated, so that edits to the script can be audited.

## Usage

```
# Install dependencies, part 1
$ sudo apt install libpcre3-dev
# Download code
$ go get -v github.com/riking/mspfa-archiver
$ cd $(go env GOPATH)/src/github.com/riking/mspfa-archiver
# Install dependencies, part 2
$ ./get-wpull.sh
$ mkdir target

# Compile binary
$ go build -v .

# Produce a list of external resources in a story
$ ./mspfa-archiver -s STORYID
  # Output: target/STORYID/urls.txt, links.txt, videos.txt, photobucket.txt

# Download story images
$ ./mspfa-archiver -s STORYID -dl
  # Extra options: -f, -devScript, -o=FOLDER, -dl=false, -wpull-args

# Upload to archive.org
$ ./mspfa-archiver -s STORYID -test -ident mspfa-STORYID-20060102
  # Extra options: -test=false, -fu, -fixmeta, -o=FOLDER

# (DEVELOPER ONLY: After changing template/assets/)
$ ./mspfa-archiver -updateAssets
```

### Order of operations

 1. check for existing internet archive items with mspfa-id set, examine for
	conflicts with the -ident option
 2. download the story.json from mspfa.com.  save to file and load it
 3. scan the story.json for URLs that need to be downloaded.  TODO - CSS scans
	need to be recursive parses that process @import and url().
 4. write text files containing the found URLs, split into "subresources",
	"links", "videos", and "photobucket"
 5. write the HTML files to the output
 6. **Download Step** - only run if `-dl` is specified
 7. run wpull with the subresources list to download all the images and SWFs
	into a WARC
 8. run youtube-dl with each video to download the SWF alternates
 9. TODO - write the video manifest detailing the exact filenames downloaded
	TODO - update the video manifest after the derive step finishes
 10. run custom photobucket downloader (special Referer: header processing)
	 outputting to the WARC file
 11. re-scan the WARC file and do two things: (1) write the CDX file, (2)
	 remember which entries are 404s for the next step
 12. contact the Wayback Machine for each 404 and download the rescue copies
	 into the WARC / CDX
 13. **Upload Step** - only run if `-ident` is specified, and download step did
	 not fail (unless `-fu` was specified)
 14. Load credentials from ias3.json
 15. Calculate Archive headers to apply to all requests - title, description,
	 tags...
 16. Calculate total upload size for Archive-Size-Hint header
 17. Pull the \_files.xml from the IA item.  (A non-existent item is treated as
	 an empty item.)
 18. If `-fixmeta` was specified, upload only cover.png with
	 X-Archive-Ignore-Preexisting-Bucket to change the item metadata.  Exit the
	 upload step.
 19. Iterate the target folder, uploading every found file (a whitelist is
	 applied to the root folder).  Every file is checked against the
	 \_files.xml so that exact duplicates can be skipped.  This is done with
	 concurrency because why not? (reason why not: you end up queueing
	 archive.php jobs faster than they can snowball-process)

