#!/usr/bin/env bash
set -euo pipefail
BASE="${COIL_LOCAL:-http://localhost:8787}"
NAME="chat-$(date +%s)"
call() { curl -sf -m "${3:-60}" -X POST "$BASE/api/capabilities/$1" -H 'content-type: application/json' -d "$2"; }

curl -sf -m 10 -o /dev/null "$BASE/" || { echo "local coil is not running at $BASE"; exit 1; }

call thread_create "{\"name\":\"$NAME\",\"title\":\"local chat check\"}" >/dev/null
call thread_write_file "{\"name\":\"$NAME\",\"path\":\"notes.md\",\"content\":\"# saved without a computer\"}" >/dev/null
READ=$(call thread_read_file "{\"name\":\"$NAME\",\"path\":\"notes.md\"}")
JS=$(call thread_run_js "{\"name\":\"$NAME\",\"code\":\"return fs.read('notes.md').length;\"}")
USAGE=$(call thread_usage "{\"name\":\"$NAME\"}")
VIEW=$(call thread_status "{\"name\":\"$NAME\"}")

echo "read:  $READ"
echo "js:    $JS"
echo "usage: $USAGE"

python3 - "$READ" "$JS" "$USAGE" "$VIEW" <<'PY'
import json, sys
read, js, usage, view = (json.loads(arg) for arg in sys.argv[1:])
assert read == '# saved without a computer', read
assert js['ok'] is True and js['result'] == 26, js
assert usage['boots'] == 0, usage
assert view['running'] is False, view
print('local: file + run_js worked and the computer never started')
PY
