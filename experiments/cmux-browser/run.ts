import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserTools } from '../../src/agent';
import { type CmuxRun, cmuxBrowserTools } from '../../src/browser-cmux';

type Call = { method: string; ms: number; ok: boolean };
type TaskResult = { task: string; ok: boolean; detail: string };

const surface = process.argv[2];
const label = process.argv[3] ?? 'run';
if (!surface) throw new Error('usage: bun run.ts <cmux browser surface> <label>');

const PAGE = `<!doctype html><title>coil fixture</title>
<h1 id=count>0</h1>
<button id=plus onclick="count.textContent = Number(count.textContent) + 1">plus</button>
<form onsubmit="event.preventDefault(); document.title = 'sent ' + document.getElementById('name').value"><input id=name aria-label="name"><button>send</button></form>
<a href="/second">second page</a>
<script>console.log('fixture ready')</script>`;

const server = Bun.serve({
  port: 0,
  fetch: (request) => {
    const path = new URL(request.url).pathname;
    const body = path === '/second' ? '<!doctype html><title>second</title><p>arrived</p>' : PAGE;
    return new Response(body, { headers: { 'content-type': 'text/html' } });
  },
});
const origin = ['http:', '', `127.0.0.1:${server.port}`].join('/');

const run: CmuxRun = async (argv) => {
  const child = Bun.spawn(['cmux', ...argv], { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0 || out.startsWith('Error:') || err.startsWith('Error:')) throw new Error((err || out).trim());
  return out;
};

const calls: Call[] = [];
const timed = (tools: BrowserTools): BrowserTools =>
  Object.fromEntries(
    Object.entries(tools).map(([method, fn]) => [
      method,
      async (...args: unknown[]) => {
        const started = performance.now();
        try {
          const value = await (fn as (...a: unknown[]) => Promise<string>)(...args);
          calls.push({ method, ms: performance.now() - started, ok: true });
          return value;
        } catch (error) {
          calls.push({ method, ms: performance.now() - started, ok: false });
          throw error;
        }
      },
    ]),
  ) as BrowserTools;

const tools = timed(cmuxBrowserTools(run, surface));
const refFor = (snapshot: string, name: string) => {
  const line = snapshot.split('\n').find((row) => row.includes(`"${name}"`) && row.includes('[ref='));
  const ref = line?.match(/\[ref=(e\d+)\]/)?.[1];
  if (!ref) throw new Error(`no ref for ${name}`);
  return ref;
};

const tasks: Array<[string, () => Promise<string | true>]> = [
  [
    'open-local',
    async () => {
      await tools.open(`127.0.0.1:${server.port}/`);
      return (await tools.evaluate('location.href')).startsWith(origin) || 'wrong url';
    },
  ],
  [
    'click-three-times',
    async () => {
      await tools.open(`${origin}/`);
      for (let i = 0; i < 3; i++) await tools.click(refFor(await tools.snapshot(), 'plus'));
      const count = await tools.evaluate('document.getElementById("count").textContent');
      return count === '3' || `count ${count}`;
    },
  ],
  [
    'type-into-ref',
    async () => {
      await tools.open(`${origin}/`);
      await tools.type('jordan', refFor(await tools.snapshot(), 'name'));
      const value = await tools.evaluate('document.getElementById("name").value');
      return value === 'jordan' || `value ${value}`;
    },
  ],
  [
    'type-then-enter-submits',
    async () => {
      await tools.open(`${origin}/`);
      await tools.type('ada', refFor(await tools.snapshot(), 'name'));
      await tools.key('Enter');
      const title = await tools.evaluate('document.title');
      return title === 'sent ada' || `title ${title}`;
    },
  ],
  [
    'follow-link',
    async () => {
      await tools.open(`${origin}/`);
      await tools.click(refFor(await tools.snapshot(), 'second page'));
      const path = await tools.evaluate('location.pathname');
      return path === '/second' || `path ${path}`;
    },
  ],
  [
    'logs-and-look',
    async () => {
      await tools.open(`${origin}/`);
      const logs = await tools.logs(true);
      const look = await tools.look('what is on the page');
      const shot = look.split('\n').at(-1) ?? '';
      const exists = shot.includes('.png') && (await Bun.file(shot.replace('screenshot saved at ', '')).exists());
      return (logs.includes('fixture ready') && exists) || `logs=${logs.slice(0, 80)} shot=${shot}`;
    },
  ],
];

const results: TaskResult[] = [];
for (const [task, body] of tasks) {
  try {
    const verdict = await body();
    results.push({ task, ok: verdict === true, detail: verdict === true ? 'ok' : verdict });
  } catch (error) {
    results.push({ task, ok: false, detail: String((error as Error).message ?? error).slice(0, 200) });
  }
}
server.stop(true);

const out = join(import.meta.dir, 'runs', label);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'results.json'), JSON.stringify({ surface, origin, results, calls }, null, 1));
console.log(JSON.stringify(results));
