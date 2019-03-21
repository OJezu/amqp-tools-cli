#!/usr/bin/env bash

for i in "${@}"
do
  echo $i
done

countDown=1

for i in $(seq 3 -$countDown 0)
do
  echo "countdown: $i"
  sleep $countDown
done

exit 0
