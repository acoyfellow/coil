import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

export const SIZES = ['lite', 'standard-1', 'standard-2', 'standard-3', 'standard-4'] as const;

export const Size = Schema.Literals(SIZES);

export type Size = typeof Size.Type;

export const DEFAULT_SIZE: Size = 'standard-1';

export const ThreadName = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,62}$/));

export const Phase = Schema.Literals(['new', 'awake', 'paused']);

export type Phase = typeof Phase.Type;

export const ThreadSummary = Schema.Struct({
  name: Schema.String,
  title: Schema.String,
  phase: Schema.String,
  busy: Schema.Boolean,
  repo: Schema.NullOr(Schema.String),
  parent: Schema.NullOr(Schema.String),
  forkedFrom: Schema.NullOr(Schema.String),
  createdBy: Schema.String,
  owner: Schema.String,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  archived: Schema.Boolean,
  model: Schema.String,
  spend: Schema.Number,
  looping: Schema.Boolean,
  failed: Schema.optional(Schema.Boolean),
  pinned: Schema.optional(Schema.Boolean),
});

export type ThreadSummary = typeof ThreadSummary.Type;

export const Origin = Schema.Struct({
  parent: Schema.NullOr(Schema.String),
  forkedFrom: Schema.NullOr(Schema.String),
  base: Schema.NullOr(Schema.String),
  seed: Schema.NullOr(Schema.String),
});

export type Origin = typeof Origin.Type;

export const DiskSnapshot = Schema.Struct({ id: Schema.String, size: Schema.Number });

export const Pair = Schema.Struct({
  at: Schema.Number,
  reason: Schema.Literals(['pause', 'compaction']),
  snapshot: DiskSnapshot,
  summaryEntry: Schema.NullOr(Schema.String),
});

export type Pair = typeof Pair.Type;

export const ExecRecord = Schema.Struct({
  seq: Schema.Number,
  at: Schema.Number,
  argv: Schema.Array(Schema.String),
  exitCode: Schema.Number,
  bytes: Schema.Number,
  sha256: Schema.String,
  output: Schema.String,
  by: Schema.Literals(['agent', 'human']),
});

export type ExecRecord = typeof ExecRecord.Type;

export const SurfaceKind = Schema.Literals(['terminal', 'browser']);

export type SurfaceKind = typeof SurfaceKind.Type;

export const Surface = Schema.Struct({
  id: Schema.String,
  kind: SurfaceKind,
  title: Schema.String,
});

export type Surface = typeof Surface.Type;

export const ToolCall = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  args: Schema.String,
});

export const ChatMessage = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  role: Schema.String,
  text: Schema.String,
  tool: Schema.optional(ToolCall),
  toolCallId: Schema.optional(Schema.String),
});

export type ChatMessage = typeof ChatMessage.Type;

export const Usage = Schema.Struct({
  input: Schema.Number,
  output: Schema.Number,
  cacheRead: Schema.Number,
  cost: Schema.Number,
  contextTokens: Schema.Number,
  contextWindow: Schema.Number,
});

export type Usage = typeof Usage.Type;

export const ModelOption = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  context: Schema.Number,
  inputPerMtok: Schema.Number,
  outputPerMtok: Schema.Number,
  vision: Schema.Boolean,
  gateway: Schema.optional(Schema.Boolean),
  reasoning: Schema.optional(Schema.Boolean),
  createdAt: Schema.optional(Schema.String),
});

export const Turn = Schema.Struct({
  seq: Schema.Number,
  at: Schema.Number,
  ended: Schema.Number,
  tools: Schema.Number,
  prompt: Schema.String,
  stat: Schema.String,
  diff: Schema.String,
});

export type Turn = typeof Turn.Type;

export const LoopSpec = Schema.Struct({
  prompt: Schema.String,
  everySeconds: Schema.Number,
  maxRuns: Schema.Number,
  maxSpend: Schema.Number,
  gate: Schema.NullOr(Schema.String),
});

export const LoopState = Schema.Struct({
  ...LoopSpec.fields,
  enabled: Schema.Boolean,
  runs: Schema.Array(
    Schema.Struct({
      at: Schema.Number,
      costBefore: Schema.Number,
      gateExit: Schema.NullOr(Schema.Number),
    }),
  ),
  startedCost: Schema.Number,
  nextAt: Schema.Number,
  stoppedBecause: Schema.NullOr(Schema.String),
  loopId: Schema.optional(Schema.String),
});

