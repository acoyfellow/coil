import { Files } from '@cloudflare/sandbox';
import { inWorkspace, SHELL_ENV, WORKSPACE } from './env';
import type { Size } from './size';

export { inWorkspace, SHELL_ENV, WORKSPACE };

export type ExecResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type Snapshot = { readonly id: string; readonly size: number };

export type Entry = { readonly name: string; readonly type: string; readonly pending?: boolean };

export class ComputerLost extends Error {
  override readonly name = 'ComputerLost';
}

export type Computer = {
  readonly running: () => boolean;
  readonly boot: (from: Snapshot | undefined, size: Size, waitMs?: number) => Promise<void>;
  readonly exec: (argv: readonly string[], cwd?: string) => Promise<ExecResult>;
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, content: string | ArrayBuffer) => Promise<void>;
  readonly list: (path: string) => Promise<Entry[]>;
  readonly snapshot: (name: string) => Promise<Snapshot>;
  readonly destroy: () => Promise<void>;
};

const PLATFORM_INACTIVITY_MS = 60 * 60 * 1000;

const LOST_LAUNCHES_BEFORE_GIVING_UP = 3;

const READY_WAIT_MS = 180_000;

const READY_POLL_MS = 1_000;

const STARTING = /not been started|not running|starting/i;

const isStarting = (cause: unknown) => STARTING.test(String(cause));

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const untilStarted = async <A>(attempt: () => Promise<A>, waitMs = READY_WAIT_MS): Promise<A> => {
  const deadline = Date.now() + waitMs;

  for (;;) {
    try {
      return await attempt();
    } catch (cause) {
      if (!isStarting(cause) || Date.now() >= deadline) throw cause;

      await pause(READY_POLL_MS);
    }
  }
};

const decode = (bytes: ArrayBuffer | Uint8Array | string | undefined): string =>
  bytes === undefined ? '' : typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);

export const sandboxComputer = (container: Container, image: string): Computer => {
  const files = new Files(container);

  const launch = async (argv: readonly string[], cwd: string) => {
    let failures = 0;
    const deadline = Date.now() + READY_WAIT_MS;

    for (;;) {
      try {
        return await container.exec([...argv], { cwd, env: SHELL_ENV });
      } catch (cause) {
        if (isStarting(cause) && Date.now() < deadline) {
          await pause(READY_POLL_MS);
          continue;
        }

        failures += 1;

        if (failures >= LOST_LAUNCHES_BEFORE_GIVING_UP) throw new ComputerLost(String(cause));
      }
    }
  };

  const exec = async (argv: readonly string[], cwd = WORKSPACE): Promise<ExecResult> => {
    const process = await launch(argv, cwd);
    const output = await process.output().catch((cause: unknown) => {
      throw new ComputerLost(`the command started but its output was lost: ${String(cause)}`);
    });

    return {
      exitCode: output.exitCode,
      stdout: decode(output.stdout),
      stderr: decode(output.stderr),
    };
  };

  return {
    running: () => container.running,
    boot: async (from, size, waitMs) => {
      if (container.running) return;

      const base = {
        enableInternet: true,
        instance: size,
        labels: { app: 'coil' },
      };

      container.start(
        from === undefined ? { ...base, image } : { ...base, containerSnapshot: { id: from.id } },
      );
      await untilStarted(() => container.setInactivityTimeout(PLATFORM_INACTIVITY_MS), waitMs);
    },
    exec,
    readFile: async (path) => (await files.readFile(inWorkspace(path))).text(),
    writeFile: async (path, content) => {
      const target = inWorkspace(path);

      await files.mkdir(target.slice(0, target.lastIndexOf('/')) || '/', { recursive: true });
      await files.writeFile(target, content);
    },
    list: async (path) =>
      (await files.readDirectory(inWorkspace(path)))
        .map((entry) => ({ name: entry.name, type: entry.type }))
        .sort((a, b) =>
          a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1,
        ),
    snapshot: async (name) => {
      const made = await container.snapshotContainer({ name });

      return { id: made.id, size: made.size };
    },
    destroy: async () => {
      if (container.running) await container.destroy();
    },
  };
};
