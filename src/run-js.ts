export const RUN_JS_LIMIT_MS = 10_000;
export const RUN_JS_OUTPUT_CAP = 30_000;

export type RunJsFiles = Readonly<Record<string, string>>;

export type RunJsResult = {
  readonly ok: boolean;
  readonly output: string;
  readonly result: unknown;
  readonly error?: string;
  readonly written: RunJsFiles;
  readonly ms: number;
};

export const runJsModule = (code: string): string => `export default {
  async fetch(request) {
    const input = await request.json();
    const files = new Map(Object.entries(input.files));
    const written = {};
    const lines = [];
    const say = (...parts) => lines.push(parts.map((p) => typeof p === 'string' ? p : JSON.stringify(p)).join(' '));
    const console = { log: say, info: say, warn: say, error: say };
    const fs = Object.freeze({
      read: (path) => {
        if (!files.has(path)) throw new Error('no such file: ' + path);
        return files.get(path);
      },
      write: (path, text) => {
        files.set(path, String(text));
        written[path] = String(text);
      },
      list: () => [...files.keys()].sort(),
    });
    try {
      const result = await (async () => {
${code}
      })();
      return Response.json({ ok: true, output: lines.join('\\n'), result: result ?? null, written });
    } catch (error) {
      return Response.json({ ok: false, output: lines.join('\\n'), result: null, written, error: String(error && error.message ? error.message : error) });
    }
  }
};`;

const clipOutput = (text: string) =>
  text.length > RUN_JS_OUTPUT_CAP ? `${text.slice(0, RUN_JS_OUTPUT_CAP)}\n[clipped]` : text;

export const runJs = async (
  loader: WorkerLoader,
  code: string,
  files: RunJsFiles,
  now: () => number = Date.now,
): Promise<RunJsResult> => {
  const started = now();
  const worker = loader.load({
    compatibilityDate: '2026-08-22',
    mainModule: 'run.js',
    modules: { 'run.js': runJsModule(code) },
    globalOutbound: null,
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`run_js stopped after ${RUN_JS_LIMIT_MS}ms`)),
      RUN_JS_LIMIT_MS,
    ),
  );

  try {
    const response = await Promise.race([
      worker
        .getEntrypoint()
        .fetch(
          new Request('https://run.coil/', { method: 'POST', body: JSON.stringify({ files }) }),
        ),
      timeout,
    ]);
    const body = (await response.json()) as Omit<RunJsResult, 'ms'>;

    return { ...body, output: clipOutput(body.output), ms: now() - started };
  } catch (cause) {
    return {
      ok: false,
      output: '',
      result: null,
      error: cause instanceof Error ? cause.message : String(cause),
      written: {},
      ms: now() - started,
    };
  }
};
