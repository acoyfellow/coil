---
name: verify-turn
description: Verify the coil turn machine (coil_turns open/done rows: at most one open turn, open row is always the newest, finished rows were once started). Use when changing startTurn/openTurn/finishTurn in src/ledger.ts or turn bookkeeping in src/thread.ts.
---

# Verify the turn machine

Every agent turn is a row in `coil_turns`: `done = 0` when it starts,
`done = 1` when it ends. `openTurn()` returns the newest undone row;
`finishTurn(seq)` closes exactly one row. `busy` on the ledger is what stops a
second `startTurn()` from inserting a second open row, and a crashed run leaves
its row open until the next send closes it from the recovered row.

Property: there is never more than one open turn, and the open row is always the
newest. Harm if it breaks: recovery reads the wrong turn and either drops the
user's work or double-counts turns.

## Check (one command)

```sh
cd ~/cloudflare/coil-webkit
npx vitest run test/thread.test.ts
```

This must pass. It exercises send/finish paths and the busy guard that keeps
startTurn from interleaving.

## Model check (every order of steps)

```sh
cd ~/cloudflare/coil-webkit/.agents/skills/verify-turn
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH TLA2TOOLS=/tmp/fv/tools/tla2tools.jar
java -cp "$TLA2TOOLS" tlc2.TLC Turn.tla
```

`Turn.tla` models `StartTurn`, `FinishTurn`, and `Recover` (the crashed-turn
recovery the next send performs). Read any violation with the pstack
`/statechart` skill (`statechart Turn.tla --config turn.cfg --view view.js
--out <new dir>`).

## Telling a real bug from a modeling error

- If a vitest turn assertion fails, your change removed or widened the busy
  guard — real bug.
- If TLC reports `AtMostOneOpen`, compare the model's `StartTurn` precondition
  against `src/thread.ts`'s `busy` guard around `startTurn`.

## Coverage record

Covers `src/ledger.ts` (`startTurn`, `openTurn`, `finishTurn`, the `coil_turns`
table) and the busy/turn pairing in `src/thread.ts`. Sync commit: `e9865b7`. If
either file changes after this commit, re-run this skill and move the sync commit
forward only after the model still describes the code.
