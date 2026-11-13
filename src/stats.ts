import type { ComputerTotals } from './usage';

export type InstanceStats = {
  readonly threads: number;
  readonly people: number;
  readonly working: number;
  readonly awake: number;
  readonly agentMade: number;
  readonly firstAt: number | null;
  readonly lastAt: number | null;
  readonly perDay: readonly { readonly day: string; readonly threads: number }[];
  readonly models: readonly { readonly model: string; readonly threads: number }[];
  readonly sources: readonly { readonly source: string; readonly threads: number }[];
  readonly at: number;
  readonly computers?: ComputerTotals;
};

export const STATS_DAYS = 30;
export const DAY_MS = 86_400_000;

export const sourceOf = (createdBy: string): string =>
  createdBy.startsWith('thread:') ? 'agent' : createdBy === '' ? 'api' : createdBy;

export const modelLabel = (model: string): string =>
  model === '' ? 'default' : (model.split('/').pop() ?? model);

export const lastDays = (now: number, days = STATS_DAYS): string[] =>
  Array.from({ length: days }, (_, index) =>
    new Date(now - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  );

const TOP = 8;

export const topCounts = (counts: ReadonlyMap<string, number>): [string, number][] =>
  [...counts].sort((a, b) => b[1] - a[1]).slice(0, TOP);
