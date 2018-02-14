#!/bin/bash

echo "On Mac: brew install python3; pip3 install 'wpull<2'"
if [ "$(which wpull)" == "" ] ; then
	ln -s "$(which wpull)"
	exit 0
fi

echo "Downloading Linux binary, ^C to cancel"
wget -N -O _wpull-bin.zip https://launchpad.net/wpull/trunk/v1.2.3/+download/wpull-1.2.3-linux-x86_64-3.4.3-20160302011013.zip
unzip _wpull-bin.zip wpull
