import { highlight, type Language } from './highlight';

export type GuideSection = {
  readonly id: string;
  readonly title: string;
  readonly html: string;
};

export type GuideGroup = { readonly title: string; readonly sections: readonly GuideSection[] };

const code = (lang: Language, body: string) =>
  `<pre data-lang="${lang}"><code>${highlight(lang, body)}</code></pre>`;

const callout = (kind: 'note' | 'tip' | 'warn', body: string) =>
  `<div class="callout ${kind}">${body}</div>`;

const rows = (pairs: readonly (readonly [string, string])[]) =>
  `<table><tbody>${pairs.map(([key, value]) => `<tr><th>${key}</th><td>${value}</td></tr>`).join('')}</tbody></table>`;

const OVERVIEW: GuideSection = {
  id: 'overview',
  title: 'What coil is',
  html: `<p class="lede">coil gives every agent thread its own Linux computer in the cloud. The thread has an agent, terminals, a real WebKit browser window (the engine Safari uses), and a disk. You and the agent use the same ones, from any device.</p>
<p>coil is one Cloudflare Worker. It is a working showcase of the Developer Platform primitives, each doing the job it is built for:</p>
${rows([
  [
    '<a href="https://developers.cloudflare.com/workers/">Workers</a>',
    'The front door: UI, API, MCP, and sign-in.',
  ],
  [
    '<a href="https://developers.cloudflare.com/durable-objects/">Durable Objects</a>',
    'One per thread. Runs the <a href="https://github.com/earendil-works/pi">Pi</a> agent, keeps the transcript, schedules loops, and survives restarts mid-turn.',
  ],
  [
    '<a href="https://developers.cloudflare.com/containers/">Containers</a>',
    'One Linux computer per thread, with a disk that is snapshotted on pause.',
  ],
  [
    '<a href="https://developers.cloudflare.com/workers-ai/">Workers AI</a>',
    'Open models, on the account that signs in.',
  ],
  [
    '<a href="https://developers.cloudflare.com/ai-gateway/">AI Gateway</a>',
    'Frontier models such as Claude, with the account&rsquo;s logs, limits, and billing.',
  ],
  ['Sign in with Cloudflare', 'OAuth, so each person brings their own account.'],
])}`,
};

const BYO: GuideSection = {
  id: 'bring-your-own-cloudflare',
  title: 'Bring your own Cloudflare',
  html: `<p>On an instance in <code>cloudflare</code> mode, people sign in with their Cloudflare account. coil then runs their model calls on <b>their</b> Workers AI and AI Gateway. The instance owner never pays for anyone else&rsquo;s inference, and never needs their keys.</p>
<p>This is the part that makes coil a template, not only an app. Anyone can ship a product on Cloudflare that runs on its users&rsquo; inference. Every new user is a Cloudflare account doing real work on Workers AI and AI Gateway.</p>
<h3>What happens when you sign in</h3>
<ol>
<li>coil sends you to Cloudflare&rsquo;s consent screen. You pick one account.</li>
<li>coil receives a token limited to these scopes: <code>user-details.read</code>, <code>account-settings.read</code>, <code>ai.read</code>, <code>ai.write</code>, <code>aig.read</code>, <code>aig.run</code>, and <code>offline_access</code> to stay signed in.</li>
<li>coil lists the account&rsquo;s AI Gateways and uses one with <b>authentication turned on</b>. It prefers the instance&rsquo;s <code>COIL_USER_GATEWAY</code>, then <code>default</code>, then the first one.</li>
<li>Each turn, coil refreshes the token if needed and calls the gateway with it. If the grant is gone, the turn fails. It never falls back to the instance&rsquo;s own AI.</li>
</ol>
${callout('tip', '<b>Set up your account once.</b> In the dashboard, open <b>AI &rarr; AI Gateway</b>, pick or create a gateway, and turn on <b>Authenticated Gateway</b>. For Claude and other provider models, add unified billing credits or a provider key to that gateway.')}
<h3>Errors you might see</h3>
${rows([
  [
    '<code>no AI Gateway with authentication turned on</code>',
    'Turn on authentication for a gateway in that account, then sign in again.',
  ],
  [
    '<code>402 Insufficient unified billing credits</code>',
    'The gateway works, but the account has no credits for provider models. Add credits, or pick a Workers AI model.',
  ],
  [
    '<code>x-api-key header is required</code>',
    'The gateway has authentication turned off, so it ignored the Cloudflare token. Turn it on.',
  ],
  [
    '<code>Sign in with Cloudflare again</code>',
    'The grant was revoked or expired. Sign in again.',
  ],
])}
<h3>Sign out and revoke</h3>
<p><b>Sign out</b> at the bottom of the sidebar ends the session, revokes coil&rsquo;s token with Cloudflare, and deletes the stored grant. You can also revoke coil at any time from your Cloudflare profile.</p>
<p>Check which account a session uses at <code>/oauth/me</code>.</p>`,
};

