import { FONTS, THEME } from '../ui/style';
import type { AccountGateway } from './oauth';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const STYLE = `${THEME}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased;display:grid;place-items:center;min-height:100vh;padding:24px}
main{width:100%;max-width:460px}
h1{font-size:22px;margin:0 0 6px}
p{color:var(--dim);margin:0 0 20px}
.row{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line2);border-radius:10px;margin:0 0 8px;cursor:pointer}
.row:has(input:checked){border-color:var(--orange);background:var(--orange-soft)}
.row.off{opacity:.55;cursor:not-allowed}
.row small{margin-left:auto;color:var(--dim);font:12px var(--mono)}
code{font:13.5px var(--mono)}
.actions{display:flex;gap:10px;margin-top:18px}
button,a.cancel{font:inherit;padding:9px 16px;border-radius:9px;border:1px solid var(--line2);background:transparent;color:var(--text);text-decoration:none;cursor:pointer}
button{background:var(--orange);border-color:var(--orange);color:#fff}
.alert{color:var(--red,#d33);margin:0 0 14px}
`;

export type GatewayPage = {
  readonly accountName: string;
  readonly back?: string;
  readonly current: string | null;
  readonly gateways: readonly AccountGateway[];
  readonly problem?: string | null;
  readonly error?: string;
};

const row = (gateway: AccountGateway, current: string | null) =>
  gateway.authenticated
    ? `<label class="row"><input type="radio" name="gateway" value="${escapeHtml(gateway.id)}"${gateway.id === current ? ' checked' : ''} required><code>${escapeHtml(gateway.id)}</code>${gateway.id === current ? '<small>in use</small>' : ''}</label>`
    : `<div class="row off" title="Turn on authentication for this gateway to use it"><input type="radio" disabled><code>${escapeHtml(gateway.id)}</code><small>auth off</small></div>`;

export const gatewayPage = ({
  accountName,
  current,
  gateways,
  problem = null,
  error,
  back = '/',
}: GatewayPage) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Pick an AI Gateway · coil</title>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Pick an AI Gateway</h1>
<p>coil sends every model call from your threads through this gateway on <strong>${escapeHtml(accountName)}</strong>. Its credits and logs are used.</p>
${error === undefined ? '' : `<div class="alert" role="alert">${escapeHtml(error)}</div>`}
<form method="post" action="/oauth/gateway?return=${encodeURIComponent(back)}">
${gateways.length > 0 ? gateways.map((gateway) => row(gateway, current)).join('\n') : problem !== null ? `<div class="alert" role="alert">coil could not list AI Gateways on ${escapeHtml(accountName)}. ${escapeHtml(problem)}</div>` : `<p>${escapeHtml(accountName)} has no AI Gateways. Create one in the dashboard with authentication on, then come back.</p>`}
<div class="actions"><button type="submit">Use this gateway</button><a class="cancel" href="${back}">Cancel</a></div>
</form>
</main>
</body>
</html>`;
