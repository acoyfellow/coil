set -u
export PATH=/sandbox/bin:/opt/busybox:/usr/local/bin:/usr/bin HOME=/root
(Xvfb :97 -screen 0 1280x800x24 -nolisten tcp >/tmp/x97.log 2>&1 &)
for _ in $(seq 1 50); do [ -e /tmp/.X11-unix/X97 ] && break; sleep 0.1; done
export DISPLAY=:97 GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 NO_AT_BRIDGE=1 COIL_PROTOCOL_FD=3
start=$(date +%s%N)
{ printf '{"id":1,"method":"open","params":{"url":"https://example.com"}}\0'; sleep 6; printf '{"id":2,"method":"screenshot","params":{}}\0'; sleep 4; } |
  timeout 25 dbus-run-session -- python3 -u /opt/coil/webkit-host.py 3>/tmp/shot.proto >/tmp/shot.log 2>&1
tr '\0' '\n' < /tmp/shot.proto | python3 -c '
import sys,json,base64
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    m=json.loads(line)
    if m.get("id")==1: print("open:", m.get("result") or m.get("error"))
    if m.get("id")==2:
        if "error" in m: print("screenshot error:", m["error"]); continue
        png=base64.b64decode(m["result"]["data"])
        open("/tmp/shot.png","wb").write(png)
        w=int.from_bytes(png[16:20],"big"); h=int.from_bytes(png[20:24],"big")
        print("screenshot:", len(png), "bytes", w, "x", h, "png" if png[:4]==b"\x89PNG" else "NOT PNG")
'
pkill -f "Xvfb :97"
