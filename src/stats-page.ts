import type { InstanceStats } from './stats';
import { FONTS, THEME } from './ui/style';

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

const escapeHtml = (value: string) => value.replace(/[&<>"]/gu, (char) => ENTITIES[char] ?? char);

const whole = new Intl.NumberFormat('en-US');

const dollars = (value: number) =>
  value >= 100 ? `$${whole.format(Math.round(value))}` : `$${value.toFixed(2)}`;

const sinceLabel = (firstAt: number | null, now: number) => {
  if (firstAt === null) return 'no threads yet';

  const days = Math.max(1, Math.round((now - firstAt) / 86_400_000));

  return `${whole.format(days)} day${days === 1 ? '' : 's'} running`;
};

const agoLabel = (at: number | null, now: number) => {
  if (at === null) return 'never';

  const minutes = Math.round((now - at) / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;

  return `${Math.round(minutes / 1440)}d ago`;
};

const tile = (value: string, label: string, live = false) =>
  `<div class="tile${live ? ' live' : ''}"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;

const CHART_HEIGHT = 120;

const chart = (perDay: InstanceStats['perDay']) => {
  const peak = Math.max(1, ...perDay.map((day) => day.threads));
  const width = 100 / perDay.length;

  const bars = perDay
    .map((day, index) => {
      const height = Math.max(day.threads === 0 ? 0 : 3, (day.threads / peak) * CHART_HEIGHT);

      return `<rect x="${(index * width + width * 0.12).toFixed(2)}%" y="${CHART_HEIGHT - height}" width="${(width * 0.76).toFixed(2)}%" height="${height}"><title>${day.day}: ${day.threads} thread${day.threads === 1 ? '' : 's'}</title></rect>`;
    })
    .join('');

  return `<svg class="chart" viewBox="0 0 100 ${CHART_HEIGHT}" preserveAspectRatio="none" role="img" aria-label="Threads started per day, last ${perDay.length} days">${bars}</svg>
<div class="axis"><span>${perDay[0]?.day ?? ''}</span><span>peak ${peak}/day</span><span>today</span></div>`;
};

const bars = (rows: readonly { readonly label: string; readonly threads: number }[]) => {
  const peak = Math.max(1, ...rows.map((row) => row.threads));

  return rows.length === 0
    ? '<p class="faint">Nothing yet.</p>'
    : `<ul class="bars">${rows
        .map(
          (row) =>
            `<li><span class="name">${escapeHtml(row.label)}</span><span class="track"><i style="width:${((row.threads / peak) * 100).toFixed(1)}%"></i></span><span class="n">${whole.format(row.threads)}</span></li>`,
        )
        .join('')}</ul>`;
};

const STYLE = `${THEME}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 Inter,system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 20px 64px}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}
header img{height:22px}
header a{color:var(--dim);text-decoration:none;font-size:14px}
h1{font-size:28px;letter-spacing:-.02em;margin:0 0 4px}
.sub{color:var(--dim);margin:0 0 28px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px}
@media (min-width:860px){.tiles{grid-template-columns:repeat(6,1fr)}}
@media (max-width:520px){.tiles{grid-template-columns:repeat(2,1fr)}}
.tile{border:1px solid var(--line2);border-radius:14px;padding:16px 18px;background:var(--side)}
.tile b{display:block;font-size:30px;line-height:1.1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.tile span{color:var(--dim);font-size:13px}
.tile.live b{color:var(--orange)}
.tile.live b::after{content:'';display:inline-block;width:9px;height:9px;margin-left:8px;border-radius:50%;background:var(--orange);vertical-align:middle;animation:pulse 1.4s infinite}
@keyframes pulse{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.tile.live b::after{animation:none}}
section{border:1px solid var(--line2);border-radius:14px;padding:18px 20px;margin-bottom:16px;background:var(--side)}
section h2{font-size:14px;margin:0 0 14px;color:var(--dim);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.chart{width:100%;height:140px;display:block}
.chart rect{fill:var(--orange)}
.chart rect:hover{opacity:.7}
.axis{display:flex;justify-content:space-between;color:var(--faint);font-size:12px;margin-top:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.grid section{margin:0}
.bars{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.bars li{display:grid;grid-template-columns:minmax(0,9rem) 1fr 3rem;gap:10px;align-items:center;font-size:13px}
.bars .name{font-family:'JetBrains Mono',ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bars .track{height:8px;border-radius:99px;background:var(--line)}
.bars i{display:block;height:100%;border-radius:99px;background:var(--orange)}
.bars .n{text-align:right;color:var(--dim);font-variant-numeric:tabular-nums}
.faint{color:var(--faint)}
footer{color:var(--faint);font-size:13px;margin-top:24px;display:flex;gap:16px;flex-wrap:wrap}
footer a{color:var(--dim)}`;

export const statsPage = (stats: InstanceStats, origin: string) => {
  const host = new URL(origin).host;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(host)} stats · coil</title>
<meta name="description" content="Live totals for this coil instance: threads, people, models, and spend.">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<meta http-equiv="refresh" content="60">
<style>${STYLE}</style>
</head>
<body>
<main>
<header><a href="/"><img src="/brand/coil-wordmark.svg" alt="coil"></a><a href="/docs">Docs</a></header>
<h1>${escapeHtml(host)}</h1>
<p class="sub">This coil instance at a glance · ${escapeHtml(sinceLabel(stats.firstAt, stats.at))} · last activity ${escapeHtml(agoLabel(stats.lastAt, stats.at))}</p>
<div class="tiles" id="tiles">
${tile(whole.format(stats.threads), 'threads')}
${tile(whole.format(stats.people), stats.people === 1 ? 'person' : 'people')}
${tile(whole.format(stats.working), 'working right now', stats.working > 0)}
${tile(whole.format(stats.awake), 'computers awake')}
${tile(whole.format(stats.agentMade), 'started by an agent')}
${tile(dollars(stats.spend), 'model spend')}
</div>
<section><h2>Threads started, last ${stats.perDay.length} days</h2>${chart(stats.perDay)}</section>
<div class="grid">
<section><h2>Models</h2>${bars(stats.models.map((row) => ({ label: row.model, threads: row.threads })))}</section>
<section><h2>Started from</h2>${bars(stats.sources.map((row) => ({ label: row.source, threads: row.threads })))}</section>
</div>
<footer><span>Totals only: no names, titles, or content. Updates every minute.</span><a href="/stats.json">stats.json</a><a href="https://github.com/acoyfellow/coil">Run your own coil</a></footer>
</main>
</body>
</html>`;
};
