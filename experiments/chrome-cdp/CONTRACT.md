# Spike: coil drives a real Chrome on the owner's Mac, with no cmux

Frozen before any code. Changes after the first run go in Deviations.

## Why
- The cmux-browser spike (branch `spike/cmux-browser`) passed: coil's `BrowserTools` run on the cmux browser. But that browser is still cmux.
- 88.5% of the owner's cmux calls are `cmux browser`. If a browser that is not cmux passes the same gate, cmux is no longer needed for that 88.5%.

## Hypothesis
The same `BrowserTools` contract can be served by Google Chrome over the Chrome DevTools Protocol (CDP), with no cmux and no npm dependency.

## Shape
- `src/browser-cdp.ts`: `cdpBrowserTools(endpoint)` returns `BrowserTools`. It talks CDP over one WebSocket to one page target.
- Refs: `snapshot` tags interactive elements with `data-coil-ref="eN"` and lists them as `[ref=eN]` lines, so the agent text keeps the cmux shape.
- `experiments/chrome-cdp/run.ts`: the same 6 tasks and checks as the cmux spike, copied unchanged except the adapter.
- Chrome runs with a dedicated `--user-data-dir` under `~/.coil/chrome-profile`. The owner's main profile is never touched. Logged-in state comes later, by the owner signing in once in that profile.

## Gate (all must hold, 3 runs) — same as the cmux spike
1. All 6 tasks succeed in 3 of 3 runs, judged by page state, not by the tool reply.
2. The median tool call is under 500 ms.
3. Every method of `BrowserTools` is called at least once.
4. Disproof: point the same tasks at a CDP port where nothing listens. Every task fails with an error, never a false success.

## Disproof exit
If gate 1 or 4 fails and the cause is CDP rather than the adapter, stop and record it.

## Not in scope
- Passkeys and signing in. The profile persists, so the owner signs in once by hand; not tested here.
- The cloud-to-Mac bridge.

## Deviations
1. After the gate passed: an extra sabotage run (`runs/sabotage-noop-input`) with click and type made into silent no-ops on a live Chrome. Every task that needs click or type failed (4 of 4); open-local and logs-and-look passed, which is correct because they use neither. It is filed outside `disproof-*` so the frozen gate 4 is unchanged.
2. The first dead-port disproof crashed before any task ran, which proves nothing. The runner now records the connect error per task. Adapter unchanged.
