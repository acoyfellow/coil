#!/usr/bin/env bash
set -uo pipefail
cat > /tmp/page.html <<'H'
<!doctype html><title>coil real image</title><h1 id=c>0</h1><button id=b onclick="c.textContent=+c.textContent+1">plus</button><script>console.log('real image ready')</script>
H
cd /tmp && python3 -m http.server 8123 >/dev/null 2>&1 &
export PATH=/sandbox/bin:/opt/busybox:/usr/local/bin:/usr/bin HOME=/root
export LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 GDK_BACKEND=x11 NO_AT_BRIDGE=1
python3 - <<'P'
import json, os, subprocess, time, base64
display = """if ! pgrep -x Xvfb >/dev/null; then setsid Xvfb :99 -screen 0 1280x800x24 -nolisten tcp -ac >/tmp/xvfb.log 2>&1 & fi
for i in $(seq 1 50); do [ -e /tmp/.X11-unix/X99 ] && break; sleep 0.1; done
pgrep -x openbox >/dev/null || DISPLAY=:99 setsid openbox >/tmp/openbox.log 2>&1 &
pgrep -x x11vnc >/dev/null || setsid x11vnc -display :99 -rfbport 5900 -forever -shared -nopw -noxdamage -quiet >/tmp/x11vnc.log 2>&1 &
true"""
subprocess.run(["bash", "-c", display])
started = time.time()
host = subprocess.Popen(["bash", "-c", "exec 3>&1 1>/tmp/browser.log 2>&1; DISPLAY=:99 COIL_PROTOCOL_FD=3 exec dbus-run-session -- python3 -u /opt/coil/webkit-host.py"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
buffer = b""
def frame():
    global buffer
    while b"\0" not in buffer:
        chunk = os.read(host.stdout.fileno(), 65536)
        if not chunk: raise SystemExit("host exited: " + open("/tmp/browser.log").read()[-600:])
        buffer += chunk
    one, buffer = buffer.split(b"\0", 1)
    return json.loads(one)
def call(ident, method, **params):
    host.stdin.write((json.dumps({"id": ident, "method": method, "params": params}) + "\0").encode()); host.stdin.flush()
    while True:
        message = frame()
        if message.get("method") == "console": print("console:", message["params"])
        if message.get("id") == ident: return message
while frame().get("method") != "ready": pass
print("ready_ms", round((time.time() - started) * 1000))
print("open", call(1, "open", url="http://127.0.0.1:8123/page.html").get("result"))
print("title", call(2, "evaluate", expression="document.title").get("result"))
print("click", call(3, "evaluate", expression="(()=>{const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()").get("result"))
at = call(4, "evaluate", expression="(()=>{const r=b.getBoundingClientRect();return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2)})()")["result"]["value"].split(",")
call(5, "click", x=int(at[0]), y=int(at[1])); time.sleep(0.5)
print("count", call(6, "evaluate", expression="c.textContent").get("result"))
shot = call(7, "screenshot")["result"]["data"]
print("screenshot_png_bytes", len(base64.b64decode(shot)))
open("/out/real-image.png", "wb").write(base64.b64decode(shot))
print("vnc_log", open("/tmp/x11vnc.log").read()[-80:].strip())
P
