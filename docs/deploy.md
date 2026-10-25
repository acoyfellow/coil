# Deploying coil instances

One engine, many instances. Each instance is a `deploy/<name>.conf` file that git ignores, shipped with:

```sh
bun run ship -- deploy/<name>.conf
```

[`scripts/ship.sh`](../scripts/ship.sh) is the only deploy path. Do not run `wrangler deploy` by hand: it skips the checks below and can deploy one instance's settings into another account.

## The rules

1. **Private values stay out of git.** Account IDs, hostnames, Access team and audience, gateway URLs, and connector files live in `deploy/*.conf` and `deploy/*.json`. Git ignores both. `bun run check` fails if an account ID or token appears in a tracked file.
2. **Secrets go to Worker secrets, never to disk or to the repo.** `ship.sh` pipes each one straight into `wrangler secret put`.
3. **Short-lived tokens are minted at deploy time.** For a gateway behind Access, `COIL_MODEL_GATEWAY_TOKEN_COMMAND` runs `cloudflared access token` on your machine and stores the result as `MODEL_GATEWAY_TOKEN`. It is never written to a file. Ship again to rotate it.
4. **No service tokens for company resources on personal accounts.** A personal instance never holds a credential for an employee-only service. Employee-only features run only on an instance in the company account, behind Access.
5. **The host must match the sign-in mode.** `ship.sh` ends with [`check-edge.sh`](../scripts/check-edge.sh), which fails unless an `access` host answers with an Access login and a `cloudflare` host does not.
6. **Each instance has its own state.** Instances share source code only. They never share Durable Objects, secrets, or Access applications.

## Kinds of instance

| | Public | Private (company) |
| --- | --- | --- |
| Sign-in | `COIL_AUTH=cloudflare` (Sign in with Cloudflare) | `COIL_AUTH=access` (Zero Trust Access) |
| Model calls | Each user's own Workers AI and AI Gateway | The company gateway, through `COIL_MODEL_GATEWAY_*` |
| Secrets | `OAUTH_CLIENT_SECRET`, `SESSION_SECRET` | `MODEL_GATEWAY_TOKEN` (minted each ship), `CONNECTOR_SEAL_KEY` |
| Connectors | none | from `COIL_CONNECTORS_FILE` |

## Ship a private instance

Before the first ship:

1. `npx wrangler login` with access to the company account. Check with `npx wrangler whoami`.
2. `cloudflared access login <gateway Access app>` so the token command can mint a gateway token.
3. An Access application for exactly the instance hostname. Put its team URL and audience in the conf file.
4. `chmod 600 deploy/<name>.conf deploy/<name>.connectors.json`.

Then:

```sh
bun run ship -- deploy/<name>.conf
```

`ship.sh` does this, in order:

1. Checks the conf has every value its mode needs, and that the computer image is in the same account.
2. Runs typecheck, lint, and tests.
3. Writes `wrangler.<name>.local.jsonc` (git ignores it) and deploys to the account in the conf.
4. Runs the gateway token command and stores the result as `MODEL_GATEWAY_TOKEN`.
5. If `COIL_CONNECTORS_FILE` is set, passes the connector list as `CONNECTORS_JSON`. On the first ship it generates `CONNECTOR_SEAL_KEY` with `openssl rand` and stores it as a Worker secret. Later ships keep it.
6. Checks the host is behind Access.

After the ship, sign in through Access, open **Connectors** in the sidebar, connect each connector, and ask the agent to use it.

## Connectors

A connector is a remote MCP server that each user signs in to with their own OAuth account. coil uses OAuth dynamic client registration, PKCE (S256), a one-use `state` that expires after 10 minutes, and the RFC 8707 `resource` parameter.

`deploy/<name>.connectors.json`:

```json
{
  "portal": {
    "upstream": "https://mcp.example.com/mcp",
    "description": "What the agent can reach through it",
    "auth": {
      "authorizationEndpoint": "https://auth.example.com/authorize",
      "tokenEndpoint": "https://auth.example.com/token",
      "registrationEndpoint": "https://auth.example.com/register",
      "resource": "https://mcp.example.com"
    },
    "expose": ["search_docs"]
  }
}
```

- **`expose` is an allowlist.** The agent gets one tool per listed name, plus a `<id>__describe` tool that shows only those tools' schemas. Tools the server adds later stay hidden until you list them and ship again. Keep the list to reviewed read and search tools.
- Every URL must be `https` and must not carry credentials. A bad file disables all connectors and logs why. It does not stop the deploy.
- **Tokens are per user and sealed.** Each user gets their own `ConnectorStore` Durable Object. Access and refresh tokens are sealed with AES-GCM under a key derived from `CONNECTOR_SEAL_KEY` and that user's identity, so one user's token cannot be opened as another's. The agent never sees a token. It calls the tool, and the Worker adds the token.
- One refresh runs at a time for each user and connector. If the server refuses the refresh (400, 401 or 403), coil forgets the grant, and the agent tells the user to connect again.
- Rotating `CONNECTOR_SEAL_KEY` disconnects every user.

### Users connect from Settings

A user connects and disconnects in **Settings → Connectors** (the gear, ⌘, or ⌘K, then "Connect &lt;id&gt;"). There is no separate page: `/connectors` sends the user to `/?settings=connectors`. After the sign-in, or if it fails, coil returns the user to the same dialog, which shows the result.

### Allow the exact callback on the OAuth server

The OAuth server must accept coil's callback during dynamic client registration. For a Cloudflare Access MCP portal, open **Zero Trust → Access controls → MCP Portals → \<portal\> → Managed OAuth → Allowed redirect URIs** and add the exact callback of each connector on each instance:

```text
https://<instance-host>/connectors/<connector-id>/callback
```

- **Add the exact URI.** A `/*` wildcard entry is accepted by the form but does not match during registration (checked 2026-10-25). Registration then fails with `redirect_uri is not allowed by the account configuration`, and the Settings dialog shows that message.
- Do not widen the portal's access policy. The allowed redirect URIs only control where the OAuth answer may go; the portal's own policy still decides who may sign in.
- To check before a user tries, register a test client:

```sh
curl -sS -X POST https://<team>.cloudflareaccess.com/cdn-cgi/access/oauth/registration \
  -H 'content-type: application/json' \
  -d '{"client_name":"coil check","redirect_uris":["https://<instance-host>/connectors/<id>/callback"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none"}'
```

A `client_id` in the answer means the callback is allowed.

### Code Mode portals

If the portal turns Code Mode on, `tools/list` shows only portal tools (`portal_codemode_search`, `portal_codemode_execute`, …). coil still calls the allowed tools by name. The `<id>__describe` tool then reads their schemas through `portal_codemode_search`, so the agent sees the same allowlisted schemas either way.
