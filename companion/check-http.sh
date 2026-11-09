#!/usr/bin/env bash
set -euo pipefail
cd /Users/jcoeyman/cloudflare/coil-webkit
pkill -f 'companion/coil-companion' || true
nohup companion/coil-companion > experiments/cmux-parity/companion-run.log 2>&1 &
sleep 1
TOKEN=$(cat ~/.coil-companion/token)
curl -s -H "x-coil-token: $TOKEN" http://127.0.0.1:18799/health
echo
curl -s -H "x-coil-token: $TOKEN" http://127.0.0.1:18799/sync -o experiments/cmux-parity/companion-sync.json
python3 -c "import json; d=json.load(open('experiments/cmux-parity/companion-sync.json')); print('http count', len(d['cookies']), 'undecryptable', d['undecryptable'])"
rm -f experiments/cmux-parity/companion-sync.json
curl -s -H "x-coil-token: wrong" http://127.0.0.1:18799/health
echo