export const ThreadView = Schema.Struct({
  name: Schema.String,
  title: Schema.String,
  phase: Phase,
  busy: Schema.Boolean,
  repo: Schema.NullOr(Schema.String),
  running: Schema.Boolean,
  origin: Origin,
  owner: Schema.String,
  size: Size,
  messages: Schema.Array(ChatMessage),
  pairs: Schema.Array(Pair),
  execs: Schema.Array(ExecRecord),
  surfaces: Schema.Array(Surface),
  model: Schema.String,
  usage: Usage,
  turns: Schema.Array(Turn),
});

export type ThreadView = typeof ThreadView.Type;

export const DirEntry = Schema.Struct({ name: Schema.String, type: Schema.String });

export type DirEntry = typeof DirEntry.Type;

export const ExecResult = Schema.Struct({
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
  seq: Schema.Number,
});

export const Resized = Schema.Struct({ size: Size, restarted: Schema.Boolean });

export const Base = Schema.Struct({
  repo: Schema.String,
  thread: Schema.String,
  setup: Schema.String,
  at: Schema.Number,
});

export const Prepared = Schema.Struct({
  repo: Schema.String,
  thread: Schema.String,
  snapshot: DiskSnapshot,
});

export const Accepted = Schema.Struct({ requestId: Schema.String });

export const Answered = Schema.Struct({
  requestId: Schema.String,
  status: Schema.String,
  answer: Schema.String,
});

export const Who = Schema.Struct({
  who: Schema.String,
  connectors: Schema.optional(Schema.Boolean),
});

export const Spend = Schema.Struct({ spent: Schema.Number, limit: Schema.NullOr(Schema.Number) });

export class UnknownThread extends Schema.TaggedError<UnknownThread>()('UnknownThread', {
  name: Schema.String,
}) {}

export class NameTaken extends Schema.TaggedError<NameTaken>()('NameTaken', {
  name: Schema.String,
}) {}

export class ThreadBusy extends Schema.TaggedError<ThreadBusy>()('ThreadBusy', {
  reason: Schema.String,
}) {}

export class NotFound extends Schema.TaggedError<NotFound>()('NotFound', {
  reason: Schema.String,
}) {}

export class Invalid extends Schema.TaggedError<Invalid>()('Invalid', { reason: Schema.String }) {}

export class Failed extends Schema.TaggedError<Failed>()('Failed', { reason: Schema.String }) {}

export const CoilError = Schema.Union([
  UnknownThread,
  NameTaken,
  ThreadBusy,
  NotFound,
  Invalid,
  Failed,
]);

export type CoilError = typeof CoilError.Type;

const target = { name: Schema.String };

