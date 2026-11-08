#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../webkit-only/prod"
cap() { COIL_MAX=1000 perl -e 'alarm 110; exec @ARGV' bash cap.sh "$1" "$2"; }
N=$(date +%s)
NAME="cold-final-$N"
for i in 1 2 3 4 5; do
  echo "== create attempt $i"
  OUT=$(cap thread_create "{\"name\":\"$NAME\",\"title\":\"final probe $N\"}")
  echo "$OUT" | cut -c1-120
  if echo "$OUT" | grep -q '"name"'; then break; fi
  sleep 3
done
sleep 60
for i in 1 2 3; do
  echo "== first browser open attempt $i"
  OUT=$(cap browser_open "{\"name\":\"$NAME\",\"url\":\"https://example.com\"}")
  echo "$OUT" | cut -c1-200
  if echo "$OUT" | grep -q "Example Domain"; then break; fi
  sleep 3
done
