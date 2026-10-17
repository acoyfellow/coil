import { Schema } from 'effect';
import type { Update } from 'foldkit';
import type { Url } from 'foldkit/url';
import { MODELS } from '../../shared/models';
import { DEFAULT_SIZE } from '../../shared/protocol';
import {
  LoadModels,
  LoadSpend,
  LoadThreads,
  LoadView,
  LoadWho,
  notifyPermission,
  storedDraft,
} from './command';
import type { Message } from './message';
import { FileView, type Model, Theme, ThreadsState, ViewState } from './model';
import { threadFromPath } from './route';
import type { CoilClient } from './rpc';

const threadFromUrl = (url: Url) => threadFromPath(url.pathname);

export const Flags = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  now: Schema.Number,
  online: Schema.Boolean,
  theme: Theme,
  openNew: Schema.Boolean,
});

export type Flags = typeof Flags.Type;

export const initialModel = (flags: Flags): Model => ({
  who: '',
  spend: null,
  threads: ThreadsState.Loading(),
  name: flags.name,
  view: ViewState.Loading(),
  live: null,
  streamEpoch: 0,
  tab: 't1',
  dirPath: '.',
  entries: { _tag: 'Loading' },
  file: FileView.Closed(),
  action: null,
  draft: '',
  sending: false,
  menuOpen: false,
  sizeMenuOpen: false,
  modelMenuOpen: false,
  models: MODELS.map((each) => ({ ...each })),
  modelQuery: '',
  modelIndex: 0,
  usageOpen: false,
  showArchived: false,
  notify: notifyPermission(),
  uploading: 0,
  palette: null,
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
    LoadSpend(),
    LoadModels(),
    LoadThreads(),
    ...(flags.name === null ? [] : [LoadView({ name: flags.name, refresh: false })]),
  ],
});
