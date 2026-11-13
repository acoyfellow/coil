import { Schema } from 'effect';
import type { Update } from 'foldkit';
import type { Url } from 'foldkit/url';
import { MODELS } from '../../shared/models';
import { DEFAULT_SIZE } from '../../shared/protocol';
import {
  LoadAccount,
  LoadConnectors,
  LoadModels,
  LoadThreads,
  LoadView,
  LoadWho,
  notifyPermission,
  storedCollapsed,
  storedDraft,
} from './command';
import type { Message } from './message';
import { FileView, type Model, SettingsSection, Theme, ThreadsState, ViewState } from './model';
import { threadFromPath } from './route';
import type { CoilClient } from './rpc';

const threadFromUrl = (url: Url) => threadFromPath(url.pathname);

export const Flags = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  now: Schema.Number,
  online: Schema.Boolean,
  theme: Theme,
  openNew: Schema.Boolean,
  openSettings: Schema.optional(Schema.NullOr(SettingsSection)),
  connectorProblem: Schema.optional(Schema.NullOr(Schema.String)),
});

export type Flags = typeof Flags.Type;

export const initialModel = (flags: Flags): Model => ({
  who: '',
  threads: ThreadsState.Loading(),
  name: flags.name,
  view: ViewState.Loading(),
  live: null,
  streamEpoch: 0,
  reconnects: 0,
  tab: 'files',
  dirPath: '.',
  entries: { _tag: 'Loading' },
  file: FileView.Closed(),
  action: null,
  draft: '',
  account: null,
  sending: false,
  menuOpen: false,
  sizeMenuOpen: false,
  modelMenuOpen: false,
  models: MODELS.map((each) => ({ ...each })),
  modelQuery: '',
  modelIndex: 0,
  usageOpen: false,
  showArchived: false,
  connectors: false,
  collapsed: storedCollapsed(),
  listFilter: '',
  rowMenu: null,
  folders: [],
  dragging: null,
  dropTarget: null,
  editingFolder: null,
  movePicker: null,
  notify: notifyPermission(),
  uploading: 0,
  palette: null,
  historyOpen: false,
  settings:
    flags.openSettings === undefined || flags.openSettings === null
      ? null
      : { query: '', section: flags.openSettings },
  connectorList: [],
  connectorProblem: flags.connectorProblem ?? null,
  addMenuOpen: false,
  drawer: 'none',
  newThread: { open: flags.openNew, repo: '', title: '', size: DEFAULT_SIZE, creating: false },
  toasts: [],
  nextToast: 1,
  online: flags.online,
  theme: flags.theme,
  installable: false,
  now: flags.now,
});

const withStoredDraft = (model: Model): Model =>
  model.name === null ? model : { ...model, draft: storedDraft(model.name) };

export const init = (flags: Flags, url: Url): Update.Return<Model, Message, CoilClient> => ({
  model: withStoredDraft(initialModel({ ...flags, name: flags.name ?? threadFromUrl(url) })),
  commands: [
    LoadWho(),
    LoadConnectors(),
    LoadAccount(),
    LoadModels(),
    LoadThreads(),
    ...(flags.name === null ? [] : [LoadView({ name: flags.name, refresh: false })]),
  ],
});
