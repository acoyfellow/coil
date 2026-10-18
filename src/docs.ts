import { CAPABILITIES, type Capability, type Field } from './capabilities';
import { GUIDE } from './docs-guide';
import { highlight } from './highlight';
import { MAX_CALLS } from './run-module';
import { seoHead } from './seo';
import { FONTS, THEME } from './ui/style';

const GROUPS: readonly { readonly key: Capability['group']; readonly title: string }[] = [
  { key: 'threads', title: 'Threads' },
  { key: 'shell', title: 'Shell' },
  { key: 'files', title: 'Files' },
  { key: 'browser', title: 'Browser' },
  { key: 'computer', title: 'Computer' },
  { key: 'extensions', title: 'Pi extensions' },
  { key: 'bases', title: 'Warm bases' },
];

const tsType = (field: Field) => {
  if (field.enum !== undefined) return field.enum.map((value) => JSON.stringify(value)).join(' | ');

  return field.type === 'array' ? 'string[]' : field.type;
};

const inputType = (capability: Capability) => {
  const entries = Object.entries(capability.input);

  if (entries.length === 0) return '{}';

  const fields = entries.map(
    ([key, field]) => `${key}${capability.required.includes(key) ? '' : '?'}: ${tsType(field)}`,
  );

  return `{ ${fields.join('; ')} }`;
};

export const describe = (): string =>
  [
    'declare const coil: {',
    ...CAPABILITIES.flatMap((capability) => [
      `  /** ${capability.summary} Returns ${capability.returns}. */`,
      `  ${capability.name}(input: ${inputType(capability)}): Promise<unknown>;`,
    ]),
    '};',
  ].join('\n');

const EXAMPLE = `const t = await coil.thread_create({ title: "demo" });
await coil.thread_exec({ name: t.name, command: "echo '<button>+</button>' > index.html && (busybox httpd -p 3000 &)" });
await coil.browser_open({ name: t.name, url: "localhost:3000" });
const page = await coil.browser_snapshot({ name: t.name });
await coil.browser_click({ name: t.name, ref: "e1" });
await coil.thread_pause({ name: t.name });
return { thread: t.name, page };`;

const fieldLine = (capability: Capability, key: string, field: Field) => {
  const required = capability.required.includes(key) ? ' (required)' : '';
  const choices = field.enum === undefined ? '' : ` One of ${field.enum.join(', ')}.`;

  return `- \`${key}\`${required}: ${field.description}${choices}`;
};

const capabilityLines = (capability: Capability) => [
  `### ${capability.name}`,
  '',
  capability.summary,
  '',
  ...Object.entries(capability.input).map(([key, field]) => fieldLine(capability, key, field)),
  ...(Object.keys(capability.input).length === 0 ? ['- No input.'] : []),
  `- Returns: ${capability.returns}`,
  '',
];

const groupLines = (group: (typeof GROUPS)[number]) => {
  const members = CAPABILITIES.filter((capability) => capability.group === group.key);

  return members.length === 0 ? [] : [`## ${group.title}`, '', ...members.flatMap(capabilityLines)];
};

export const llmsText = (origin: string): string =>
  [
    '# coil',
    '',
    '> Agent threads with their own Linux computer. Each thread has an agent, a shell, a browser, and a disk you can pause and fork.',
    '',
    '## How an agent uses coil',
    '',
    `Connect an MCP client to \`${origin}/mcp\`. Every request must be signed in. On an instance behind Cloudflare Access, send an Access token in the \`cf-access-token\` header. On an instance with Sign in with Cloudflare, send the session cookie from \`${origin}/oauth/login\`; without it the answer is 401.`,
    '',
    '1. Call `coil_describe` to get the TypeScript declaration of the `coil` object.',
    `2. Call \`coil_run\` with the body of an async function. Each \`await coil.<capability>(input)\` is one call, at most ${MAX_CALLS} per run. The script has no network access of its own.`,
    '3. Or call any capability below directly as its own MCP tool, or with REST.',
    '',
    'Example `coil_run` script:',
    '',
    '```js',
    EXAMPLE,
    '```',
    '',
    'The same list drives the MCP tools, `coil_run`, the REST endpoint, and these docs.',
    '',
    ...GROUPS.flatMap(groupLines),
    '## REST',
    '',
    `\`POST ${origin}/api/capabilities/<name>\` with the input as a JSON body runs one capability and returns its result as JSON.`,
    '',
  ].join('\n');

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

