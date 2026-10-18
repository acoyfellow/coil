import { FONTS, THEME } from '../ui/style';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const CLOUD = '<img class="cloud" src="/brand/cloudflare-cloud.svg" alt="" width="33" height="15">';

const GITHUB = '<img class="gh" src="/brand/github.svg" alt="" width="20" height="20">';

type Point = { readonly icon: string; readonly title: string; readonly body: string };

const POINTS: readonly Point[] = [
  {
    icon: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
    title: 'Your inference, your account',
    body: 'Every model call runs on the Workers AI and AI Gateway of the account you pick, under your limits and your logs.',
  },
  {
    icon: 'M4 5h16v11H4zM9 20h6M12 16v4',
    title: 'A computer per thread',
    body: 'Each thread gets its own Linux machine with a disk that stays. Pause it, close the tab, pick it up tomorrow.',
  },
  {
    icon: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 9a9 9 0 0 1-9 9',
    title: 'Fork any idea',
    body: 'Branch a thread from the exact same point to try another approach, and keep both.',
  },
];

const point = ({ icon, title, body }: Point) =>
  `<li><span class="icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg></span><div><strong>${title}</strong><span>${body}</span></div></li>`;

const STEPS: readonly string[] = [
  'Pick an account on Cloudflare&rsquo;s consent screen.',
  'coil uses an <b>AI Gateway with authentication on</b> in that account.',
  'Usage lands on that account. <b>Revoke anytime</b> in your Cloudflare profile.',
];

const STYLE = `${THEME}
*{box-sizing:border-box}
html,body{min-height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 var(--sans);font-optical-sizing:auto;-webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background:url(/brand/loops-light.svg) repeat;opacity:.9;-webkit-mask:radial-gradient(ellipse 70% 60% at 70% 40%,#000 0%,transparent 75%);mask:radial-gradient(ellipse 70% 60% at 70% 40%,#000 0%,transparent 75%);pointer-events:none;z-index:-1}
body::after{content:'';position:fixed;width:720px;height:720px;right:-200px;top:-260px;background:radial-gradient(circle,color-mix(in srgb,var(--orange) 16%,transparent),transparent 65%);pointer-events:none;z-index:-1}
@media (prefers-color-scheme:dark){body::before{background-image:url(/brand/loops-dark.svg)}}
.page{min-height:100vh;display:grid;grid-template-rows:auto 1fr auto;max-width:1160px;margin:0 auto;padding:28px 40px}
header{display:flex;align-items:center;justify-content:space-between}
header img{height:24px;display:block}
nav{display:flex;gap:4px}
nav{align-items:center}
nav a{display:flex;align-items:center;color:var(--dim);font-size:13.5px;text-decoration:none;padding:7px 12px;border-radius:9px}
.gh{display:block}
@media (prefers-color-scheme:dark){.gh{filter:invert(1)}}
nav a:hover{color:var(--text);background:var(--hover)}
.hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(340px,.8fr);gap:72px;align-items:center;padding:56px 0}
.eyebrow{display:inline-flex;align-items:center;gap:9px;font:500 12px/1 var(--mono);letter-spacing:.01em;color:var(--orange);background:var(--orange-soft);padding:8px 12px 8px 10px;border-radius:99px;margin:0 0 26px}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--orange);animation:beat 2.4s ease-in-out infinite}
@keyframes beat{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--orange) 45%,transparent)}50%{box-shadow:0 0 0 6px transparent}}
h1{font-size:clamp(38px,5.2vw,62px);line-height:1;letter-spacing:-.04em;font-weight:600;margin:0 0 22px}
h1 em{font-style:normal;background:linear-gradient(100deg,#f38020 10%,#fbad41 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{font-size:18px;line-height:1.5;color:var(--dim);max-width:31em;margin:0 0 40px}
.lede b{color:var(--text);font-weight:500}
ul{list-style:none;margin:0;padding:0;display:grid;gap:20px;max-width:34em}
li{display:grid;grid-template-columns:40px 1fr;gap:16px;align-items:start}
.icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--bg);border:1px solid var(--line2);box-shadow:0 1px 0 var(--line)}
.icon svg{width:20px;height:20px;fill:none;stroke:var(--text);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
li strong{display:block;font-weight:600;font-size:15px;letter-spacing:-.005em;margin:2px 0 3px}
li span{color:var(--dim);font-size:14px}
.stage{position:relative;isolation:isolate}
.stage::before{content:'';position:absolute;inset:-90px -110px;z-index:-1;background:url(/brand/truchet-orange.svg) center/192px repeat;-webkit-mask:radial-gradient(closest-side,#000 25%,transparent 100%);mask:radial-gradient(closest-side,#000 25%,transparent 100%);opacity:.55;animation:drift 60s linear infinite}
@keyframes drift{to{background-position:192px 192px}}
@media (prefers-color-scheme:dark){.stage::before{opacity:.4}}
.floor{position:fixed;left:0;right:0;bottom:0;height:46vh;z-index:-1;pointer-events:none;background:url(/brand/dots-light.svg) repeat;background-size:20px;-webkit-mask:linear-gradient(to top,#000 0%,transparent 100%);mask:linear-gradient(to top,#000 0%,transparent 100%)}
@media (prefers-color-scheme:dark){.floor{background-image:url(/brand/dots-dark.svg)}}
.card{position:relative;background:color-mix(in srgb,var(--bg) 88%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid var(--line2);border-radius:22px;padding:34px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 30px 60px -30px rgba(0,0,0,.25)}
.card::before{content:'';position:absolute;inset:-1px;border-radius:inherit;padding:1px;background:linear-gradient(160deg,color-mix(in srgb,var(--orange) 55%,transparent),transparent 40%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.card h2{font-size:22px;letter-spacing:-.02em;font-weight:600;margin:0 0 6px}
.card p{color:var(--dim);font-size:14px;margin:0 0 26px}
.cta{display:flex;align-items:center;justify-content:center;gap:12px;height:52px;border-radius:14px;background:var(--text);color:var(--bg);font-weight:500;font-size:15.5px;letter-spacing:-.005em;text-decoration:none;transition:transform .14s ease,box-shadow .14s ease}
.cta:hover{transform:translateY(-1px);box-shadow:0 10px 24px -10px color-mix(in srgb,var(--text) 60%,transparent)}
.cta:active{transform:translateY(0)}
.cta:focus-visible{outline:2px solid var(--orange);outline-offset:3px}
.cloud{width:33px;height:15px;flex:none;display:block}
.steps{list-style:none;margin:26px 0 0;padding:22px 0 0;border-top:1px dashed var(--line2);display:grid;gap:12px;counter-reset:step;max-width:none}
.steps li{grid-template-columns:24px 1fr;gap:12px;font-size:13.5px;color:var(--dim);counter-increment:step;align-items:center}
.steps li::before{content:counter(step);width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:500 11.5px var(--mono);background:var(--raise);color:var(--text)}
.steps b{color:var(--text);font-weight:500}
.alert{display:grid;grid-template-columns:18px 1fr;gap:10px;padding:13px 14px;margin:0 0 20px;border-radius:12px;background:color-mix(in srgb,var(--bad) 8%,var(--bg));border:1px solid color-mix(in srgb,var(--bad) 28%,transparent);font-size:13.5px}
.alert svg{width:18px;height:18px;fill:none;stroke:var(--bad);stroke-width:2;stroke-linecap:round;margin-top:2px}
footer{display:flex;flex-wrap:wrap;gap:8px 20px;justify-content:space-between;align-items:center;color:var(--faint);font-size:12.5px;padding-top:12px}
footer a{color:var(--dim);text-decoration:none}
footer a:hover{color:var(--text)}
footer .stack{font-family:var(--mono);font-size:11.5px}
@media (max-width:900px){.page{padding:20px}.hero{grid-template-columns:1fr;gap:28px;padding:24px 0}.card{padding:24px}.lede{margin-bottom:0}.hero ul{order:3}.stage{order:2}.stage::before{inset:-40px -20px}body::after{width:480px;height:480px}}
@media (max-width:900px){.hero{gap:0}.hero>section:first-child{display:contents}.eyebrow{justify-self:start;margin-bottom:18px}h1{margin-bottom:14px}.lede{margin-bottom:24px;font-size:16.5px}.hero>section:first-child>*{order:1}.hero>section:first-child>ul{order:3;margin-top:36px}}
@media (prefers-reduced-motion:reduce){.cta,.eyebrow i,.stage::before{transition:none;animation:none}}
`;

