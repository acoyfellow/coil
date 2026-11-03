#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
patch=public/webkit-patch
args=$(npx tsx -e "import {browserArgs} from './src/browser.ts'; process.stdout.write(browserArgs()[2])")
id=$(docker run -d --platform linux/amd64 --entrypoint /sandbox/bin/sleep coil-computer-chrome infinity)
trap 'docker rm -f "$id" >/dev/null' EXIT
docker exec "$id" /sandbox/bin/bash -c 'test ! -e /opt/coil/webkit-host.py' && echo "before: no webkit (old disk)"
docker exec "$id" /sandbox/bin/bash -c 'mkdir -p /tmp/coil-webkit-patch'
for part in $(cat "$patch/parts.txt"); do docker exec -i "$id" /sandbox/bin/bash -c "cat > /tmp/coil-webkit-patch/$part" < "$patch/$part"; done
start=$(date +%s)
docker exec "$id" /sandbox/bin/bash -c "export PATH=/sandbox/bin:/opt/busybox:/usr/local/bin:/usr/bin; set -e; cd /tmp/coil-webkit-patch; cat $(tr '\n' ' ' < "$patch/parts.txt") > patch.tgz; echo '$(cat "$patch/sha256.txt")  patch.tgz' | sha256sum -c - >/dev/null; cd / && tar -xzf /tmp/coil-webkit-patch/patch.tgz; rm -rf /tmp/coil-webkit-patch"
echo "install: $(( $(date +%s) - start )) s"
docker exec "$id" /sandbox/bin/bash -c 'test -f /opt/coil/webkit-host.py && test -x /usr/libexec/webkitgtk-6.0/WebKitWebProcess' && echo "after: webkit present"
docker cp experiments/webkit-only/prodlike.sh "$id:/p.sh" >/dev/null
docker exec -e ARGS="$args" "$id" /sandbox/bin/bash /p.sh
