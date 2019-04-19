#!/usr/bin/env bash

sleep=$(echo "scale=3; $(( RANDOM % 10000 ))/1000" | bc)

echo "sleep $sleep"
sleep "$sleep"

exit 0
