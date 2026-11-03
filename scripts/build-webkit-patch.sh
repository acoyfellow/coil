#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
old_image="${COIL_PATCH_FROM:-coil-computer-chrome}"
new_image="${COIL_PATCH_TO:-coil-computer-webkit}"
out=public/webkit-patch
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
list() {
  docker run --rm --platform linux/amd64 --entrypoint /sandbox/bin/bash "$1" -c \
    'cd / && /opt/busybox/busybox find usr lib etc opt -xdev \( -type f -o -type l \) -exec /opt/busybox/busybox md5sum {} + 2>/dev/null; cd / && /opt/busybox/busybox find usr lib etc opt -xdev -type l' |
    awk 'NF==2{print $2"\t"$1} NF==1{print $1"\tlink"}' | sort -u -k1,1
}
list "$old_image" > "$work/old.tsv"
list "$new_image" > "$work/new.tsv"
join -t "$(printf '\t')" -a 2 "$work/old.tsv" "$work/new.tsv" |
  awk -F '\t' 'NF==2 || $2!=$3 {print $1}' |
  grep -v -x -e etc/hostname -e etc/hosts -e etc/resolv.conf > "$work/files.txt"
grep -q -x opt/coil/webkit-host.py "$work/files.txt"
rm -rf "$out"
mkdir -p "$out"
docker run --rm -i --platform linux/amd64 --entrypoint /sandbox/bin/bash "$new_image" -c \
  'cat > /tmp/files.txt; cd / && /opt/busybox/busybox tar -cf - -T /tmp/files.txt | /opt/busybox/busybox gzip -6' \
  < "$work/files.txt" > "$work/patch.tgz"
split -b 20m -d -a 2 "$work/patch.tgz" "$out/part-"
for part in "$out"/part-*; do mv "$part" "$part.bin"; done
ls "$out" | grep "^part-.*\.bin$" | sort > "$out/parts.list" && mv "$out/parts.list" "$out/parts.txt"
shasum -a 256 "$work/patch.tgz" | cut -d ' ' -f 1 > "$out/sha256.txt"
echo "webkit patch: $(wc -l < "$work/files.txt") files, $(wc -c < "$work/patch.tgz") bytes, $(wc -l < "$out/parts.txt") parts"