export const CoilRpcs = RpcGroup.make(
  Rpc.make('WhoAmI', { success: Who, error: CoilError }),
  Rpc.make('GetSpend', { success: Spend, error: CoilError }),
  Rpc.make('SetSpendLimit', {
    payload: { dollars: Schema.NullOr(Schema.Number) },
    success: Spend,
    error: CoilError,
  }),
  Rpc.make('Sizes', { success: Schema.Array(Size), error: CoilError }),
  Rpc.make('ListThreads', { success: Schema.Array(ThreadSummary), error: CoilError }),
  Rpc.make('CreateThread', {
    payload: {
      name: Schema.optional(Schema.String),
      repo: Schema.optional(Schema.NullOr(Schema.String)),
      title: Schema.optional(Schema.String),
      warm: Schema.optional(Schema.Boolean),
      size: Schema.optional(Size),
      createdBy: Schema.optional(Schema.String),
    },
    success: ThreadView,
    error: CoilError,
  }),
  Rpc.make('ViewThread', { payload: target, success: ThreadView, error: CoilError }),
  Rpc.make('StartMessage', {
    payload: {
      ...target,
      requestId: Schema.String,
      text: Schema.String.check(Schema.isMinLength(1)),
    },
    success: Accepted,
    error: CoilError,
  }),
  Rpc.make('SendMessage', {
    payload: {
      ...target,
      requestId: Schema.String,
      text: Schema.String.check(Schema.isMinLength(1)),
    },
    success: Answered,
    error: CoilError,
  }),
  Rpc.make('Exec', {
    payload: { ...target, argv: Schema.Array(Schema.String) },
    success: ExecResult,
    error: CoilError,
  }),
  Rpc.make('ListDir', {
    payload: { ...target, path: Schema.String },
    success: Schema.Array(DirEntry),
    error: CoilError,
  }),
  Rpc.make('ReadFile', {
    payload: { ...target, path: Schema.String },
    success: Schema.String,
    error: CoilError,
  }),
  Rpc.make('Compact', { payload: target, success: Pair, error: CoilError }),
  Rpc.make('Pause', { payload: target, success: Schema.NullOr(Pair), error: CoilError }),
  Rpc.make('Resize', { payload: { ...target, size: Size }, success: Resized, error: CoilError }),
  Rpc.make('Fork', {
    payload: {
      ...target,
      forkName: Schema.optional(Schema.String),
      createdBy: Schema.optional(Schema.String),
    },
    success: ThreadView,
    error: CoilError,
  }),
  Rpc.make('AddSurface', {
    payload: { ...target, kind: SurfaceKind },
    success: Schema.Array(Surface),
    error: CoilError,
  }),
  Rpc.make('CloseSurface', {
    payload: { ...target, id: Schema.String },
    success: Schema.Array(Surface),
    error: CoilError,
  }),
  Rpc.make('Wake', {
    payload: target,
    success: Schema.Struct({
      phase: Schema.String,
      running: Schema.Boolean,
      detail: Schema.String,
    }),
    error: CoilError,
  }),
  Rpc.make('StartLoop', {
    payload: { ...target, spec: LoopSpec },
    success: LoopState,
    error: CoilError,
  }),
  Rpc.make('StopLoop', { payload: target, success: Schema.NullOr(LoopState), error: CoilError }),
  Rpc.make('GetLoop', { payload: target, success: Schema.NullOr(LoopState), error: CoilError }),
  Rpc.make('StopAllLoops', { success: Schema.Array(Schema.String), error: CoilError }),
  Rpc.make('Share', {
    payload: target,
    success: Schema.Struct({ path: Schema.String }),
    error: CoilError,
  }),
  Rpc.make('Unshare', { payload: target, success: Schema.Null, error: CoilError }),
  Rpc.make('Stop', { payload: target, success: Schema.Null, error: CoilError }),
  Rpc.make('Models', { success: Schema.Array(ModelOption), error: CoilError }),
  Rpc.make('SetModel', {
    payload: { ...target, model: Schema.String },
    success: Usage,
    error: CoilError,
  }),
  Rpc.make('Rename', {
    payload: { ...target, title: Schema.String },
    success: ThreadSummary,
    error: CoilError,
  }),
  Rpc.make('Archive', {
    payload: { ...target, archived: Schema.Boolean },
    success: ThreadSummary,
    error: CoilError,
  }),
  Rpc.make('Pin', {
    payload: { ...target, pinned: Schema.Boolean },
    success: ThreadSummary,
    error: CoilError,
  }),
  Rpc.make('DeleteThread', { payload: target, success: Schema.Null, error: CoilError }),
  Rpc.make('ListBases', { success: Schema.Array(Base), error: CoilError }),
  Rpc.make('PrepareBase', {
    payload: { repo: Schema.String, setup: Schema.String },
    success: Prepared,
    error: CoilError,
  }),
);

export type CoilRpcs = typeof CoilRpcs;

export const RPC_PATH = '/api/rpc';

export const LiveEvent = Schema.Union([
  Schema.TaggedStruct('hello', {}),
  Schema.TaggedStruct('text', { delta: Schema.String }),
  Schema.TaggedStruct('tool_start', {
    id: Schema.String,
    name: Schema.String,
    args: Schema.String,
  }),
  Schema.TaggedStruct('tool_output', { id: Schema.String, append: Schema.String }),
  Schema.TaggedStruct('tool_end', { id: Schema.String, name: Schema.String }),
  Schema.TaggedStruct('turn_end', {}),
  Schema.TaggedStruct('compaction', { phase: Schema.Literals(['start', 'end']) }),
  Schema.TaggedStruct('state', { phase: Phase, busy: Schema.Boolean, running: Schema.Boolean }),
  Schema.TaggedStruct('exec', { record: ExecRecord }),
  Schema.TaggedStruct('surfaces', { surfaces: Schema.Array(Surface) }),
  Schema.TaggedStruct('page', {
    page: Schema.Struct({ url: Schema.String, title: Schema.String }),
  }),
]);

export type LiveEvent = typeof LiveEvent.Type;

export const eventsPath = (name: string) => `/api/threads/${name}/events`;

export const terminalPath = (name: string, id: string, cols: number, rows: number) =>
  `/api/threads/${name}/terminal?id=${encodeURIComponent(id)}&cols=${cols}&rows=${rows}`;

export const browserPath = (name: string) => `/api/threads/${name}/browser`;
