import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Run = {
  surface: string;
  results: Array<{ task: string; ok: boolean; detail: string }>;
  calls: Array<{ method: string; ms: number; ok: boolean }>;
};

const METHODS = ['open', 'snapshot', 'click', 'type', 'key', 'evaluate', 'look', 'logs'];
const root = join(import.meta.dir, 'runs');
const load = (label: string): Run => JSON.parse(readFileSync(join(root, label, 'results.json'), 'utf8'));
const labels = readdirSync(root).sort();
const real = labels.filter((label) => label.startsWith('real-')).map(load);
const disproof = labels.filter((label) => label.startsWith('disproof-')).map(load);

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};

const okCalls = real.flatMap((run) => run.calls.filter((call) => call.ok));
const allTasksEveryRun = real.length >= 3 && real.every((run) => run.results.every((result) => result.ok));
const medianMs = median(okCalls.map((call) => call.ms));
const usedMethods = new Set(okCalls.map((call) => call.method));
const disproofHolds = disproof.length >= 1 && disproof.every((run) => run.results.every((result) => !result.ok));

const gate = {
  'all 6 tasks pass in 3/3 runs': allTasksEveryRun,
  'median call under 500 ms': medianMs < 500,
  'every BrowserTools method used': METHODS.every((method) => usedMethods.has(method)),
  'non-browser surface: every task fails': disproofHolds,
};

console.log(
  JSON.stringify(
    {
      runs: real.map((run) => ({ passed: run.results.filter((r) => r.ok).length, of: run.results.length })),
      failures: real.flatMap((run) => run.results.filter((r) => !r.ok)),
      medianMs: Math.round(medianMs),
      p90Ms: Math.round([...okCalls.map((c) => c.ms)].sort((a, b) => a - b)[Math.floor(okCalls.length * 0.9)] ?? 0),
      calls: okCalls.length,
      unusedMethods: METHODS.filter((method) => !usedMethods.has(method)),
      disproof: disproof.map((run) => run.results.map((r) => `${r.task}:${r.ok ? 'FALSE-PASS' : 'failed'}`)),
      gate,
      pass: Object.values(gate).every(Boolean),
    },
    null,
    1,
  ),
);
process.exit(Object.values(gate).every(Boolean) ? 0 : 1);
