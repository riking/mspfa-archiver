#!/bin/bash

CHROME_ARGS="--user-data-dir=/tmp/localChrome --allow-file-access-from-files"

if [ -d /Applications/Google\ Chrome.app/ ]; then
	CHROME_BINARY="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif true; then
	# todo
	true
fi

"$CHROME_BINARY" $CHROME_ARGS
