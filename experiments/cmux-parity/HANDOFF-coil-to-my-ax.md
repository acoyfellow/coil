# Handoff: port Coil's browser + cookie features into my-ax

Two features to implement into my-ax, from what shipped in Coil this month.

## 1. How Coil does browsers (WebKit hosts)

### What the architecture is

- **Per-thread host**: `webkit-host.py` — a Python process running *inside*
  the thread's Linux container, driving a headless **WebKit** (not Chromium).
  It exposes `newTab`, `switchTab`, cookies via WebKit's native
  `Cookies` storage (SQLite), persistent storage, and a viewport.
- **Client**: `src/browser.ts` is a typed client over that host; `src/browser-webkit.ts`
  builds the host image. `src/capabilities.ts` wires `browser_open`,
  `browser_snapshot`, `browser_click`, `browser_type`, `browser_eval`,
  `browser_screenshot`, `browser_new_tab`, `browser_switch_tab`,
  `browser_list_tabs`, `browser_get_cookies`, `browser_set_cookies`,
  plus `browser_run` (deterministic scripted batches).
- **Cookie storage**: the host persists a full SQLite jar across pauses
  (`cookies.sqlite`), and the worker saves a **sealed copy** of the jar
  (`COOKIE_JAR_KEY`, sealed with `CONNECTOR_SEAL_KEY`, AES-GCM) on pause and
  restores it on wake. This is what makes the jar survive pause/wake.
- **Observed cost**: cold start first open ~5–7s (up to ~18s when the
  container boots in the same call); container boot 20–26s; warm return
  ~1.5s; a11y API cost ~0 (accessibility support stays on).

### Where my-ax differs today

my-ax doesn't drive a remote host process per thread. It uses the cmux
browser locally (WKWebView) for the *human's* browsing feedback loop, and
server-side Chromium for the *worker*. This gives:

- more fidelity to what JS-for-Apple renders (WKWebView) for the *human*, but
- nothing deterministic: no tab/session model for the *agent*, no sealed jar
  on the remote side; browser capabilities are public-page-only, so
  self-checks behind Access end up needing a manual sign-in or a second path.

### Pros of the WebKit host model (Coil)

- **Deterministic, token-free operations**. A container-hosted browser is
  a machine you interrogate mechanically — `browser_open`, `browser_eval`,
  screenshots — with no model step per operation. A script (`browser_run`)
  replays a whole ritual in zero tokens.
- **Session ownership**. The host owns the tabs/cookies on the machine —
  nothing leaks between threads, and pause/wake restores exactly what was there.
- **Protocol-level cookies**. WebKit's native cookie store reads and writes
  cookies with all their attributes, including HttpOnly — no DOM/JS scraping.

### Cons / trade-offs

- **Real WebKit ≠ headless-browser assumptions.** Some sites detect headless
  WebKit and degrade; changelog/bot heuristics change form factor and fingerprint.
- **Cold-boot latency** (10–25s first boot) — needs pre-warm (the A/B measurements
  sit around 1.5s warm / ~2–5.5s cold host spawn).
- **Host needs buck-building discipline**: the container-image build pipeline
  (VM CA certs, per-account digests, image rebuild avoidance) is its own operational
  burden.
- **One engine.** If a user is attached to Chrome's extension model, WebKit is
  a different world.

### Recommended integration shape for my-ax

Port the *host protocol* (tabs/screenshot/cookies over a pipe), not the binary.
my-ax already makes containers; the minimal port is a process inside the container
listening on a pipe for `open`/`newTab`/`switchTab`/`snapshot`/`click`/`type`/
`eval`/`screenshot`/`cookies`/`setCookies`, with a SQLite cookie file. my-ax's
cmux/WKWebView feedback loop keeps doing what it's best at; the host does the
agent-grade deterministic part.

## 2. How Coil copies cookies (Chrome → jar)

### What shipped

A **scriptc-compiled native companion** (`companion/coil-companion.ts`, arm64,
100% static coverage 115/115 statements, no `node:sqlite` — it shells to the
`sqlite3` CLI instead). It reads the local Chrome profile, decrypts the cookie
store, serves it on loopback with a token, and Coil's UI calls
`browser_set_cookies` to import everything into the thread's jar. The jar is
sealed in the pause path exactly like hand-signed sessions, so it survives
pause/wake identically.

### The crypto (the critical part)

Current Chrome on macOS (DB meta version ≥ 24):

- Key derivation: PBKDF2-HMAC-SHA1(keychain password, `saltysalt`, **1003**,
  16) — the classic count is 1, wrong for v10 in new Chrome.
