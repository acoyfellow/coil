export type ComputerUsage = {
  readonly awakeMs: number;
  readonly toolMs: number;
  readonly boots: number;
  readonly awakeSince: number | null;
};

import type { Computer } from './computer';

export const NO_COMPUTER_USAGE: ComputerUsage = {
  awakeMs: 0,
  toolMs: 0,
  boots: 0,
  awakeSince: null,
};

export const booted = (usage: ComputerUsage, at: number): ComputerUsage =>
  usage.awakeSince !== null ? usage : { ...usage, boots: usage.boots + 1, awakeSince: at };

export const stopped = (usage: ComputerUsage, at: number): ComputerUsage =>
  usage.awakeSince === null
    ? usage
    : { ...usage, awakeMs: usage.awakeMs + Math.max(0, at - usage.awakeSince), awakeSince: null };

export const toolRan = (usage: ComputerUsage, ms: number): ComputerUsage => ({
  ...usage,
  toolMs: usage.toolMs + Math.max(0, ms),
});

export const awakeSoFar = (usage: ComputerUsage, at: number): number =>
  usage.awakeMs + (usage.awakeSince === null ? 0 : Math.max(0, at - usage.awakeSince));

export const idleShare = (usage: ComputerUsage, at: number): number => {
  const awake = awakeSoFar(usage, at);

  return awake === 0 ? 0 : Math.max(0, Math.min(1, 1 - usage.toolMs / awake));
};

export const parseComputerUsage = (raw: string | null): ComputerUsage => {
  if (raw === null) return NO_COMPUTER_USAGE;

  try {
    const value = JSON.parse(raw) as Partial<ComputerUsage>;

    return {
      awakeMs: Number(value.awakeMs ?? 0),
      toolMs: Number(value.toolMs ?? 0),
      boots: Number(value.boots ?? 0),
      awakeSince: typeof value.awakeSince === 'number' ? value.awakeSince : null,
    };
  } catch {
    return NO_COMPUTER_USAGE;
  }
};

export type ComputerTotals = {
  readonly threads: number;
  readonly neverBooted: number;
  readonly boots: number;
  readonly awakeSeconds: number;
  readonly toolSeconds: number;
};

export const totalComputerUsage = (rows: readonly ComputerUsage[], at: number): ComputerTotals => ({
  threads: rows.length,
  neverBooted: rows.filter((row) => row.boots === 0).length,
  boots: rows.reduce((sum, row) => sum + row.boots, 0),
  awakeSeconds: Math.round(rows.reduce((sum, row) => sum + awakeSoFar(row, at), 0) / 1000),
  toolSeconds: Math.round(rows.reduce((sum, row) => sum + row.toolMs, 0) / 1000),
});

export type Meter = {
  readonly read: () => ComputerUsage;
  readonly write: (next: ComputerUsage) => void;
  readonly now?: () => number;
};

export const metered = (box: Computer, meter: Meter): Computer => {
  const now = meter.now ?? Date.now;
  const timed = async <T>(work: () => Promise<T>): Promise<T> => {
    const start = now();

    try {
      return await work();
    } finally {
      meter.write(toolRan(meter.read(), now() - start));
    }
  };

  return {
    ...box,
    boot: async (from, size) => {
      await box.boot(from, size);
      meter.write(booted(meter.read(), now()));
    },
    destroy: async () => {
      await box.destroy();
      meter.write(stopped(meter.read(), now()));
    },
    exec: (argv, cwd) => timed(() => box.exec(argv, cwd)),
  };
};
