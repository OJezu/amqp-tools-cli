#!/bin/bash

trap 'echo "SIGINT received"' INT
trap 'echo "SIGTERM received"' TERM

sleep=$(echo "scale=3; $(( RANDOM % 10000 ))/1000" | bc)

echo "sleep $sleep"
sleep "$sleep"

exit 0
