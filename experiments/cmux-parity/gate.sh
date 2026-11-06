#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"

surface="${COIL_SURFACE:-$(cat /tmp/coil-surface 2>/dev/null || echo none)}"
if ! cmux browser "$surface" get url >/dev/null 2>&1; then
  surface=$(cmux browser open https://coil.coey.dev/api/version --workspace workspace:1000010003 --focus false | sed -n 's/.*surface=\([^ ]*\).*/\1/p')
  echo "$surface" > /tmp/coil-surface
  cmux browser "$surface" wait --load-state complete --timeout 20 >/dev/null 2>&1
fi

fail=0
pass() { printf 'PASS  %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }

expected="${EXPECT_COMMIT:-$(git -C ../.. rev-parse HEAD)}"
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

check() {
  local label="$1" name="$2" body="$3" want="$4"
  local out status ms text
  out=$(call "$name" "$body")
  status=$(printf '%s' "$out" | field status)
  ms=$(printf '%s' "$out" | field ms)
  text=$(printf '%s' "$out" | field text)
  if [ "$status" != 200 ]; then bad "$label status $status: ${text:0:160}"; return; fi
  case "$text" in *"$want"*) ;; *) bad "$label: no \"$want\" in ${text:0:160}"; return ;; esac
  if [ "${ms:-99999}" -gt "$max_ms" ]; then bad "$label ${ms} ms > ${max_ms} ms"; return; fi
  pass "$label ${ms} ms"
}

cold_check() {
  local label="$1" name="$2" body="$3" want="$4"
  local out status text
  out=$(call "$name" "$body")
  status=$(printf '%s' "$out" | field status)
  text=$(printf '%s' "$out" | field text)
  if [ "$status" != 200 ]; then bad "$label status $status: ${text:0:160}"; return; fi
  case "$text" in *"$want"*) ;; *) bad "$label: no \"$want\" in ${text:0:160}"; return ;; esac
  pass "$label (cold, timing exempt)"
}

thread="${COIL_GATE_THREAD:-$(cat /tmp/coil-parity-thread 2>/dev/null || echo none)}"
if [ "$thread" = none ]; then
  list_out=$(call thread_list "{}")
  list_text=$(printf '%s' "$list_out" | field text)
  thread=$(printf '%s' "$list_text" | python3 -c 'import sys,json
try: print(json.loads(sys.stdin.read())[0]["name"])
except Exception: print("none")')
  if [ "$thread" = none ]; then bad "no thread to use: ${list_text:0:200}"; exit 1; fi
  echo "$thread" > /tmp/coil-parity-thread
  pass "using newest thread $thread"
fi

version=""
for _ in 1 2 3; do
  cmux browser "$surface" reload >/dev/null 2>&1
  cmux browser "$surface" wait --load-state complete --timeout 20 >/dev/null 2>&1
  version=$(cmux browser "$surface" eval --script "fetch('/api/version',{cache:'no-store'}).then(r=>r.json()).then(j=>j.commit)" 2>&1) && [ -n "$version" ] && [ "$version" != "undefined" ] && break
  version=""
done
[ "$version" = "$expected" ] && pass "version $version" || bad "version $version, expected $expected"

cold_check "warmup browser (cold, timing exempt)" browser_open "{\"name\":\"${thread}\",\"url\":\"about:blank\"}" ""
check "1 open example.com" browser_open "{\"name\":\"${thread}\",\"url\":\"https://example.com\"}" "Example Domain"
check "2a snapshot form" browser_snapshot "{\"name\":\"${thread}\"}" "e1"
call browser_open "{\"name\":\"${thread}\",\"url\":\"data:text/html,<title>Form</title><input id=q><button>Go</button>\"}" >/dev/null
out=$(call browser_snapshot "{\"name\":\"${thread}\"}")
text=$(printf '%s' "$out" | field text)
echo "$text" | grep -q "e1" || bad "2b form snapshot: ${text:0:160}"
check "2c type into form" browser_type "{\"name\":\"${thread}\",\"text\":\"hello coil\",\"ref\":\"e1\"}" "typed"
check "2d form value" browser_eval "{\"name\":\"${thread}\",\"expression\":\"document.getElementById('q').value\"}" "hello coil"

shot=$(call browser_screenshot "{\"name\":\"${thread}\"}")
shot_status=$(printf '%s' "$shot" | field status)
shot_text=$(printf '%s' "$shot" | field text)
if [ "$shot_status" != 200 ]; then
  bad "3 screenshot status $shot_status: ${shot_text:0:120}"
else
  png_info=$(printf '%s' "$shot_text" | python3 -c 'import sys,base64,json
t=sys.stdin.read()
try:
  d=base64.b64decode(t)
  print("png" if d[:4]==b"\x89PNG" else "not-png", int.from_bytes(d[16:20],"big"), int.from_bytes(d[20:24],"big"), len(d))
except Exception as e:
  print("bad", e)')
  case "$png_info" in "png 1280 800"*) pass "3 screenshot PNG 1280x800" ;; *) bad "3 screenshot: $png_info" ;; esac
