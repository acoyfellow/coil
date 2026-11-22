# Changelog

What changed in coil, newest first. Made from the git history. The history starts on 2026-11-11, when the repo was squashed onto one main branch.

## 2026-11-22

- **Needs you.** A thread that waits for your approval gets an orange dot and a shield icon in the sidebar. A collapsed folder shows a dot when a thread in it waits. Type `waiting` in the filter to see only those threads. A notification tells you when a thread starts to wait. `thread_list` returns a `waiting` count for each thread. (`c9317fc`)
- **Approval gate.** A `git push`, `gh pr merge`, deploy or publish that the agent starts waits for you before it runs. The thread shows the exact command with Deny and Approve. Over MCP, use `thread_approvals` and `thread_decide`. An answer applies only to that call with those arguments. After 24 hours with no answer, the call does not run. (`37984a3`)
- **Steer.** The steer button in the composer drafts the next message from a short goal, such as "get it unstuck", with the thread's own model. The draft goes into the message box and nothing is sent until you send it. Over MCP, use `thread_steer`. (`fe9ae76`)
- **Dependencies.** pi-durable, pi-ai, chord and pi-schema 1.6.0, effect 4.1.5, foldkit 0.171.0, wrangler 4.166.0. (`b750b4b`)

## 2026-11-16 to 2026-11-17

- **Restore fallback.** When a saved disk does not start, coil tries the 2 newest saved disks for 50 s each, then starts a clean computer. It leaves a note in the thread. (`4786c6a`, `d02c448`)
- **Deploy images are kept.** Coil no longer deletes old deploy images, because old saved disks can still need them. (`15d1fba`, reverts `401cff6`)

## 2026-11-15

- **Editor.** Tabs, Cmd-P quick open, more languages, a diff of what the agent changed, and a discard dialog. (`a6e0761`)
- **Sidebar.**
  - Pinned threads show a pin icon and the Pinned section always shows its rows. On mobile, a long press opens "Move to". (`780ed94`, `6f3e366`, `79c779c`)
  - Files saved while the computer sleeps show as pending. (`f9ea0ad`, `04f242e`)
- **Panel.** The computer panel is hidden when no thread is open. (`b137f4a`)
- **Stale status fixed.** A thread whose computer stopped by itself no longer shows as awake. (`e2f3be8`)

## 2026-11-13

- **Code editor.** CodeMirror 6 in a modal. Saves without starting the computer. (`2298a15`)
- **Sidebar and panel.** Folders, a move picker, a files-first panel and a history modal. Spend tracking removed. (`7e367af`)
- **Feed and composer.**
  - Scroll-follow stops on any upward scroll.
  - The computer toggle stays in the bar.
  - The composer fits its content and its placeholder. (`7f2f343`)

## 2026-11-12

- **Computers start only when needed.** This change added:
  - a lazy panel;
  - computer usage;
  - a workspace store, so files work while the computer sleeps;
  - a `run_js` isolate;
  - a git broker that keeps git tokens out of the computer. (`3811c7e`)
- **Pure PWA.** A native macOS WKWebView host was tried and then removed. It is kept on the `archive/native-wkwebview` branch. (`6c260ec`, `0d8f434`)
- **Domain model.** A separate domain model for threads, with story tests. (`7841ff1`)
- **Fixes.**
  - Dead browsers come back.
  - A repo can be attached after the thread is made.
  - Dev sign-in works.
  - The PWA title bar is fixed. (`a1453c3`)

## 2026-11-11

- **WebKit browsers and cookie copying.** Merged from the webkit-only spike. (`73191ec`, `9c5879c`, `b9e994e`)
