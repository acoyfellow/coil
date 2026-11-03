#!/usr/bin/env bash
set -euo pipefail
arm="$1"
label="$2"
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="$root/experiments/webkit-only/runs/$label"
mkdir -p "$out"
docker run --rm \
  -v "$root/src:/opt/coil/src:ro" \
  -v "$root/experiments/webkit-only/harness.ts:/opt/coil/experiments/webkit-only/harness.ts:ro" \
  -v "$root/computer/webkit-host.py:/opt/coil/webkit-host.py:ro" \
  -v "$root/experiments/webkit-only/images/package.json:/opt/coil/package.json:ro" \
  -v "$root/package.json:/opt/coil/coil-package.json:ro" \
  -w /opt/coil \
  "coil-browser-$arm" \
  timeout 110 tsx experiments/webkit-only/harness.ts "$arm" \
  > "$out/$arm.json" 2> "$out/$arm.stderr" || true
tail -c 2000 "$out/$arm.json"
