---
name: verify-lifecycle
description: Verify the coil thread lifecycle machine (one displayed state derived from phase/busy/compacting/wakeError). Use when changing src/lifecycle.ts, the phase/busy/compacting/wakeError flags in src/ledger.ts, or the lifecycle transitions in src/thread.ts.
---

# Verify the thread lifecycle

The coil thread shows exactly one state, derived from four stored flags:
`phase` (new/awake/paused), `busy`, `compacting`, `wakeError`. The derivation
in `src/lifecycle.ts` (`lifecycleOf`) is the single source: `compacting` outranks
`working`, which outranks `failed`, which outranks the phase.

Property: the displayed state is deterministic and never hides the truth that
matters most. Harm if it breaks: the user and the agent disagree about whether
the thread is working, sleeping, or broken.

## Check (one command)

```sh
cd ~/cloudflare/coil-webkit
npx vitest run test/lifecycle.test.ts
```

This must pass. It asserts the priority `compacting > working > failed > phase`.

## Model check (every order of steps)

```sh
cd ~/cloudflare/coil-webkit/verify/lifecycle
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH TLA2TOOLS=/tmp/fv/tools/tla2tools.jar
java -cp "$TLA2TOOLS" tlc2.TLC Lifecycle.tla
```

`Lifecycle.tla` models boot, work, compaction, and pause exactly as
`src/thread.ts` performs them. Read any violation with the pstack
`/statechart` skill (`statechart Lifecycle.tla --config lifecycle.cfg
--view view.js --out <new dir>`); an empty violation list means the model
holds in every reachable order.

## Telling a real bug from a modeling error

- If a vitest assertion fails after you changed `src/lifecycle.ts`, that is a
  real bug in your change — your reorder changed the priority the model proves.
- If TLC reports a violation the vitest suite never sees, compare the step
  against `src/thread.ts`: preconditions in the model are guards in the code
  (`compact()` refuses while busy; `pauseNow` refuses while busy and serializes
  against `compactNow`).

## Coverage record

Covers `src/lifecycle.ts` (`lifecycleOf`), `src/ledger.ts` (`phase`, `busy`,
`compacting`, `wakeError` flags), and the transitions in `src/thread.ts`
(`awakeInsideLifecycle`, `pauseNow`, busy-set in `send`, compacting in
`compactNow`). Sync commit: `e9865b7`. If any of those files change after this
commit, re-run this skill and move the sync commit forward only after the model
still describes the code.

## Known findings (do not "fix" — they are the reason this skill exists)

- A paused thread can be compacted (`compact()` does not wake; it only refuses
  while busy). The displayed state becomes `compacting` while `phase` is
  `paused` — compaction masks the sleep state. TLC proves this is reachable.
- A message during a manual compaction shows `compacting`, not `working`, for
  the duration of the compaction (`send()` sets `busy` outside `serialized()`).
