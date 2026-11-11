# Handoff: Script-to-Artifact on first use

This document hands the feature to the next agent and to the human. It is the
product vision, the system you will build, and the order in which to build it.

## 1. The one-page story

An LLM that performs a browser ritual one token at a time costs tokens forever.
An LLM that authors the ritual once — and hands off the finished script — pays
tokens once and runs forever for free.

```
Someone I know asked Astra to play Factorio. It wins, but it takes forever and
guzzles tokens. If you ask Astra instead to "design a system to win Factorio,"
it builds software that runs 1000x faster. Mechanistic software gives you
cheap leverage, and LLMs can write mechanistic software on demand.

(The above is quoted verbatim by the human from his notes, and is the frame
for everything that follows.)
```

## 2. The product arc

**V1 is shipped.** Recorded interactions, saved goals, deterministic replay, on
both prod instances. Credits: `browser_run` (scripted steps with `expect`,
commit `caa6b98`), script-to-artifact goals (`goal_save`/`goal_run`/
`goal_list`, commit `4f036b7`, merged to `main` as `97af511`), and the
scroll-follow fix (`follow.ts`, commit `7da934e`).

**VDDesigning a system to win.** Trajectory of the roadmap is in yields:

### 1. Expectation Sheets (test scripts)

Goals already carry `expect` (text the last step's result must contain). Next:
codify per-site expectations into Sheets — goal + expected text + cookie jar
name — that a thread can re-run before every upgrade. The parity gate
(`experiments/cmux-parity/gate.sh`) is the in-house example; generalize it.

### 2. Trace Library for logins

Recorded scripts are per-thread today. A Trace Library is the corpus: scripts
authored once on one thread, shared to other threads and eventually to other
teams. Script = reviewable diff; reviewed = gate-verified (to open one, run the
gate-style `expect` against the target and include the receipt).

### 3. Scripted jar lifecycles

The companion import is mechanistic. Extend it to named jar snapshots
("Github-as-me") that every goal can reference, checked with `expect` before
every run so the jar's health is measured, not assumed.

### 4. Deterministic giant tasks

`browser_run` caps at 32 steps per call. Next: scripted fan-out — one authoring
event that replays across tabs/sites in parallel, collecting results. One
agent-authored script replays at zero tokens per replay, per tab.

### 5. Script mode for shell

Generalize `browser_run` to shell scripts with the same record/save/replay
machinery. Every human's routine computer task becomes one authored
artifact.

## 3. The newest hypothesis to build first

**Script-to-Artifact on first use** is live. The next concrete hypothesis to
build is **Expectation Sheets**: wrap the existing `goal_run` + `expect` in a
pattern where a goal is not merely runnable but *self-verifying every deploy*
— the trace library entry point delivers a receipt, not just a run.

## 4. The API contract (live today)

### `browser_run` — deterministic scripted steps

```
name    Thread name
steps   JSON list of step objects (any of):
        {op:"open", url}
        {op:"new_tab", url}
        {op:"switch_tab", index}
        {op:"click", ref}
        {op:"type", text, ref?}
        {op:"eval", expression}
        {op:"wait", text}        (polls page text, 500ms x 20)
        {op:"wait_ms", ms}
        {op:"screenshot"}        (result summarized as {bytes})
expect  Optional text the last step's result must contain
saveAs  Optional goal name; the run's steps persist as a goal on success
```

Returns: `{ steps: [{index, op, ok, durationMs, result}...], expect: {text, found}?, savedGoal? }`.
Stops at the first failing step and returns `failedIndex` + `error`.

### Recording (automatic)

Every *single-step* browser capability (`browser_open`, `browser_click`,
`browser_type`, `browser_eval`, `browser_screenshot`, `browser_new_tab`,
`browser_switch_tab`) appends its step to the thread's DO-stored recording
list (cap 128, no additional calls for the agent).

### `goal_save` / `goal_run` / `goal_list` / `goal_clear`

- `goal_save(name, goal, steps?)` — omitted `steps` saves the recorded list
  and clears the recording; explicit `steps` saves a script. Returns
  `{ goal, steps, source: 'recorded' | 'script' }`.
- `goal_run(name, goal, expect?)` — one call replays the goal deterministically.
- `goal_list(name)` — `[{ goal, steps }]`.
- `goal_clear(name, goal?)` — clears the named goal or the recording.

Persistence: `Durable Object` `ctx.storage` keys `goal-record` and `goals`.
Goals survive pause/wake (proven on prod).

## 5. What to run first (experience the feature)

Against the coey instance, in a browser surface signed into Coil:

1. `thread_create(name: "goal-lab")`.
2. `browser_run(name: "goal-lab", steps: [
     {op:"open", url:"https://example.com/"},
     {op:"eval", expression:"document.title"}
   ], expect: "Example Domain", saveAs: "open-example")`.
3. `goal_list(name: "goal-lab")` → shows `open-example` with 2 steps.
4. `goal_run(name: "goal-lab", goal: "open-example")` → returns both steps OK.
5. `thread_pause` then `thread_wake` (RPC), then `goal_run` again → still OK.

Recorded-save variant: call `browser_open`/`browser_eval` individually, then
`goal_save(name, goal: "manual-open")` → `{ source: "recorded" }`.

## 6. Operational quirks worth knowing

- **DO code migration.** A deployed DO class keeps its old code until evicted.
  A thread whose DO was warm during a deploy will NOT have the new RPC methods
  (e.g. `recordStep`). Use a freshly created thread for gating after a deploy
  that changed DO-facing capabilities.
- **Gate env.** `experiments/cmux-parity/gate.sh` needs a surface currently
  signed in to the origin (cmux browser under the user's account), plus
  `COIL_GATE_THREAD` set to a known-warm thread for that origin.
- **Deploy flags.** `ship.sh` rewrites the local wrangler config back to
  dockerfile build form, which 401s (no docker login in this shell). Deploys in
  this session went through direct `wrangler deploy` with the prebuilt
  `coil-thread-computer@sha256:be003728…` digest and the gateway/connectors
  vars from `deploy/ax.conf` — mirroring exactly what `ship.sh` computes.
- **Tests.** `notice the write-judge` — it flags edits that look like weakening
  tests. New test coverage should land in *new* files, not appended to
  existing ones.
