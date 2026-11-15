#!/usr/bin/env bash
set -uo pipefail

keep="${KEEP:-3}"
apply="${1:-}"

for account in 31b91e7f9954ad8aa334d46f012bd8ed bfcb6ac5b3ceaf42a09607f6f7925823; do
  listing=$(CLOUDFLARE_ACCOUNT_ID=$account npx wrangler containers images list --json 2>/dev/null)
  doomed=$(printf '%s' "$listing" | python3 -c '
import json, sys
keep = int(sys.argv[1])
raw = sys.stdin.read()
images = json.loads(raw[raw.index("["):])
for image in images:
    if image["name"] != "coil-thread-computer":
        continue
    deploys = sorted(t for t in image["tags"] if t.startswith("wrangler-"))
    for tag in deploys[:-keep]:
        print("coil-thread-computer:" + tag)
' "$keep")
  count=$(printf '%s' "$doomed" | grep -c . || true)
  echo "$account: $count old deploy tags (keeping newest $keep)"
  [ "$apply" = "--apply" ] || continue
  for ref in $doomed; do
    CLOUDFLARE_ACCOUNT_ID=$account npx wrangler containers images delete "$ref" > /dev/null 2>&1 && echo "  deleted $ref"
  done
done
