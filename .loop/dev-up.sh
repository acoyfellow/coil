#!/usr/bin/env bash
set -uo pipefail
cd /Users/jcoeyman/cloudflare/coil-webkit
pkill -f "wrangler dev" 2>/dev/null || true
sleep 2
nohup npx wrangler dev -c wrangler.dev.jsonc --var COIL_AUTH:dev > /Users/jcoeyman/cloudflare/coil-webkit/.loop/dev.log 2>&1 &
for _ in $(seq 1 40); do
  grep -q "Ready on" /Users/jcoeyman/cloudflare/coil-webkit/.loop/dev.log && break
  sleep 1
done
grep -E "Ready on|ERROR" /Users/jcoeyman/cloudflare/coil-webkit/.loop/dev.log | tail -3
