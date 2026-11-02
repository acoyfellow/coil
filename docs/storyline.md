# coil demo video: storyline

About 75 seconds. 2:1 frame, real time except where marked. No voiceover: short captions carry it.
Every shot is a real run on a deploy. Nothing is mocked.

## The one idea

The agent and you use the same computer. You can see that, because you type in its terminal and
click in its browser while it works.

## Shots

| # | Time | On screen | Caption |
| --- | --- | --- | --- |
| 0 | 0:00–0:03 | Title card: coil logo, dark | coil |
| 1 | 0:03–0:10 | Empty thread. Type the prompt and send it: "Build a counter page with a + button, serve it on localhost:3000, and commit it." | Every thread gets its own computer. |
| 2 | 0:10–0:22 | Tool calls stream in: files written, `npm`/`node` started, `git commit`. Speed this up 2× and mark it in a corner. | The agent works in a real shell. |
| 3 | 0:22–0:32 | Open a terminal with **+**. Type `ls` and `git log --oneline -1`. The agent's file and commit are there. | You get a terminal on the same machine. |
| 4 | 0:32–0:45 | Open the browser panel at `localhost:3000`. The counter page loads. Click **+** twice: it shows 2. | Its browser opens its localhost. |
| 5 | 0:45–0:55 | Send: "Click + three more times and tell me the number." The agent's clicks show up on the same live page. It replies "5". | You both drive the same page. |
| 6 | 0:55–1:05 | Press **Pause**. The status changes to paused. Send "What's in the repo?" The computer resumes and the agent lists the files. | Pause saves the disk. The next message brings it back. |
| 7 | 1:05–1:10 | Press **Fork**. The new thread reads the same file. | Fork starts a new thread from this disk. |
| 8 | 1:10–1:15 | End card: `github.com/acoyfellow/coil` and "Deploy your own on Cloudflare" | github.com/acoyfellow/coil |

## Why this order

- Shots 1–2 show the agent working, which every demo shows.
- Shots 3–5 are the part only coil does. You join the agent's terminal and browser, then the agent
  uses the page you just used. The counter going from 2 to 5 shows you share one browser: a
  screenshot can't show that.
- Shots 6–7 answer "what happens to the computer". Keep them short. They are proof, not the point.

## Cut if it runs long

- Shot 7 (fork) goes first.
- Shot 3 can end after `git log`.
- Don't cut shot 5. It is the shot that proves the claim.

## Leave out

- The model picker, usage meter, rename, archive and delete from `a51d6e2`. They are useful, but they
  don't show the one idea. A later short video can cover them.
- Child threads, warm bases and MCP. Mention them in the post text, not in the video.
- The phone layout. Use `docs/hero-phone.png` in the post if you want it.

## Before recording

- [ ] Record on the current deploy, not an old one. The old receipt still shows the name burrow.
- [ ] Check that Stop, the model picker and the meter from `a51d6e2` don't clutter the bar in a 2:1
      frame. Hide them or crop if they do.
- [ ] Do a full dry run first. Shot 5 depends on the agent counting the clicks correctly. Re-record
      if it says the wrong number. Don't edit the number.
- [ ] Use a new thread name so the sidebar holds only this thread.
- [ ] Show the real time on the 2× section. Don't hide the speed-up.
- [ ] Turn on a cursor highlight so viewers can see your clicks next to the agent's.

## Post text (draft)

The agent and I share one computer. I typed in its terminal and clicked in its browser while it
worked, then it clicked the same page. Each coil thread is a Cloudflare Container with tmux and
WebKit inside. Open source, deploy your own: github.com/acoyfellow/coil
