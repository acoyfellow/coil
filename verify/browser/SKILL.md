---
name: verify-browser
description: Verify the coil browser tabs machine (active tab is always a known member of the tab list, tabs are dense, URLs are normalized before the host sees them). Use when changing tab handling in src/browser.ts, the tab actions in src/thread.ts, or webkit-host.py's tab list.
---

# Verify the browser tabs machine

The webkit host keeps a dense list of tabs; `newTab` appends and activates,
`switchTab(index)` activates only an existing index, and the tab list is exactly
the host's views. Indexes are 0-based and dense, URLs are normalized before the
host sees them, and the active tab is always a member of the list. Tabs do not
survive a pause — the container is destroyed and the next boot starts empty; the
sealed cookie jar is what persists, not the tabs.

Property: the active index always refers to a real tab. Harm if it breaks: a
switch to a dead index, a dialog stuck on "unknown method", or a tab vanishing
from the list while it is active.

## Check (one command)

```sh
cd ~/cloudflare/coil
npx vitest run test/surfaces.test.ts
```

This must pass. It mounts surfaces and tab assertions against the worker
surface API.

## Model check (every order of steps)

```sh
cd ~/cloudflare/coil/verify/browser
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH TLA2TOOLS=/tmp/fv/tools/tla2tools.jar
java -cp "$TLA2TOOLS" tlc2.TLC Browser.tla
```

`Browser.tla` models `NewTab`, `SwitchTab`, and `Reset` (the pause-time wipe)
over three slots. Read any violation with the pstack `/statechart` skill
(`statechart Browser.tla --config browser.cfg --view view.js --out <new dir>`).

## Telling a real bug from a modeling error

- If a vitest surface assertion fails, your change altered host behavior — real
  bug.
- If TLC reports `ActiveIsKnown`, compare the model's `Reset` against the
  container destroy in `src/thread.ts`'s `pauseNow` (tabs die with the container).

## Coverage record

Covers `src/browser.ts` (`newTab`, `switchTab`, `listTabs`, `TabState`,
`normalizeUrl`), the tab actions in `src/thread.ts`, and the tab list in
`computer/webkit-host.py`. Sync commit: `e9865b7`. If any of those change after
this commit, re-run this skill and move the sync commit forward only after the
model still describes the code.
