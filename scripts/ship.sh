#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat >&2 <<'USAGE'
usage: bun run ship -- deploy/<instance>.conf

Copy deploy/example.conf to deploy/<instance>.conf (git ignores it), fill it in,
and pass its path. One file per instance.
USAGE
  exit 2
}

conf="${1:-}"
[ -n "$conf" ] && [ -f "$conf" ] || usage

set -a
. "$conf"
set +a

auth="${COIL_AUTH:-access}"
case "$auth" in
  access) required="COIL_ACCOUNT_ID COIL_DOMAIN COIL_ACCESS_TEAM COIL_ACCESS_AUD NIX_IMAGE" ;;
  cloudflare) required="COIL_ACCOUNT_ID COIL_DOMAIN NIX_IMAGE COIL_OAUTH_CLIENT_ID" ;;
  *) echo "COIL_AUTH must be access or cloudflare, not $auth" >&2; exit 2 ;;
esac

missing=""
for key in $required; do
  [ -n "${!key:-}" ] || missing="$missing $key"
done
[ -z "$missing" ] || { echo "missing in $conf:$missing" >&2; exit 2; }

case "$NIX_IMAGE" in
  registry.cloudflare.com/"$COIL_ACCOUNT_ID"/*) ;;
  *) echo "NIX_IMAGE must be in this account's registry: registry.cloudflare.com/$COIL_ACCOUNT_ID/..." >&2; exit 2 ;;
esac

export CLOUDFLARE_ACCOUNT_ID="$COIL_ACCOUNT_ID"
export APK_PLAIN_HTTP="${COIL_APK_PLAIN_HTTP:-0}"
export COIL_WORKER_NAME="${COIL_WORKER_NAME:-}"
export COIL_WORKERS_DEV="${COIL_WORKERS_DEV:-0}"

instance=$(basename "$conf" .conf)
export COIL_WRANGLER_CONFIG="wrangler.$instance.local.jsonc"

if [ "${COIL_SKIP_BUILD:-0}" != 1 ]; then
  node scripts/build-term.mjs
  bash scripts/check.sh
fi
[ -s public/webkit-patch/parts.txt ] && [ -s public/webkit-patch/sha256.txt ] || {
  echo "public/webkit-patch is missing. Threads saved before WebKit need it. Run: bash scripts/build-webkit-patch.sh" >&2
  exit 2
}
node scripts/with-image.mjs

if [ "$auth" = access ]; then
  vars=(--var "COIL_AUTH:access" --var "ACCESS_TEAM_DOMAIN:$COIL_ACCESS_TEAM" --var "ACCESS_AUD:$COIL_ACCESS_AUD")
else
  vars=(--var "COIL_AUTH:cloudflare" --var "OAUTH_CLIENT_ID:$COIL_OAUTH_CLIENT_ID")
  [ -z "${COIL_USER_GATEWAY:-}" ] || vars+=(--var "COIL_USER_GATEWAY:$COIL_USER_GATEWAY")
fi
vars+=(--var "COIL_COMMIT:$(git rev-parse HEAD)")
[ -z "${COIL_MODEL:-}" ] || vars+=(--var "MODEL:$COIL_MODEL")
[ -z "${COIL_AI_GATEWAY:-}" ] || vars+=(--var "AI_GATEWAY:$COIL_AI_GATEWAY")
[ -z "${COIL_MODEL_GATEWAY_URL:-}" ] || vars+=(
  --var "MODEL_GATEWAY_URL:$COIL_MODEL_GATEWAY_URL"
  --var "MODEL_GATEWAY_HEADER:${COIL_MODEL_GATEWAY_HEADER:-authorization}"
)

if [ -n "${COIL_CONNECTORS_FILE:-}" ]; then
  [ -r "$COIL_CONNECTORS_FILE" ] || { echo "COIL_CONNECTORS_FILE $COIL_CONNECTORS_FILE is not readable" >&2; exit 2; }
  connectors=$(node -e 'const fs=require("fs");process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[1],"utf8"))))' "$COIL_CONNECTORS_FILE")
  vars+=(--var "CONNECTORS_JSON:$connectors")
fi

deploy() {
  if [ "$COIL_WORKERS_DEV" = 1 ]; then
    npx wrangler deploy -c "$COIL_WRANGLER_CONFIG" "${vars[@]}"
  else
    npx wrangler deploy -c "$COIL_WRANGLER_CONFIG" --domain "$COIL_DOMAIN" "${vars[@]}"
  fi
}
deploy || deploy

if [ -n "${COIL_MODEL_GATEWAY_TOKEN_COMMAND:-}" ]; then
  token=$(bash -c "$COIL_MODEL_GATEWAY_TOKEN_COMMAND")
  [ -n "$token" ] || { echo "COIL_MODEL_GATEWAY_TOKEN_COMMAND printed nothing" >&2; exit 1; }
  printf '%s' "$token" | npx wrangler secret put MODEL_GATEWAY_TOKEN -c "$COIL_WRANGLER_CONFIG" >/dev/null
  echo "model gateway token stored as a Worker secret"
fi

listed=$(CLOUDFLARE_ACCOUNT_ID="$COIL_ACCOUNT_ID" npx wrangler secret list -c "$COIL_WRANGLER_CONFIG" 2>/dev/null || true)
case "$listed" in
  *'"name": "CONNECTOR_SEAL_KEY"'* | *'"name":"CONNECTOR_SEAL_KEY"'*) echo "connector seal key is already a Worker secret" ;;
  *)
    openssl rand -base64 48 | tr -d '\n' | npx wrangler secret put CONNECTOR_SEAL_KEY -c "$COIL_WRANGLER_CONFIG" >/dev/null
    echo "connector seal key generated and stored as a Worker secret"
    ;;
esac

if [ "$auth" = cloudflare ]; then
  secrets=$(CLOUDFLARE_ACCOUNT_ID="$COIL_ACCOUNT_ID" npx wrangler secret list -c "$COIL_WRANGLER_CONFIG" 2>/dev/null || true)
  for name in OAUTH_CLIENT_SECRET SESSION_SECRET; do
    case "$secrets" in
      *"\"name\": \"$name\""* | *"\"name\":\"$name\""*) ;;
      *) echo "set the Worker secret $name first: CLOUDFLARE_ACCOUNT_ID=$COIL_ACCOUNT_ID npx wrangler secret put $name -c $COIL_WRANGLER_CONFIG" >&2; exit 1 ;;
    esac
  done
fi

bash scripts/check-edge.sh "$auth" "$COIL_DOMAIN"
