import { Effect, Layer, Schema } from 'effect';
import { HttpRouter } from 'effect/http';
import { RpcSerialization, RpcServer } from 'effect/rpc';
import type { ModelInfo } from '../shared/models';
import {
  type Base,
  type CoilError,
  CoilRpcs,
  type DirEntry,
  type ExecResult,
  Failed,
  Invalid,
  type LoopSpec,
  type LoopState,
  NameTaken,
  NotFound,
  type Pair,
  type Pair as PairSchema,
  type Prepared,
  type Resized,
  RPC_PATH,
  SIZES,
  type Size,
  type Surface,
  ThreadBusy,
  ThreadSummary,
  type ThreadView,
  UnknownThread,
  type Usage,
} from '../shared/protocol';

const UNKNOWN_THREAD = /^unknown thread (\S+)/i;

const NAME_TAKEN = /name (\S+) is taken/i;

const BUSY = /agent is working|command is running/i;

const MISSING = /no such file|not found|ENOENT/i;

const INVALID = /must be|names are|is required/i;

export const classify = (cause: unknown): CoilError => {
  const reason = cause instanceof Error ? cause.message : String(cause);
  const unknown = UNKNOWN_THREAD.exec(reason);
  const taken = NAME_TAKEN.exec(reason);

  if (unknown?.[1] !== undefined) return new UnknownThread({ name: unknown[1] });
  if (taken?.[1] !== undefined) return new NameTaken({ name: taken[1] });
  if (BUSY.test(reason)) return new ThreadBusy({ reason });
  if (MISSING.test(reason)) return new NotFound({ reason });
  if (INVALID.test(reason)) return new Invalid({ reason });

  return new Failed({ reason });
};

export const reasonOf = (error: CoilError): string => {
  switch (error._tag) {
    case 'UnknownThread':
      return `unknown thread ${error.name}`;
    case 'NameTaken':
      return `The name ${error.name} is taken`;
    default:
      return error.reason;
  }
};

export const statusOf = (error: CoilError): 400 | 404 | 409 | 500 => {
  switch (error._tag) {
    case 'UnknownThread':
    case 'NotFound':
      return 404;
    case 'NameTaken':
    case 'ThreadBusy':
      return 409;
    case 'Invalid':
      return 400;
    case 'Failed':
      return 500;
  }
};

const plain = <A>(value: A): A =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as A);

export const attempt = <A>(work: () => Promise<A>): Effect.Effect<A, CoilError> =>
  Effect.tryPromise({ try: async () => plain(await work()), catch: classify });

type Out<A extends { readonly Type: unknown }> = Promise<A['Type']>;

export type CoilApi = {
  readonly list: () => Out<typeof ThreadSummaryList>;
  readonly create: (input: {
    name?: string | undefined;
    repo?: string | null;
    title?: string | undefined;
    createdBy: string;
    warm?: boolean;
    size?: Size | undefined;
  }) => Out<typeof ThreadView>;
  readonly view: (name: string) => Out<typeof ThreadView>;
  readonly start: (name: string, requestId: string, text: string) => Promise<{ requestId: string }>;
  readonly send: (
    name: string,
    requestId: string,
    text: string,
  ) => Promise<{ status: string; answer: string }>;
  readonly exec: (name: string, argv: string[]) => Out<typeof ExecResult>;
  readonly list_dir: (name: string, path: string) => Promise<readonly DirEntry[]>;
  readonly read: (name: string, path: string) => Promise<string>;
  readonly compact: (name: string) => Out<typeof PairSchema>;
  readonly pause: (name: string) => Promise<Pair | null>;
  readonly resize: (name: string, size: Size) => Out<typeof Resized>;
  readonly fork: (
    name: string,
    forkName: string | undefined,
    createdBy: string,
  ) => Out<typeof ThreadView>;
  readonly addTerminal: (name: string) => Promise<readonly Surface[]>;
  readonly addBrowser: (name: string) => Promise<readonly Surface[]>;
  readonly closeSurface: (name: string, id: string) => Promise<readonly Surface[]>;
  readonly wake: (name: string) => Promise<{ phase: string; running: boolean; detail: string }>;
  readonly startLoop: (name: string, spec: typeof LoopSpec.Type) => Out<typeof LoopState>;
  readonly stopLoop: (name: string) => Promise<typeof LoopState.Type | null>;
  readonly getLoop: (name: string) => Promise<typeof LoopState.Type | null>;
  readonly stopAllLoops: () => Promise<readonly string[]>;
  readonly spend: () => Promise<{ spent: number; limit: number | null }>;
  readonly setSpendLimit: (
    dollars: number | null,
  ) => Promise<{ spent: number; limit: number | null }>;
  readonly share: (name: string) => Promise<{ path: string }>;
  readonly unshare: (name: string) => Promise<null>;
  readonly stop: (name: string) => Promise<null>;
  readonly setModel: (name: string, model: string) => Out<typeof Usage>;
  readonly models: () => Promise<readonly ModelInfo[]>;
  readonly rename: (name: string, title: string) => Out<typeof ThreadSummary>;
  readonly archive: (name: string, archived: boolean) => Out<typeof ThreadSummary>;
  readonly pin: (name: string, pinned: boolean) => Out<typeof ThreadSummary>;
  readonly remove: (name: string) => Promise<null>;
  readonly bases: () => Promise<readonly (typeof Base.Type)[]>;
  readonly prepare: (repo: string, setup: string) => Out<typeof Prepared>;
};

