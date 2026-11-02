# Spike: coil's browser is WebKit only; Chrome is removed

Frozen before the first run. Changes after that go in Deviations.

## Question
Can WebKitGTK (Safari's engine, the same family of engine as the cmux browser) replace Chromium as coil's only browser, with no loss on the tasks the agent does today?

## Arms
- `chrome`: coil's current `Browser` class (`src/browser.ts`, CDP over a pipe), unchanged, driving Alpine `chromium` with coil's own `browserArgs()`.
- `webkit`: the new `WebKitBrowser` (`src/browser-webkit.ts`, WebDriver over HTTP), driving Alpine `webkit2gtk-6.0` MiniBrowser in automation mode under the same Xvfb.

Both arms implement the same methods, which `thread.ts` calls: `open`, `snapshot`, `clickRef`, `type`, `key`, `evaluate`, `screenshot`, `consoleLogs`, `back`, `reload`, `page`.

## Tasks (one fixture site served inside the container)
1. open-local: open `127.0.0.1:<port>`; then `location.href` is that URL.
2. click-three-times: click `plus` by snapshot ref 3 times; then the count is `3`.
3. type-into-ref: type `jordan` into the `name` ref; then the value is `jordan`.
4. enter-submits: type `ada`, press Enter; then the title is `sent ada`.
5. follow-link: click the `second page` ref; then the path is `/second`.
6. back: after follow-link, back; then the path is `/`.
7. logs-after-click: click `log`; then the console logs contain `clicked log`.
8. logs-during-load: the console logs contain `fixture ready`, written by an inline script while the page loads.
9. screenshot: the screenshot decodes to an image at least 1000 bytes long.
10. login-survives-restart: sign in (the server sets an HttpOnly cookie), export the cookies, restart the browser, restore them; then the page says `IN`.

## Metrics
- Tasks passed per arm, in each of 3 runs.
- Cold start: from launch to the first `open` finishing.
- Median call time per method.
- Installed size of the browser packages (`apk` size of chromium vs webkit2gtk-6.0 plus its dependencies).

## Gate for dropping Chrome (all must hold)
1. `webkit` passes every task that `chrome` passes, in 3 of 3 runs.
2. `webkit` cold start is at most 2× `chrome` cold start.
3. The `webkit` installed size is at most `chrome` + 100 MB.
4. Disproof: kill the browser process during a run; every later call must reject, with no false success.

## Disproof exit
If gate 1 fails on a task that coil's agent tools depend on (1–7, 9, 10), Chrome stays. Record which task failed and why.

## Out of scope
Running inside a deployed coil container (x86_64). This spike runs the same Alpine 3.22 packages in Docker on arm64. A deploy check is the next step, only if the gate passes.

## Deviations
1. Before any run counted: on this Mac's Docker network, TLS is intercepted (Python in the container also fails with "self-signed certificate in certificate chain"). This is a local environment limit, the same for both arms. No task uses https. Public https is checked in the deploy step instead.
2. Before any run counted: WebDriver has no console-log API, so the WebKit arm runs a small GTK host (`computer/webkit-host.py`) that embeds WebKit and speaks the same NUL-framed JSON pipe protocol as coil's Chrome CDP pipe. Input goes through xdotool, as real X events. The arms and gate are unchanged.
3. Before any run counted: the `chrome` arm fails task 4 (enter-submits) because coil's current `browser_key` sends CDP `Input.dispatchKeyEvent` Enter without `text: "\r"`, so no keypress fires and the form does not submit. This is a bug in coil's existing Chrome path, not in the harness. Task 4 stays as written, so it measures today's behaviour. A diagnostic task `enter-with-text-submits` (Enter with `text: "\r"`) was added for Chrome's sake. It is reported, but it is not one of the 10 gate tasks.
4. Before any run counted: the kill step for Chrome now matches the real binary (`/usr/lib/chromium/chromium`), because the Alpine launcher is a shell script, so `pkill -x chromium` missed it. WebKit is killed by a pidfile.
5. After runs 1–3 (gate passed): WebKit `clickRef` median was 16,121 ms. `xdotool mousemove --sync` waits for the pointer to move, and it stalls when the pointer is already at the target, which happens on repeated clicks of the same button. `--sync` was removed from click and scroll. Those runs are kept as `slow-run-*`, and all 3 runs were repeated.

## Results

Scored by `bun x tsx experiments/webkit-only/score.ts` on runs `run-1`..`run-3` (after Deviation 5). Per-run JSON is in `runs/`.

| | chrome | webkit |
|---|---|---|
| Gate tasks passed in 3/3 runs | 9/10 (fails enter-submits; see Deviation 3) | **10/10** |
| Cold start, median | 572 ms | **485 ms** |
| Browser packages installed over the shared base | 184 MB | **99 MB** |
| Median ms: open / evaluate / snapshot / clickRef / type / key / back / screenshot | 13 / 1 / 1 / 12 / 1 / 0 / 2 / 20 | 3 / 1 / 3 / 108 / 3 / 15 / 0 / 25 |
| Killed browser: later calls | all rejected | all rejected |

Gate: all 4 hold. **Pass.** Chrome is dropped.

### Real coil image (x86_64, Nix base, `computer/Dockerfile`)
- Built from `main` with Chrome: 797.6 MB. Built from this branch with WebKit: **713.2 MB** (84 MB smaller).
- In the WebKit image, `real-image-check.sh` started the display the way `browserArgs()` does, and then `webkit-host.py`:
  - ready in 2.4 s (x86_64 emulated on arm64);
  - a page console line arrived (`real image ready`);
  - title `coil real image`;
  - one real X click changed the counter to `1`;
  - the PNG screenshot is in `runs/real-image/real-image.png`;
  - x11vnc listened on 5900.
- Output: `runs/real-image/output.txt`.

### Not verified
- Public https: this Mac intercepts TLS, so no https page loaded in any container here (Deviation 1).
- The VNC panel and agent tools in a deployed thread. That needs a deploy.
