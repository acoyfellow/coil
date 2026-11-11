---
name: verify-live
description: Verify the coil live event inference machine (src/live.ts: tool_start/tool_output/tool_end are emitted exactly once per callId, deltas never repeat, end never precedes start or full output). Use when changing src/live.ts or the Seen bookkeeping it carries.
---

# Verify the live event machine

`src/live.ts` turns the pi-durable `LiveState` into live events: `tool_start`
once per callId, `tool_output` as appended deltas of the slot's growing output,
`tool_end` once per callId. The `seen.started`/`seen.ended` sets enforce the
once-only contract, and the `appended()` helper drops already-delivered text so
deltas never repeat. A turn end is inferred when `live.run?.turns` advances or
goes undefined; the first snapshot after attach is swallowed so no event is
emitted twice.

Property: every tool call yields exactly one `tool_start` and one `tool_end`,
in order, with output deltas that never repeat. Harm if it breaks: the UI
shows ghost tools or double events, or output text is dropped.

## Check (one command)

```sh
cd ~/cloudflare/coil-webkit
npx vitest run test/live.test.ts
```

This must pass. It feeds synthetic `LiveState` snapshots and asserts the emitted
event streams.

## Model check (every order of steps)

```sh
cd ~/cloudflare/coil-webkit/verify/live
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH TLA2TOOLS=/tmp/fv/tools/tla2tools.jar
java -cp "$TLA2TOOLS" tlc2.TLC Live.tla
```

`Live.tla` models start/output/end per callId over a bounded slot set. Read any
violation with the pstack `/statechart` skill (`statechart Live.tla --config
live.cfg --view view.js --out <new dir>`).

## Telling a real bug from a modeling error

- If a vitest event-stream assertion fails, your change altered the once-only
  contract by hand — real bug.
- If TLC reports `EndRequiresStart`, compare the model's `ToolEnd` precondition
  against the `slot.status === 'done'` guard in `src/live.ts`.

## Coverage record

Covers `src/live.ts` (`liveEvents`, `toolEvents`, `messageEvents`, `turnEvents`)
and the `Seen` bookkeeping. Sync commit: `e9865b7`. If `src/live.ts` changes
after this commit, re-run this skill and move the sync commit forward only
after the model still describes the code.
