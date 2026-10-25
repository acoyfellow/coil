import { FONTS, THEME } from '../ui/style';
import type { Connector } from './config';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const STYLE = `${THEME}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased;display:grid;place-items:center;min-height:100vh;padding:24px}
main{width:100%;max-width:520px}
h1{font-size:22px;margin:0 0 6px}
p{color:var(--dim);margin:0 0 20px}
.row{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line2);border-radius:10px;margin:0 0 8px}
.row div{flex:1;min-width:0}
.row small{display:block;color:var(--dim);font-size:12.5px}
.state{font:12px var(--mono);color:var(--dim)}
.state.on{color:var(--ok)}
form{margin:0}
button,a.back{font:inherit;padding:7px 14px;border-radius:9px;border:1px solid var(--line2);background:transparent;color:var(--text);text-decoration:none;cursor:pointer}
button.connect{background:var(--orange);border-color:var(--orange);color:#fff}
.alert{color:var(--bad);margin:0 0 14px}
.actions{margin-top:18px}
`;

export type ConnectorRow = { readonly connector: Connector; readonly connected: boolean };

const row = ({ connector, connected }: ConnectorRow) => {
  const id = escapeHtml(connector.id);
  const action = connected
    ? `<form method="post" action="/connectors/${id}/disconnect"><button type="submit">Disconnect</button></form>`
    : `<form method="post" action="/connectors/${id}/start"><button class="connect" type="submit">Connect</button></form>`;

  return `<div class="row" data-connector="${id}"><div><code>${id}</code><small>${escapeHtml(connector.description)}</small></div><span class="state${connected ? ' on' : ''}">${connected ? 'connected' : 'not connected'}</span>${action}</div>`;
};

export const connectorsPage = (rows: readonly ConnectorRow[], problem: string | null): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Connectors · coil</title>${FONTS}<style>${STYLE}</style></head><body><main><h1>Connectors</h1><p>Connect a tool server once. The agent then uses it with your own sign-in. coil stores the token sealed and never shows it to the agent.</p>${problem === null ? '' : `<p class="alert" role="alert">${escapeHtml(problem)}</p>`}${rows.length === 0 ? '<p>This instance has no connectors.</p>' : rows.map(row).join('')}<div class="actions"><a class="back" href="/">Back to coil</a></div></main></body></html>`;
