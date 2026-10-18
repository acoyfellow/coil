import { seoHead } from './seo';
import { FONTS, THEME } from './ui/style';

const STYLE = `${THEME}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 Inter,system-ui,sans-serif;padding:24px}
main{max-width:440px;text-align:center}
img{height:24px;margin-bottom:28px}
.code{font:700 72px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:-.04em;color:var(--orange);margin:0}
h1{font-size:20px;margin:12px 0 8px}
p{color:var(--dim);margin:0 0 24px}
code{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;background:var(--raise);padding:1px 6px;border-radius:5px;word-break:break-all}
nav{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
nav a{padding:8px 14px;border-radius:9px;border:1px solid var(--line2);color:var(--text);text-decoration:none;font-size:14px}
nav a.primary{background:var(--orange);border-color:var(--orange);color:#fff}`;

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

const escapeHtml = (value: string) => value.replace(/[&<>"]/gu, (char) => ENTITIES[char] ?? char);

const MAX_SHOWN_PATH = 120;

export const notFoundPage = (origin: string, path: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${seoHead({ origin, path, title: 'Page not found · coil', description: 'This page does not exist on this coil instance.', index: false })}
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body>
<main>
<a href="/"><img src="/brand/coil-wordmark.svg" alt="coil"></a>
<p class="code">404</p>
<h1>Nothing lives here</h1>
<p>There is no page at <code>${escapeHtml(path.slice(0, MAX_SHOWN_PATH))}</code>. A thread link may have been deleted or mistyped.</p>
<nav><a class="primary" href="/">Open coil</a><a href="/docs">Docs</a><a href="/stats">Stats</a></nav>
</main>
</body>
</html>`;
