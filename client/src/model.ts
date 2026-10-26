import { Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';
import {
  ConnectorState,
  DirEntry,
  type LiveEvent,
  ModelOption,
  Size,
  ThreadSummary,
  ThreadView,
} from '../../shared/protocol';

export const Remote = <A extends Schema.Top>(value: A) =>
  defineTaggedUnion({
    Loading: {},
    Failed: { reason: Schema.String },
    Ready: { value },
  });

export const ThreadsState = Remote(Schema.Array(ThreadSummary));

export type ThreadsState = typeof ThreadsState.Type;

export const ViewState = Remote(ThreadView);

export type ViewState = typeof ViewState.Type;

export const LiveTool = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  args: Schema.String,
  output: Schema.String,
  done: Schema.Boolean,
  startedAt: Schema.Number,
});

export type LiveTool = typeof LiveTool.Type;

export const Live = Schema.Struct({
  startedAt: Schema.NullOr(Schema.Number),
  text: Schema.String,
  thinking: Schema.String,
  tools: Schema.Array(LiveTool),
  compacting: Schema.Boolean,
});

export type Live = typeof Live.Type;

export const emptyLive: Live = {
  startedAt: null,
  text: '',
  thinking: '',
  tools: [],
  compacting: false,
};

export const SettingsSection = Schema.Literals(['account', 'usage', 'app', 'connectors']);

export type SettingsSection = typeof SettingsSection.Type;

export const Action = Schema.Literals(['compact', 'pause', 'fork', 'size']);

export type Action = typeof Action.Type;

export const ThreadOp = Schema.Union([
  Schema.TaggedStruct('Stop', {}),
  Schema.TaggedStruct('SetModel', { model: Schema.String }),
  Schema.TaggedStruct('Rename', {}),
  Schema.TaggedStruct('Archive', { archived: Schema.Boolean }),
  Schema.TaggedStruct('Pin', { pinned: Schema.Boolean }),
  Schema.TaggedStruct('Delete', {}),
  Schema.TaggedStruct('Share', {}),
]);

export type ThreadOp = typeof ThreadOp.Type;

export const FileView = defineTaggedUnion({
  Closed: {},
  Loading: { path: Schema.String },
  Loaded: { path: Schema.String, text: Schema.String },
});

export type FileView = typeof FileView.Type;

export const Toast = Schema.Struct({ id: Schema.Number, text: Schema.String, bad: Schema.Boolean });

export type Toast = typeof Toast.Type;

export const Drawer = Schema.Literals(['none', 'side', 'panel']);

export type Drawer = typeof Drawer.Type;

export const NewThreadForm = Schema.Struct({
  open: Schema.Boolean,
  repo: Schema.String,
  title: Schema.String,
  size: Size,
  creating: Schema.Boolean,
});

export type NewThreadForm = typeof NewThreadForm.Type;

export const Theme = Schema.Literals(['system', 'light', 'dark']);

export type Theme = typeof Theme.Type;

export const Model = Schema.Struct({
  who: Schema.String,
  spend: Schema.NullOr(
    Schema.Struct({ spent: Schema.Number, limit: Schema.NullOr(Schema.Number) }),
  ),
  threads: ThreadsState,
  name: Schema.NullOr(Schema.String),
  view: ViewState,
  live: Schema.NullOr(Live),
  streamEpoch: Schema.Number,
  reconnects: Schema.Number,
  tab: Schema.String,
  dirPath: Schema.String,
  entries: Remote(Schema.Array(DirEntry)),
  file: FileView,
  action: Schema.NullOr(Action),
  draft: Schema.String,
  account: Schema.NullOr(
    Schema.Struct({ name: Schema.String, gateway: Schema.NullOr(Schema.String) }),
  ),
  sending: Schema.Boolean,
  menuOpen: Schema.Boolean,
  sizeMenuOpen: Schema.Boolean,
  modelMenuOpen: Schema.Boolean,
  models: Schema.Array(ModelOption),
  modelQuery: Schema.String,
  modelIndex: Schema.Number,
  usageOpen: Schema.Boolean,
  showArchived: Schema.Boolean,
  connectors: Schema.Boolean,
  connectorList: Schema.Array(ConnectorState),
  connectorProblem: Schema.NullOr(Schema.String),
  collapsed: Schema.Array(Schema.String),
  listFilter: Schema.String,
  rowMenu: Schema.NullOr(Schema.String),
  notify: Schema.Literals(['unsupported', 'default', 'granted', 'denied']),
  uploading: Schema.Number,
  palette: Schema.NullOr(Schema.Struct({ query: Schema.String, index: Schema.Number })),
  settings: Schema.NullOr(Schema.Struct({ query: Schema.String, section: SettingsSection })),
  addMenuOpen: Schema.Boolean,
  drawer: Drawer,
  newThread: NewThreadForm,
  toasts: Schema.Array(Toast),
  nextToast: Schema.Number,
  online: Schema.Boolean,
  theme: Theme,
  installable: Schema.Boolean,
  now: Schema.Number,
});

export type Model = typeof Model.Type;

export type LiveEventValue = typeof LiveEvent.Type;
