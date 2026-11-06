# Try coil like cmux

Open your coil instance in your browser and pick a thread. Coil is the cmux replacement: it has its own Linux computer and its own WebKit browser (Safari's engine), and it plugs into nothing of cmux.

Do these 8 things by hand. The gate (`gate.sh` in this folder) does the same things on its own and checks each one.

## 1. Open a page and read its title

In the thread, ask the agent to open https://example.com, or use the browser view. The title should read "Example Domain".

## 2. Click and type on a page

Open https://example.com and use the browser. Click the "More information..." link. You should land on iana.org. Then open a page with a form, click the field and type something.

## 3. Take a screenshot and show it

Ask the agent to look at the page ("look" tool) or watch the browser live in the thread view. You should see the actual page, 1280x800.

## 4. Sign in by hand once, and check the session survives a pause

Watch the browser live (the VNC view in the thread) and sign in to a site with the mouse and keyboard, the way you would in cmux. Coil keeps the cookies in the browser profile on the thread's own disk. Pause the thread, then wake it. The site should still be signed in.

## 5. Run JavaScript on a page and read an API through it

Ask the agent to run JavaScript in the page, for example `document.title`, or to fetch the spikes.json file from the customer0 test site and read it back.

## 6. Run a pi session in the thread and send it a message

Send the thread agent a message ("Reply with exactly: pong"). It should answer "pong" from its own computer.

## 7. Have 2 tabs open and switch between them

Open one page in the browser, open a second tab (the + in the browser view), then switch back to the first. Each tab keeps its own page.

## 8. Run a shell command in the thread and read its output

Open the terminal in the thread and run `echo coil-parity-ok`. You should see `coil-parity-ok`.

## What is not in here yet

- Cold start: the first browser call in a new thread is slow (5-7 s).
- The second instance: the gate only checks the one instance.
- Real third-party logins beyond what the browser profile keeps.
