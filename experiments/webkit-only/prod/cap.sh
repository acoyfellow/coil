#!/usr/bin/env bash
set -euo pipefail
surface="${COIL_SURFACE:-$(cat /tmp/coil-surface)}"
name="$1"
body="$2"
cmux browser "$surface" eval --script "window.capOut=undefined;window.capT0=Date.now();fetch('/api/capabilities/${name}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${body})}).then(async r=>{window.capOut=r.status+' '+(await r.text());window.capMs=Date.now()-window.capT0}).catch(e=>{window.capOut='ERR '+e;window.capMs=Date.now()-window.capT0});'s'" >/dev/null
for _ in 1 2 3 4; do
  if cmux browser "$surface" wait --function "window.capOut!==undefined" --timeout-ms 25000 >/dev/null 2>&1; then break; fi
done
cmux browser "$surface" eval --script "(window.capMs??'pending')+' ms  '+String(window.capOut).slice(0,${COIL_MAX:-700})"
