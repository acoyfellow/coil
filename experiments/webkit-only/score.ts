import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Arm = 'chrome' | 'webkit';
type Run = {
  arm: Arm;
  coldStartMs: number;
  results: Array<{ task: string; ok: boolean; detail: string }>;
  timings: Record<string, number[]>;
  disproof: string[];
};

const GATE_TASKS = [
  'open-local',
  'click-three-times',
  'type-into-ref',
  'enter-submits',
  'follow-link',
  'back',
  'logs-after-click',
  'logs-during-load',
  'screenshot',
  'login-survives-restart',
];
const root = join(import.meta.dirname, 'runs');
const labels = readdirSync(root).filter((label) => label.startsWith('run-')).sort();
const load = (label: string, arm: Arm): Run =>
  JSON.parse(readFileSync(join(root, label, `${arm}.json`), 'utf8').trim().split('\n').at(-1) as string);
const runs = { chrome: labels.map((l) => load(l, 'chrome')), webkit: labels.map((l) => load(l, 'webkit')) };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};
const passedEveryRun = (arm: Arm, task: string) =>
  runs[arm].length >= 3 && runs[arm].every((run) => run.results.find((r) => r.task === task)?.ok === true);
const imageMb = (image: string) =>
  Number(execFileSync('docker', ['image', 'inspect', image, '--format', '{{.Size}}'], { encoding: 'utf8' })) / 1e6;

const baseMb = imageMb('coil-browser-base');
const browserMb = { chrome: imageMb('coil-browser-chrome') - baseMb, webkit: imageMb('coil-browser-webkit') - baseMb };
const coldStart = { chrome: median(runs.chrome.map((r) => r.coldStartMs)), webkit: median(runs.webkit.map((r) => r.coldStartMs)) };
const perTask = Object.fromEntries(
  GATE_TASKS.map((task) => [task, { chrome: passedEveryRun('chrome', task), webkit: passedEveryRun('webkit', task) }]),
);
const methodMedians = (arm: Arm) => {
  const all: Record<string, number[]> = {};
  for (const run of runs[arm]) for (const [method, values] of Object.entries(run.timings)) (all[method] ??= []).push(...values);
  return Object.fromEntries(Object.entries(all).map(([method, values]) => [method, Math.round(median(values))]));
};
const disproofHolds = (arm: Arm) =>
  runs[arm].every((run) => run.disproof[0] === 'killed:yes' && run.disproof.slice(1).every((entry) => entry.endsWith(':rejected')));

const gate = {
  'webkit passes every task chrome passes, 3/3 runs': GATE_TASKS.every((task) => !perTask[task]?.chrome || perTask[task]?.webkit),
  'webkit cold start <= 2x chrome': coldStart.webkit <= 2 * coldStart.chrome,
  'webkit install <= chrome + 100 MB': browserMb.webkit <= browserMb.chrome + 100,
  'killed webkit: every later call rejects': disproofHolds('webkit'),
};
const pass = Object.values(gate).every(Boolean);

console.log(
  JSON.stringify(
    {
      runs: labels,
      tasksPassedEveryRun: {
        chrome: GATE_TASKS.filter((task) => perTask[task]?.chrome).length,
        webkit: GATE_TASKS.filter((task) => perTask[task]?.webkit).length,
        of: GATE_TASKS.length,
      },
      perTask,
      chromeDiagnostic: runs.chrome.map((run) => run.results.find((r) => r.task === 'enter-with-text-submits')?.ok),
      coldStartMs: coldStart,
      browserInstallMb: { chrome: Math.round(browserMb.chrome), webkit: Math.round(browserMb.webkit) },
      methodMedianMs: { chrome: methodMedians('chrome'), webkit: methodMedians('webkit') },
      disproof: { chrome: disproofHolds('chrome'), webkit: disproofHolds('webkit') },
      gate,
      pass,
    },
    null,
    1,
  ),
);
process.exit(pass ? 0 : 1);
