#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
surface="${COIL_SURFACE:-$(cat /tmp/coil-surface)}"
thread="${COIL_GATE_THREAD:-reasoning-check-5234da}"
expected=$(git -C ../../.. rev-parse HEAD)
max_ms="${COIL_GATE_MAX_MS:-2000}"
fail=0
pass() { printf 'PASS  %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }

call() {
  local name="$1" body="$2"
  cmux browser "$surface" eval --script "(async()=>{const t0=performance.now();try{const r=await fetch('/api/capabilities/${name}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${body})});const text=await r.text();return JSON.stringify({status:r.status,ms:Math.round(performance.now()-t0),text})}catch(e){return JSON.stringify({status:0,ms:0,text:String(e)})}})()"
}

field() { python3 -c 'import json,sys
try: print(json.loads(sys.stdin.read())[sys.argv[1]])
except Exception: print("")' "$1"; }

version=""
for _ in 1 2 3; do
  version=$(cmux browser "$surface" eval --script "fetch('/api/version',{cache:'no-store'}).then(r=>r.json()).then(j=>j.commit)" 2>&1) && [ -n "$version" ] && break
  version=""
done
[ "$version" = "$expected" ] && pass "version $version" || bad "version $version, expected $expected"

check() {
  local label="$1" name="$2" body="$3" want="$4"
  local out status ms text
  out=$(call "$name" "$body")
  status=$(printf '%s' "$out" | field status)
  ms=$(printf '%s' "$out" | field ms)
  text=$(printf '%s' "$out" | field text)
  if [ "$status" != 200 ]; then bad "$label status $status: ${text:0:200}"; return; fi
  case "$text" in *"$want"*) ;; *) bad "$label: no \"$want\" in ${text:0:200}"; return ;; esac
  if [ "${ms:-99999}" -gt "$max_ms" ]; then bad "$label ${ms} ms > ${max_ms} ms"; return; fi
  pass "$label ${ms} ms"
}

call browser_eval "{\"name\":\"${thread}\",\"expression\":\"1\"}" >/dev/null
check "open example.com" browser_open "{\"name\":\"${thread}\",\"url\":\"https://example.com\"}" "Example Domain"
check "eval title" browser_eval "{\"name\":\"${thread}\",\"expression\":\"document.title\"}" "Example Domain"
check "snapshot" browser_snapshot "{\"name\":\"${thread}\"}" "e1"
check "click" browser_click "{\"name\":\"${thread}\",\"ref\":\"e1\"}" "iana.org"
check "display shows the page" thread_exec "{\"name\":\"${thread}\",\"command\":\"DISPLAY=:99 xdotool search --onlyvisible --name . getwindowname %@ 2>/dev/null | head -5\"}" "coil"

host=$(call thread_exec "{\"name\":\"${thread}\",\"command\":\"pgrep -f [w]ebkit-host.py >/dev/null && echo webkit-host-running; pgrep -f [u]sr/lib/chromium/chromium >/dev/null && echo chrome-running; true\"}" | field text)
case "$host" in *webkit-host-running*) pass "webkit host running" ;; *) bad "webkit host not running: ${host:0:200}" ;; esac
case "$host" in *chrome-running*) bad "chrome still running" ;; *) pass "no chrome" ;; esac

exit $fail
