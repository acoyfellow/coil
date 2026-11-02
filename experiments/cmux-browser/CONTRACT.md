# Spike: coil drives the cmux browser on the owner's Mac

Frozen before any code. Changes after the first run go in Deviations.

## Why
- **Where cmux use goes:** an audit of 762 Pi sessions found 88.5% of all cmux calls (44,116 of 49,851) are `cmux browser`. That is a real, logged-in WebKit browser on the Mac.
- **What the cloud browser can't do:** coil's cloud Chrome can't use passkeys (README Limits), and it isn't logged in to anything the owner uses.
- **What cmux already exposes:** the same browser, with snapshot refs, click, fill, press, eval, wait, screenshot, console, and url.

## Hypothesis
coil's existing `BrowserTools` contract (open, snapshot, click, type, key, evaluate, look, logs) can be served by the cmux browser through the `cmux` CLI. No new tool names are needed, and the agent's tool text keeps the same shape.

## Shape
- `src/browser-cmux.ts`: `cmuxBrowserTools(run, surface)` returns `BrowserTools`. `run` executes one `cmux` argv and returns its stdout.
- `experiments/cmux-browser/run.ts`: runs 6 fixed tasks against a real cmux browser surface, using only the `BrowserTools` methods, and checks each result by reading page state.
- A bridge from the cloud thread to the Mac is out of scope for this spike. It is the next step only if the gate passes.

## Gate (all must hold, 3 runs)
1. All 6 tasks succeed in 3 of 3 runs, judged by page state (url or `evaluate`), not by the tool reply.
2. The median tool call is under 500 ms.
3. Every method of `BrowserTools` is called at least once.
4. A disproof run: point the same tasks at a surface that is not a browser. Every task must fail with an error, never a false success.

## Disproof exit
If gate 1 or 4 fails and the cause is in cmux rather than the adapter, stop. Record it and do not build the bridge.

## Deviations
1. Before run real-1 counted: in the fixture page, the input was outside the form, so Enter could not submit it. This was a fixture bug, not an adapter bug. The input moved inside the form. Tasks and gate unchanged. real-1 is discarded and the runs start over.