const ThreadSummaryList = Schema.Array(ThreadSummary);

export type Caller = { readonly who: string; readonly api: CoilApi };

export const handlersFor = (caller: Caller) => {
  const { api } = caller;

  return CoilRpcs.of({
    WhoAmI: () => Effect.succeed({ who: caller.who }),
    GetSpend: () => attempt(() => api.spend()),
    SetSpendLimit: ({ dollars }) => attempt(() => api.setSpendLimit(dollars)),
    Sizes: () => Effect.succeed([...SIZES]),
    ListThreads: () => attempt(() => api.list()),
    CreateThread: (input) =>
      attempt(() =>
        api.create({
          name: input.name,
          repo: input.repo ?? null,
          title: input.title,
          createdBy: input.createdBy ?? 'web',
          warm: input.warm !== false,
          size: input.size,
        }),
      ),
    ViewThread: ({ name }) => attempt(() => api.view(name)),
    StartMessage: ({ name, requestId, text }) => attempt(() => api.start(name, requestId, text)),
    SendMessage: ({ name, requestId, text }) =>
      attempt(async () => ({ requestId, ...(await api.send(name, requestId, text)) })),
    Exec: ({ name, argv }) => attempt(() => api.exec(name, [...argv])),
    ListDir: ({ name, path }) => attempt(() => api.list_dir(name, path)),
    ReadFile: ({ name, path }) => attempt(() => api.read(name, path)),
    Compact: ({ name }) => attempt(() => api.compact(name)),
    Pause: ({ name }) => attempt(() => api.pause(name)),
    Resize: ({ name, size }) => attempt(() => api.resize(name, size)),
    Fork: ({ name, forkName, createdBy }) =>
      attempt(() => api.fork(name, forkName, createdBy ?? 'web')),
    AddSurface: ({ name, kind }) =>
      attempt(() => (kind === 'browser' ? api.addBrowser(name) : api.addTerminal(name))),
    CloseSurface: ({ name, id }) => attempt(() => api.closeSurface(name, id)),
    Wake: ({ name }) => attempt(() => api.wake(name)),
    StartLoop: ({ name, spec }) => attempt(() => api.startLoop(name, spec)),
    StopLoop: ({ name }) => attempt(() => api.stopLoop(name)),
    GetLoop: ({ name }) => attempt(() => api.getLoop(name)),
    StopAllLoops: () => attempt(() => api.stopAllLoops()),
    Share: ({ name }) => attempt(() => api.share(name)),
    Unshare: ({ name }) => attempt(() => api.unshare(name)),
    Stop: ({ name }) => attempt(() => api.stop(name)),
    Models: () => attempt(() => api.models()),
    SetModel: ({ name, model }) => attempt(() => api.setModel(name, model)),
    Rename: ({ name, title }) => attempt(() => api.rename(name, title)),
    Archive: ({ name, archived }) => attempt(() => api.archive(name, archived)),
    Pin: ({ name, pinned }) => attempt(() => api.pin(name, pinned)),
    DeleteThread: ({ name }) => attempt(() => api.remove(name)),
    ListBases: () => attempt(() => api.bases()),
    PrepareBase: ({ repo, setup }) => attempt(() => api.prepare(repo, setup)),
  });
};

export type Handlers = ReturnType<typeof handlersFor>;

const buildRpcHandler = (caller: Caller) =>
  HttpRouter.toWebHandler(
    RpcServer.layerHttp({ group: CoilRpcs, path: RPC_PATH, protocol: 'http' }).pipe(
      Layer.provide(CoilRpcs.toLayer(handlersFor(caller))),
      Layer.provide(RpcSerialization.layerJson),
    ),
    { disableLogger: true },
  ).handler;

export const isRpcPath = (pathname: string) => pathname === RPC_PATH || pathname === `${RPC_PATH}/`;

export const rpcHandler = (caller: Caller) => {
  const handler = buildRpcHandler(caller);

  return (request: Request, context: Parameters<typeof handler>[1]) => {
    const url = new URL(request.url);

    url.pathname = RPC_PATH;

    return handler(new Request(url, request), context);
  };
};