const escapeHtml = (value: string) => value.replace(/[&<>"]/gu, (char) => ENTITIES[char] ?? char);

const inline = (value: string) => escapeHtml(value).replace(/`([^`]+)`/gu, '<code>$1</code>');

const slugOf = (value: string) => value.toLowerCase().replace(/[^a-z0-9_]+/gu, '-');

const markdownToHtml = (markdown: string): string => {
  const out: string[] = [];
  let code: string[] | null = null;
  let list = false;

  const closeList = () => {
    if (list) out.push('</ul>');
    list = false;
  };

  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) {
      closeList();
      if (code === null) code = [];
      else {
        out.push(`<pre data-lang="js"><code>${highlight('js', code.join('\n'))}</code></pre>`);
        code = null;
      }
    } else if (code !== null) code.push(line);
    else if (line.startsWith('### ') || line.startsWith('## ')) {
      closeList();
      const level = line.startsWith('### ') ? 3 : 2;
      const title = line.slice(level + 1);

      out.push(`<h${level} id="${slugOf(title)}">${inline(title)}</h${level}>`);
    } else if (line.startsWith('- ')) {
      if (!list) out.push('<ul>');
      list = true;
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.startsWith('> ')) {
      closeList();
      out.push(`<p class="lede">${inline(line.slice(2))}</p>`);
    } else {
      closeList();
      if (line.trim() !== '' && !line.startsWith('# ')) out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();

  return out.join('\n');
};

const GITHUB = '<img src="/brand/github.svg" alt="" width="20" height="20">';

const referenceNav = () =>
  GROUPS.filter((group) => CAPABILITIES.some((capability) => capability.group === group.key))
    .map((group) => `<a href="#${slugOf(group.title)}">${escapeHtml(group.title)}</a>`)
    .join('');

const guideNav = () =>
  GUIDE.map(
    (group) =>
      `<p class="nav-title">${group.title}</p>${group.sections.map((section) => `<a href="#${section.id}">${section.title}</a>`).join('')}`,
  ).join('');

const guideBody = () =>
  GUIDE.flatMap((group) => group.sections)
    .map(
      (section) =>
        `<section class="guide" id="${section.id}"><h2>${section.title}</h2>${section.html}</section>`,
    )
    .join('');

const referenceBody = (origin: string) =>
  markdownToHtml(
    [
      '## API reference',
      '',
      `> Every capability is an MCP tool, a \`coil_run\` call, and \`POST ${origin}/api/capabilities/<name>\`.`,
      '',
      ...GROUPS.flatMap(groupLines),
    ].join('\n'),
  );

