#!/bin/bash
set -euo pipefail
PORT="${1:-9333}"
PROFILE="$HOME/.coil/chrome-profile"
mkdir -p "$PROFILE"
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PROFILE" --remote-debugging-port="$PORT" --remote-debugging-address=127.0.0.1 \
  --no-first-run --no-default-browser-check about:blank