- AES-128-CBC with IV = 16×`0x20`, `v10`/`v20` prefix (hex `763130`/`763230`).
- **The domain-integrity prefix**: newer DBs prepend a 32-byte SHA-256 hash of
  the cookie's host-key domain *inside* the encrypted blob. After decryption,
  when meta version ≥ 24, the actual value starts at offset **32**
  (`plain.subarray(32)`), then PKCS7-unpad. Skip it and you get binary garbage.
  Verified against `browser_cookie3` (3145/3145 correctly-decoded cookies).

- Two Keychain entries possible: `Chrome Safe Storage` and
  `Chrome Safe Storage <random>` (user-profile-dependent). The companion
  reads `Chrome Safe Storage` via `security find-generic-password`.
- Newer Chrome versions multiplex profiles into multiple `Cookies` DBs
  (`Default/Cookies`, `Profile 1/Cookies`, etc.) — the companion picks the
  newest mtime (and supports both `Cookies` and `Network/Cookies` layouts).
- expiring cookies are filtered at export (only live cookies cross the wire).
- The `sqlite3` CLI is the only external dependency of the companion binary.

### Transport

- Loopback HTTP `127.0.0.1:18799`, token in `~/.coil-companion/token` (0600),
  CORS-enabled for PWA. Route: `GET /health` and `GET /sync` (JSON of
  `{name, value, domain, path, expires, httpOnly, secure}`).
- The Coil client calls `browser_set_cookies` with the JSON string against the
  **open thread** — that's what lands in the sealed jar.

### Why the user asked for no extension

Because an extension needs the user to click through Chrome Web Store + grant
`cookies` permission + click through per-import. A native companion process is a
one-time compile; the user just runs it and clicks Sync in Coil. macOS Full Disk
Access/Keychain prompts are the remaining UX (TCC + Keychain copy). The
trade-off vs extension: the companion must run a daemon on the Mac; the extension
runs inside Chrome. The system gate for both is "cookies must arrive in the jar."

## 3. my-ax integration plan

### Browsers (per Computer)

1. my-ax Computers (`scripts/` or provider layer) get the host process added —
   e.g. `webkit-host.py` ported to your Ubuntu Computer image. The host protocol
   surface is small: `open/newTab/switchTab/snapshot/click/type/eval/screenshot/cookies/setCookies`.
2. Deterministic capabilities layer in my-ax mirroring Coil's,
   prioritizing `open`, `snapshot`, `eval`, `screenshot`, cookies.
3. Add the pre-warm hook at Computer boot (`waitUntil(awake())` then a warm
   navigation), and measure cold-start against the 2000ms prompt.

### Cookie copying into Computer Browsers

4. my-ax's *browser surface* gets the same import path as "other browsers" —
   Chrome cookie export (`chrome.cookies.getAll`), Safari/WebKit exports
   (`Cookies.binarycookies`), and the companion for Chrome-profile import
   are three engines for the same job.
5. For the *remote Computers* themselves (Ubuntu boxes), the target formats
   differ: Chromium in the Computer has its own encrypted cookie store
   (`~/.config/chromium`/`chrome` `Cookies` SQLite, key *not* in Keychain —
   `--password-store=basic` or Linux keyring on the box). The companion's
   Chrome-profile decryption is macOS-specific; on Linux, use the
   `security` alternative `secret-tool`/GNOME Keyring or set the password
   store at launch time (`--password-store=basic`), then use the same export
   format (`{name, value, domain, path, expires, httpOnly, secure}`).
6. Update the sealed-jar lifecycle: put the imported jar through the same
   AES-GCM seal path used for hand-signed cookies in the Computer lifecycle.

### Ordered proof per my-ax

1. Computer host process serves `open`/`eval`/`screenshot` locally.
2. A `browser_set_cookies`-style capability on the Computer browser.
3. Import Chrome cookies from the Mac into the Computer jar.
4. Pause/wake round-trip preserves the jar with no resurrection needed.
5. Parity gate against a fixed task list under the construction machine.

## 4. Source pointers (Coil)

- Host: `computer/webkit-host.py` (tabs, `get_cookies`/`set_cookies`)
- Client: `src/browser.ts`, `src/browser-webkit.ts`
- Capability wiring: `src/capabilities.ts` (cookie ops), `src/service.ts`
- Sealed jar: `src/thread.ts` (`COOKIE_JAR_KEY`, `saveCookieJar`/`restoreCookieJar`),
  `src/connectors/seal.ts`
- Companion: `companion/coil-companion.ts`, `companion/tsconfig.json`,
  `companion/check-http.sh` (the script to exercise the binary)
- Integration receipt: `experiments/cmux-parity/TRY-REAL.md`
- Feature report + goals handoff: `experiments/cmux-parity/HANDOFF-goals.md`