const STYLE = `${THEME}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:84px}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 var(--sans);font-optical-sizing:auto;-webkit-font-smoothing:antialiased}
a{color:var(--text);text-decoration-color:color-mix(in srgb,var(--orange) 60%,transparent);text-underline-offset:3px}
a:hover{color:var(--orange)}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;height:64px;padding:0 28px;background:color-mix(in srgb,var(--bg) 85%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.top .brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--dim);font-size:13px}
.top .brand img{height:22px;display:block}
.top .brand span{padding-left:12px;border-left:1px solid var(--line2)}
.top nav{display:flex;align-items:center;gap:4px}
.top nav a{display:flex;align-items:center;gap:6px;color:var(--dim);font-size:13.5px;text-decoration:none;padding:7px 10px;border-radius:9px}
.top nav a:hover{color:var(--text);background:var(--hover)}
.top nav a.primary{background:var(--text);color:var(--bg);padding:7px 14px}
.top nav a.primary:hover{opacity:.9}
.top nav img{display:block}
@media (prefers-color-scheme:dark){.top nav img[src$="github.svg"]{filter:invert(1)}}
.layout{display:grid;grid-template-columns:240px minmax(0,1fr);max-width:1200px;margin:0 auto}
aside{position:sticky;top:64px;align-self:start;height:calc(100vh - 64px);overflow:auto;padding:28px 20px 40px 28px;border-right:1px solid var(--line)}
aside a{display:block;font-size:13.5px;color:var(--dim);text-decoration:none;padding:5px 10px;border-radius:8px}
aside a:hover{color:var(--text);background:var(--hover)}
.nav-title{font:500 11px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--faint);margin:22px 10px 8px}
.nav-title:first-child{margin-top:0}
article{padding:44px 56px 120px;max-width:820px}
.hero{padding-bottom:12px}
.hero .eyebrow{display:inline-flex;align-items:center;gap:8px;font:500 12px/1 var(--mono);color:var(--orange);background:var(--orange-soft);padding:7px 11px;border-radius:99px;margin:0 0 18px}
.hero h1{font-size:44px;line-height:1.05;letter-spacing:-.035em;font-weight:600;margin:0 0 12px}
.hero p{font-size:17px;color:var(--dim);margin:0}
section.guide,article>h2{scroll-margin-top:84px}
h2{font-size:26px;letter-spacing:-.02em;font-weight:600;margin:64px 0 14px;padding-top:28px;border-top:1px solid var(--line)}
h3{font-size:16px;font-weight:600;letter-spacing:-.01em;margin:32px 0 8px}
article h3[id]{font:500 14.5px var(--mono);margin:30px 0 6px;padding:10px 12px;background:var(--raise);border-radius:10px}
p{margin:10px 0}
.lede{font-size:17px;color:var(--dim)}
ul,ol{padding-left:22px;margin:10px 0}
li{margin:6px 0}
article li{color:var(--text)}
.tok-keyword{color:#c2410c;font-weight:500}.tok-string{color:#15803d}.tok-function{color:#1d4ed8}.tok-object{color:#b45309;font-weight:500}.tok-property{color:#7c3aed}.tok-number{color:#0e7490}.tok-flag{color:#7c3aed}.tok-variable{color:#b45309}.tok-punct{color:var(--faint)}
@media (prefers-color-scheme:dark){.tok-keyword{color:#fb923c}.tok-string{color:#86efac}.tok-function{color:#93c5fd}.tok-object{color:#fcd34d}.tok-property{color:#c4b5fd}.tok-number{color:#67e8f9}.tok-flag{color:#c4b5fd}.tok-variable{color:#fcd34d}}
code{font:.88em var(--mono);background:var(--raise);border:1px solid var(--line);padding:1px 5px;border-radius:6px}
pre{position:relative;background:var(--term-bg);border:1px solid var(--line2);padding:16px 18px;border-radius:14px;overflow:auto;font-size:13px;line-height:1.6;margin:16px 0}
pre[data-lang]::before{content:attr(data-lang);position:absolute;top:8px;right:12px;font:500 10.5px var(--mono);color:var(--faint);text-transform:uppercase;letter-spacing:.06em}
pre code{background:none;border:0;padding:0;font-size:inherit;white-space:pre-wrap;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:12px 14px;border-top:1px solid var(--line)}
tr:last-child th,tr:last-child td{border-bottom:1px solid var(--line)}
th{width:34%;font-weight:500}
td{color:var(--dim)}
.callout{margin:18px 0;padding:14px 16px;border-radius:12px;font-size:14px;border:1px solid var(--line2);background:var(--raise)}
.callout.tip{border-color:color-mix(in srgb,var(--orange) 35%,transparent);background:var(--orange-soft)}
.callout.warn{border-color:color-mix(in srgb,var(--bad) 35%,transparent)}
ol.steps{list-style:none;padding:0;counter-reset:s}
ol.steps li{counter-increment:s;display:grid;grid-template-columns:30px 1fr;gap:12px;margin:12px 0}
ol.steps li::before{content:counter(s);width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font:500 12px var(--mono);background:var(--text);color:var(--bg)}
footer{margin-top:80px;padding-top:24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;color:var(--faint);font-size:12.5px}
footer .stack{font-family:var(--mono);font-size:11.5px}
@media (max-width:900px){.layout{grid-template-columns:1fr}aside{display:none}article{padding:28px 20px 80px}.top{padding:0 16px}.hero h1{font-size:34px}.top .brand span{display:none}}`;

export const docsPage = (origin: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${seoHead({ origin, path: '/docs', title: 'coil docs', description: 'coil docs: agent threads with their own computer, built on Cloudflare Workers, Durable Objects, Containers, Workers AI, and AI Gateway.' })}
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body>
<header class="top">
<a class="brand" href="/"><img src="/brand/coil-wordmark.svg" alt="coil"><span>Docs</span></a>
<nav><a href="/llms.txt">llms.txt</a><a href="https://github.com/acoyfellow/coil" aria-label="GitHub">${GITHUB}</a><a class="primary" href="/">Open coil</a></nav>
</header>
<div class="layout">
<aside>${guideNav()}<p class="nav-title">API reference</p>${referenceNav()}</aside>
<article>
<div class="hero"><p class="eyebrow">Built on Cloudflare</p><h1>coil docs</h1><p>Agent threads with their own computer, running on your own Cloudflare account.</p></div>
${guideBody()}
${referenceBody(origin)}
<footer><span>Open source, MIT.</span><span class="stack">Workers · Durable Objects · Containers · Workers AI · AI Gateway</span></footer>
</article>
</div>
</body>
</html>`;