const alert = (error: string) =>
  `<div class="alert" role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg><div>${escapeHtml(error)}</div></div>`;

export type SignInPage = {
  readonly origin: string;
  readonly error?: string;
  readonly back?: string;
};

export const signInPage = ({ origin, error, back = '/' }: SignInPage) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>coil · bring your own Cloudflare</title>
<meta name="description" content="One thread, one agent, one computer. Sign in with Cloudflare and coil runs on your own Workers AI and AI Gateway.">
<meta property="og:title" content="coil · bring your own Cloudflare">
<meta property="og:description" content="One thread, one agent, one computer. Runs on your own Cloudflare account.">
<link rel="canonical" href="${escapeHtml(origin)}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="coil">
<meta property="og:url" content="${escapeHtml(origin)}/">
<meta property="og:image" content="${escapeHtml(origin)}/brand/coil-social.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="coil: agent threads with their own computer, in the cloud.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="coil · bring your own Cloudflare">
<meta name="twitter:description" content="One thread, one agent, one computer. Runs on your own Cloudflare account.">
<meta name="twitter:image" content="${escapeHtml(origin)}/brand/coil-social.png">
<meta name="theme-color" content="#f38020">
<link rel="icon" href="/icons/favicon.svg">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body>
<div class="floor" aria-hidden="true"></div>
<div class="page">
<header>
<img src="/brand/coil-wordmark.svg" alt="coil">
<nav><a href="/docs">Docs</a><a href="https://github.com/acoyfellow/coil" aria-label="GitHub">${GITHUB}</a></nav>
</header>
<main class="hero">
<section>
<p class="eyebrow"><i></i>Bring your own Cloudflare</p>
<h1>One thread, one agent, <em>one computer.</em></h1>
<p class="lede">coil gives every thread its own Linux machine and an agent to drive it. Sign in with Cloudflare and it runs on <b>your</b> models, in <b>your</b> account.</p>
<ul>${POINTS.map(point).join('')}</ul>
</section>
<div class="stage"><section class="card" aria-labelledby="start">
<h2 id="start">Start a thread</h2>
<p>Choose the Cloudflare account coil should run on. You stay in control of it the whole time.</p>
${error === undefined ? '' : alert(error)}
<a class="cta" id="sign-in" href="${back === '/' ? '/oauth/login' : `/oauth/login?return=${encodeURIComponent(back)}`}">${CLOUD}Sign in with Cloudflare</a>
<ol class="steps">${STEPS.map((step) => `<li><span>${step}</span></li>`).join('')}</ol>
</section></div>
</main>
<footer>
<span>A showcase of the Cloudflare Developer Platform. Open source.</span>
<span class="stack">Workers · Durable Objects · Containers · Workers AI · AI Gateway</span>
</footer>
</div>
</body>
</html>`;