fi

call browser_open "{\"name\":\"${thread}\",\"url\":\"https://example.com\"}" >/dev/null
check "4a set login cookie" browser_set_cookies "{\"name\":\"${thread}\",\"cookies\":\"[{\\\"name\\\":\\\"coil_login\\\",\\\"value\\\":\\\"jar42\\\",\\\"domain\\\":\\\"example.com\\\",\\\"path\\\":\\\"/\\\"}]\"}" "set 1"
check "4b cookie readable" browser_eval "{\"name\":\"${thread}\",\"expression\":\"document.cookie\"}" "jar42"
sleep 2
cmux browser "$surface" eval --script "fetch('/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({_tag:'Request',id:'1',tag:'Pause',payload:{name:'${thread}'},traceId:'0',spanId:'0',sampled:false,headers:[]})}).then(r=>r.status)" >/dev/null
cmux browser "$surface" eval --script "fetch('/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({_tag:'Request',id:'1',tag:'Wake',payload:{name:'${thread}'},traceId:'0',spanId:'0',sampled:false,headers:[]})}).then(r=>r.status)" >/dev/null
cold_check "4c cookie survives pause/wake" browser_eval "{\"name\":\"${thread}\",\"expression\":\"document.cookie\"}" "jar42"

call browser_open "{\"name\":\"${thread}\",\"url\":\"https://customer0.dev/spikes.json\"}" >/dev/null
check "5 read API in page" browser_eval "{\"name\":\"${thread}\",\"expression\":\"document.body.innerText.slice(0,120)\"}" "tether"

cmux browser "$surface" eval --script "window.sendOut=undefined;fetch('/api/capabilities/thread_send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'${thread}',text:'Reply with exactly: pong'})}).then(async r=>{window.sendOut=r.status+' '+(await r.text())}).catch(e=>{window.sendOut='ERR '+e});'s'" >/dev/null
for _ in 1 2 3 4 5 6; do
  if cmux browser "$surface" wait --function "window.sendOut!==undefined" --timeout-ms 25000 >/dev/null 2>&1; then break; fi
done
send_out=$(cmux browser "$surface" eval --script "String(window.sendOut).slice(0,600)")
case "$send_out" in *pong*) pass "6 pi session replies pong" ;; *) bad "6 pi session: ${send_out:0:200}" ;; esac
window_send_reset=$(cmux browser "$surface" eval --script "window.sendOut=undefined;'s'" >/dev/null; echo ok)

call browser_open "{\"name\":\"${thread}\",\"url\":\"https://example.com\"}" >/dev/null
check "7a new tab" browser_new_tab "{\"name\":\"${thread}\",\"url\":\"https://example.org\"}" "Example Domain"
tabs_out=$(call browser_list_tabs "{\"name\":\"${thread}\"}")
tabs_text=$(printf '%s' "$tabs_out" | field text)
tab_index=$(printf '%s' "$tabs_text" | python3 -c 'import sys,json
try:
  tabs=json.loads(sys.stdin.read())
  print([t["index"] for t in tabs if "example.com" in t.get("url","")][0])
except Exception:
  print(-1)')
if [ "$tab_index" -ge 0 ]; then
  check "7b switch tab back" browser_switch_tab "{\"name\":\"${thread}\",\"index\":${tab_index}}" "Example Domain"
else
  bad "7b no example.com tab in ${tabs_text:0:160}"
fi

check "8 shell exec" thread_exec "{\"name\":\"${thread}\",\"command\":\"echo coil-parity-ok\"}" "coil-parity-ok"

host=$(call thread_exec "{\"name\":\"${thread}\",\"command\":\"pgrep -f [w]ebkit-host.py >/dev/null && echo webkit-host-running; pgrep -f [u]sr/lib/chromium/chromium >/dev/null && echo chrome-running; true\"}" | field text)
case "$host" in *webkit-host-running*) pass "webkit host running" ;; *) bad "webkit host not running: ${host:0:160}" ;; esac
case "$host" in *chrome-running*) bad "chrome still running" ;; *) pass "no chrome" ;; esac

exit $fail
