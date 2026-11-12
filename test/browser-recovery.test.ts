import { describe, expect, it, vi } from 'vitest';
import { Browser } from '../src/browser';

const deadPipes = () => {
  const encoder = new TextEncoder();
  let cancelled = false;

  return {
    pipes: {
      stdin: {
        getWriter: () => ({
          write: async () => {
            throw new Error('pipe closed');
          },
          close: async () => undefined,
          releaseLock: () => undefined,
        }),
      } as unknown as WritableStreamDefaultWriter<Uint8Array>,
      stdout: new ReadableStream<Uint8Array>({
        start: (controller) => controller.enqueue(encoder.encode('')),
        cancel: () => {
          cancelled = true;
        },
      }),
      exitCode: new Promise<number>(() => undefined),
    },
    wasCancelled: () => cancelled,
  };
};

describe('browser recovery', () => {
  it('marks itself dead when the host pipe is gone, so the next call relaunches', async () => {
    const { pipes } = deadPipes();
    const browser = new Browser(pipes as never);

    expect(browser.alive).toBe(true);

    await expect(browser.evaluate('1')).rejects.toThrowError('browser pipe closed');

    expect(browser.alive).toBe(false);
  });

  it('gives up on a host that never answers and marks itself dead', async () => {
    vi.useFakeTimers();

    try {
      const pipes = {
        stdin: {
          getWriter: () => ({
            write: async () => undefined,
            close: async () => undefined,
            releaseLock: () => undefined,
          }),
        },
        stdout: new ReadableStream<Uint8Array>({ start: () => undefined }),
        exitCode: new Promise<never>(() => undefined),
      };
      const browser = new Browser(pipes as never);
      const assertion = expect(browser.evaluate('1')).rejects.toThrowError('did not answer');

      await vi.advanceTimersByTimeAsync(90_000);
      await assertion;

      expect(browser.alive).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
