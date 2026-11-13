#!/usr/bin/env bash
set -euo pipefail
cd /Users/jcoeyman/cloudflare/coil-webkit
step() { echo "== $1"; }
step typecheck
npm run -s typecheck
step biome
node node_modules/@biomejs/biome/bin/biome check src client shared test >/dev/null
step files
for f in test/cloud5-lazy.test.ts test/cloud5-usage.test.ts test/cloud5-workspace.test.ts test/cloud5-runjs.test.ts test/cloud5-broker.test.ts; do
  [ -f "$f" ] || { echo "missing $f"; exit 1; }
done
step vitest
perl -e 'alarm 170; exec @ARGV' node node_modules/vitest/vitest.mjs run >/Users/jcoeyman/cloudflare/coil-webkit/.loop/cloud5-vitest.log 2>&1 || { tail -30 /Users/jcoeyman/cloudflare/coil-webkit/.loop/cloud5-vitest.log; exit 1; }
grep -E "Tests +[0-9]+ passed" /Users/jcoeyman/cloudflare/coil-webkit/.loop/cloud5-vitest.log
step domain
(cd domain && node node_modules/vitest/vitest.mjs run >/Users/jcoeyman/cloudflare/coil-webkit/.loop/cloud5-domain.log 2>&1) || { tail -20 /Users/jcoeyman/cloudflare/coil-webkit/.loop/cloud5-domain.log; exit 1; }
step local
bash .loop/local-chat.sh
echo "GATE PASS"
