import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';
import type { Computer } from '../src/computer';
import {
  awakeSoFar,
  booted,
  type ComputerUsage,
  idleShare,
  metered,
  NO_COMPUTER_USAGE,
  parseComputerUsage,
  stopped,
  toolRan,
  totalComputerUsage,
} from '../src/usage';

describe('computer usage arithmetic', () => {
  test('a boot opens an awake window and a stop closes it', () => {
    const up = booted(NO_COMPUTER_USAGE, 1_000);
    const again = booted(up, 2_000);
    const down = stopped(again, 5_000);

    expect(up).toEqual({ awakeMs: 0, toolMs: 0, boots: 1, awakeSince: 1_000 });
    expect(again).toBe(up);
    expect(down).toEqual({ awakeMs: 4_000, toolMs: 0, boots: 1, awakeSince: null });
    expect(stopped(down, 9_000)).toBe(down);
  });

  test('idle share is the awake time no tool used', () => {
    const used = toolRan(stopped(booted(NO_COMPUTER_USAGE, 0), 10_000), 2_500);

    expect(idleShare(used, 10_000)).toBe(0.75);
    expect(idleShare(NO_COMPUTER_USAGE, 0)).toBe(0);
    expect(awakeSoFar(booted(NO_COMPUTER_USAGE, 0), 3_000)).toBe(3_000);
  });

  test('totals count threads that never needed a computer', () => {
    const rows: ComputerUsage[] = [
      NO_COMPUTER_USAGE,
      NO_COMPUTER_USAGE,
      { awakeMs: 60_000, toolMs: 6_000, boots: 2, awakeSince: null },
    ];

    expect(totalComputerUsage(rows, 0)).toEqual({
      threads: 3,
      neverBooted: 2,
      boots: 2,
      awakeSeconds: 60,
      toolSeconds: 6,
    });
  });

  test('bad stored usage reads as none', () => {
    expect(parseComputerUsage(null)).toEqual(NO_COMPUTER_USAGE);
    expect(parseComputerUsage('{')).toEqual(NO_COMPUTER_USAGE);
  });

  test('a metered computer records boots, stops and exec time', async () => {
    let usage = NO_COMPUTER_USAGE;
    let clock = 0;
    const box = {
      running: () => true,
      boot: async () => undefined,
      destroy: async () => undefined,
      exec: async () => {
        clock += 400;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    } as unknown as Computer;
    const meter = metered(box, {
      read: () => usage,
      write: (next) => {
        usage = next;
      },
      now: () => clock,
    });

    await meter.boot(undefined, 'lite');
    await meter.exec(['true']);
    clock = 1_000;
    await meter.destroy();

    expect(usage).toEqual({ awakeMs: 1_000, toolMs: 400, boots: 1, awakeSince: null });
  });
});

describe('computer usage on a real thread', () => {
  let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

  beforeAll(async () => {
    worker = await unstable_startWorker({
      config: resolve('test/worker/wrangler.jsonc'),
      dev: { server: { port: 0 }, inspector: false, logLevel: 'error', persist: false },
    });
  }, 60_000);

  afterAll(async () => {
    await worker.dispose();
  });

  test('an exec then a pause records one boot and closes the awake window', {
    timeout: 60_000,
  }, async () => {
    const response = await worker.fetch(
      `http://coil/cloud5-usage?run=${crypto.randomUUID().slice(0, 8)}`,
    );
    const out = (await response.json()) as ComputerUsage;

    expect(out.boots).toBe(1);
    expect(out.awakeSince).toBeNull();
    expect(out.awakeMs).toBeGreaterThanOrEqual(0);
    expect(out.toolMs).toBeGreaterThanOrEqual(0);
  });
});
