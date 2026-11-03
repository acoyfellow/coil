#!/usr/bin/env bash
set -euo pipefail
surface="${COIL_SURFACE:-$(cat /tmp/coil-surface)}"
thread="${COIL_THREAD:-$(cat /tmp/coil-thread)}"
body=$(python3 -c 'import json,sys;print(json.dumps({"command":sys.argv[1]}))' "$1")
cmux browser "$surface" eval --script "window.coilOut=undefined;fetch('/api/threads/${thread}/exec',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${body})}).then(r=>r.text()).then(t=>{window.coilOut=t}).catch(e=>{window.coilOut='ERR '+e});'started'" >/dev/null
for _ in 1 2 3 4; do
  if cmux browser "$surface" wait --function "window.coilOut!==undefined" --timeout-ms 25000 >/dev/null 2>&1; then break; fi
done
cmux browser "$surface" eval --script "(()=>{try{const j=JSON.parse(window.coilOut);return (j.stdout??'')+(j.stderr?'\n[stderr]\n'+j.stderr:'')+'\n[exit '+j.exitCode+']'}catch(e){return String(window.coilOut)}})()"