const QUICKSTART: GuideSection = {
  id: 'quickstart',
  title: 'Quickstart',
  html: `<ol class="steps">
<li><div><b>Sign in.</b> Choose the Cloudflare account coil should use.</div></li>
<li><div><b>Start a thread.</b> Optionally give it a Git repository; coil clones it into <code>/workspace</code>.</div></li>
<li><div><b>Pick a model</b> from the chip under the message box. Models that start with <code>gateway/</code> go through your AI Gateway.</div></li>
<li><div><b>Ask for something real.</b> For example: &ldquo;Build a counter page, serve it on port 3000, open it in the browser and click plus three times.&rdquo;</div></li>
<li><div><b>Watch the computer</b> on the right: terminals, files, and the live browser window the agent drives.</div></li>
<li><div><b>Pause</b> when you are done. The disk is saved. Come back later and the thread resumes.</div></li>
</ol>`,
};

const THREADS: GuideSection = {
  id: 'threads-and-computers',
  title: 'Threads and computers',
  html: `${rows([
    [
      'A computer per thread',
      '<code>/workspace</code> is a git repository. bash, git, node, python3, curl, ripgrep, and jq are installed. The image&rsquo;s git refuses force-push.',
    ],
    [
      'Terminals',
      'As many as you want. Each is a tmux session the agent can use too. Reload the page and the shell is still there.',
    ],
    [
      'A real browser',
      'A headed WebKit browser (the engine Safari uses) in the same computer, shown over VNC. It reaches the agent&rsquo;s <code>localhost</code>. The agent drives the same window you see.',
    ],
    [
      'Pause',
      'Saves the disk and stops the computer. Idle threads pause on their own after 9 minutes.',
    ],
    ['Fork', 'Starts a new thread from this disk plus a summary of the conversation.'],
    ['Compact', 'Records a summary and a disk snapshot together, so they always match.'],
    [
      'Child threads',
      'The agent can hand a side task to a child thread with its own computer, and wait for its answer.',
    ],
    [
      'Loops',
      'Run a prompt on a schedule until a gate command exits 0, a run count is reached, or you stop it.',
    ],
    [
      'Pi extensions',
      'Load vanilla Pi extensions into a thread from a Git URL or a path. They run inside the computer, unchanged.',
    ],
  ])}`,
};

const MODELS: GuideSection = {
  id: 'models',
  title: 'Models',
  html: `<p>Pick a model per thread from the chip under the message box, or with the <code>thread_model</code> capability.</p>
${rows([
  ['<code>@cf/...</code>', 'Workers AI models, run on the signed-in account.'],
  [
    '<code>gateway/claude-opus-5-5</code> and other <code>gateway/*</code>',
    'Provider models through AI Gateway on the signed-in account.',
  ],
])}
${callout('note', 'On an <code>access</code> instance, models run on the instance&rsquo;s own account instead, through its AI binding or a configured gateway.')}`,
};

const AGENTS: GuideSection = {
  id: 'agents',
  title: 'Drive coil from an agent',
  html: `<p>Everything in the UI is also a capability. The same list drives MCP, the <code>coil_run</code> code tool, REST, and the reference below.</p>
<h3>MCP</h3>
<p>Point an MCP client at <code>/mcp</code>. Call <code>coil_describe</code> for a TypeScript declaration of the <code>coil</code> object, then <code>coil_run</code> with the body of an async function:</p>
${code(
  'js',
  `const t = await coil.thread_create({ title: "demo" });
await coil.thread_exec({ name: t.name, command: "echo '<button>+</button>' > index.html && (busybox httpd -p 3000 &)" });
await coil.browser_open({ name: t.name, url: "localhost:3000" });
const page = await coil.browser_snapshot({ name: t.name });
await coil.thread_pause({ name: t.name });
return { thread: t.name, page };`,
)}
<h3>REST</h3>
${code(
  'sh',
  `curl -X POST https://<host>/api/capabilities/thread_send \\
  -H 'content-type: application/json' \\
  -d '{"name":"thread-abc123","text":"run the tests"}'`,
)}
<h3>Signing in</h3>
<p>Every call must be signed in. Behind Cloudflare Access, send an Access token in the <code>cf-access-token</code> header. With Sign in with Cloudflare, send the session cookie from <code>/oauth/login</code>. Without it, the API and <code>/mcp</code> answer 401.</p>
<p>Plain text for agents is at <a href="/llms.txt"><code>/llms.txt</code></a>.</p>`,
};

