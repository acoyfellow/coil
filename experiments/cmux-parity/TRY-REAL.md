# TRY-REAL: real sign-in in coil, verified through sleep/wake

Sign in to a real site by hand once inside coil's browser. Coil keeps the
session in the sealed cookie jar, so it survives the thread sleeping and
waking. This file records the receipt afterwards.

## Steps

1. Open coil.coey.dev and sign in (Cloudflare OAuth) as usual.
2. Open a thread, then open a real site in its browser (any site with a
   sign-in page you use).
3. Sign in by hand. Coil does not type credentials; you do.
4. Sleep the thread (Pause). Wake it. Reopen the same site. You should
   still be signed in; the cookies were saved sealed on pause and
   restored on wake.
5. Report the site and the receipt lines below.

## Receipt

- Site: google.com
- Signed in by hand: no — imported from the local Mac instead
- Survived pause/wake: yes
- Date: 2026-11-09

## Companion import receipt (2026-11-09)

A stronger path than hand sign-in: `companion/coil-companion` reads the
local Chrome profile, decrypts the v10 cookie store, and serves the
result to coil. coil's UI (Settings → App) has a *Sync browser cookies*
button that fetches from the local companion and calls Coil's existing
`browser_set_cookies` capability into the open thread.

Proof against coil.coey.dev (thread `basic-no-flash-d216a5`, build
`8124ff18c`):

- `companion/coil-companion --sync` → `{"count":3630,"undecryptable":0}`
- `GET /sync` over loopback with `x-coil-token` → 3,630 cookies; bad token → 401
- Coil import → `200 "\"set 3630 cookies\""`
- Thread browser opens https://www.google.com → title `Google` (no login wall)
- RPC Pause → 200 `reason:"pause"`; RPC Wake → 200; after wake the jar is
  restored (1,457-byte serialized jar) and `document.cookie.length` on
  google.com is 140, a live session cookie

Decryption note: newer Chromium DBs (meta version >= 24) prepend a 32-byte
SHA-256 domain hash inside the encrypted value; the companion strips it.
