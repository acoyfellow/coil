---
name: verify-loop
description: Verify the coil loop machine (loop.ts decide(): stop beats everything, then wait, then check-gate, then run — never runs while busy, stops at maxRuns or maxSpend). Use when changing src/loop.ts or the loop guard path in src/thread.ts.
---

# Verify the loop machine

`decide()` in `src/loop.ts` is a pure transition function: stop beats everything
(disabled, spend limit, run limit), then wait (busy or nextAt in the future),
then check-gate (the previous run's gate is unevaluated), then stop at maxRuns,
else run. The alarm in `src/thread.ts` re-arms every decision; a started run
flips `busy` for the turn and, when it ends, arms exactly one gate check.

Property: the loop never runs while the thread is busy, checks each gate
exactly once, and always terminates at its limits. Harm if it breaks: two agent
turns race on one thread, or an unexamined gate lets a failing loop run forever.

## Check (one command)

```sh
cd ~/cloudflare/coil
npx vitest run test/loop.test.ts
```

This must pass. It asserts the decision order and the stop reasons.

## Model check (every order of steps)

```sh
cd ~/cloudflare/coil/.agents/skills/verify-loop
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH TLA2TOOLS=/tmp/fv/tools/tla2tools.jar
java -cp "$TLA2TOOLS" tlc2.TLC Loop.tla
```

`Loop.tla` models the alarm loop (`Decide`), runs (`StartRun`/`FinishRun`), the
single gate check (`CheckGate`), and the manual stop (`Disable`). Read any
violation with the pstack `/statechart` skill (`statechart Loop.tla --config
loop.cfg --view view.js --out <new dir>`).

## Telling a real bug from a modeling error

- If a vitest decision assertion fails, your change reordered or dropped a
  `decide()` arm — real bug.
- If TLC reports `NeverRunsWhileBusy`, compare the model's `StartRun` guard
  against the alarm guard in `src/thread.ts` (`loop?.enabled && !busy`).

## Coverage record

Covers `src/loop.ts` (`decide`, `validSpec`, `LoopState`) and the alarm/loop-step
path in `src/thread.ts`. Sync commit: `e9865b7`. If either file changes after
this commit, re-run this skill and move the sync commit forward only after the
model still describes the code.