const DEPLOY: GuideSection = {
  id: 'deploy',
  title: 'Deploy your own',
  html: `<p>One command per instance. Each instance has one config file that never leaves your machine.</p>
<h3>You need</h3>
<ul>
<li>Bun and Docker (builds <code>linux/amd64</code>).</li>
<li>A Cloudflare account on Workers Paid with Containers and Workers AI, and <code>npx wrangler login</code>.</li>
<li>A zone in that account for the hostname.</li>
<li>The <a href="https://github.com/acoyfellow/nix-cf-proof">nix-cf-proof</a> base image in the account&rsquo;s registry.</li>
</ul>
<h3>Ship</h3>
${code(
  'sh',
  `git clone https://github.com/acoyfellow/coil && cd coil && bun install
cp deploy/example.conf deploy/mine.conf
$EDITOR deploy/mine.conf
bun run ship -- deploy/mine.conf`,
)}
<p><code>ship</code> runs the type check, lint, and tests, builds the computer image, deploys, and fails unless the URL answers with the sign-in mode you chose.</p>
<h3>Choose how people sign in</h3>
${rows([
  [
    '<code>COIL_AUTH=access</code>',
    'A Zero Trust Access application in front. Everyone admitted shares the instance&rsquo;s AI.',
  ],
  [
    '<code>COIL_AUTH=cloudflare</code>',
    'Sign in with Cloudflare. Each person&rsquo;s inference runs on their own account. No Access application on the host.',
  ],
])}
<h3>Sign in with Cloudflare setup</h3>
<ol>
<li>Create an OAuth client under <b>Manage Account &rarr; OAuth clients</b>: response type <code>code</code>, grants <code>authorization_code</code> and <code>refresh_token</code>, auth method <code>client_secret_basic</code>, redirect URL <code>&lt;your host&gt;/oauth/callback</code> on https.</li>
<li>Add the scopes Workers AI (Edit, Read), AI Gateway (Run, Read), User Details (Read), and Account Settings (Read).</li>
<li>Set <code>COIL_AUTH=cloudflare</code> and <code>COIL_OAUTH_CLIENT_ID</code> in your config.</li>
<li>Store the secrets on the instance account:</li>
</ol>
${code(
  'sh',
  `CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler secret put OAUTH_CLIENT_SECRET -c wrangler.mine.local.jsonc
openssl rand -hex 32 | CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler secret put SESSION_SECRET -c wrangler.mine.local.jsonc`,
)}
${callout('tip', 'To let anyone sign in, verify your domain with the DNS TXT record shown on the client, add a logo, and change the client to <b>public</b>. That change is permanent.')}`,
};

const LIMITS: GuideSection = {
  id: 'limits',
  title: 'Limits',
  html: `<ul>
<li><b>Passkeys and security keys do not work in the cloud browser.</b> Password and TOTP logins work and stay logged in.</li>
<li><b>A resumed computer gets its disk back, not its processes.</b> Terminals reopen in the same folders. Servers the agent started are gone until something starts them again.</li>
<li><b>The browser comes back on its last page, not its state.</b> The browser reopens the last web page it had open, with its cookies. The page reloads, so anything held only in the page starts over.</li>
<li><b>Agent commands stop after 120 seconds.</b> Start servers in the background. API and MCP commands stop after 10 minutes.</li>
<li><b>A Pi extension tool call stops after about 280 seconds.</b> Only tools load; extension commands and shortcuts are reported as unsupported.</li>
<li><b>Computers have internet access.</b> coil is not a sandbox for hostile code.</li>
<li><b>The browser view is 1280&times;800</b>, scaled to fit.</li>
</ul>`,
};

export const GUIDE: readonly GuideGroup[] = [
  { title: 'Start', sections: [OVERVIEW, BYO, QUICKSTART] },
  { title: 'Use', sections: [THREADS, MODELS, AGENTS] },
  { title: 'Run your own', sections: [DEPLOY, LIMITS] },
];
