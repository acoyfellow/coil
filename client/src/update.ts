import type { Command, Update } from 'foldkit';
import { modifyFields } from 'foldkit/struct';
import { type LiveEvent, SIZES, type Size, type ThreadView } from '../../shared/protocol';
import {
  AddSurface,
  AskNotify,
  CloseSurface,
  ConfirmResize,
  CopyText,
  CreateThread,
  EditSpendLimit,
  ExpireToast,
  FocusComposer,
  FocusModelSearch,
  FocusPalette,
  Install,
  JumpToLatest,
  KillLoops,
  LoadDir,
  LoadFile,
  LoadSpend,
  LoadThreads,
  LoadView,
  PushUrl,
  RefreshViewSoon,
  Resize,
  RevealModelOption,
  RunAction,
  RunOp,
  SaveDraft,
  SaveTheme,
  SendMessage,
  ShowNotifications,
  storedDraft,
  systemIsDark,
  UploadFiles,
} from './command';
import { browserTabFor } from './focus';
import { Message } from './message';
import {
  type Action,
  emptyLive,
  FileView,
  type Live,
  type Model,
  ThreadsState,
  ViewState,
} from './model';
import { moveIndex, pickerOptions } from './model-picker';
import { finishedThreads } from './notify';
import { paletteItems } from './palette';
import { pathForThread } from './route';
import type { CoilClient } from './rpc';

type UpdateReturn = Update.Return<Model, Message, CoilClient>;

type AnyCommand = Command.Command<Message, never, CoilClient>;

const DOING: Record<Action, string> = {
  compact: 'Compacting: summarising and saving the disk…',
  pause: 'Pausing: saving the disk…',
  fork: 'Forking: saving this disk…',
  size: 'Changing the computer size…',
};

export const viewOf = (model: Model): ThreadView | null =>
  ViewState.match(model.view, {
    Loading: () => null,
    Failed: () => null,
    Ready: ({ value }) => value,
  });

const withView = (model: Model, change: (view: ThreadView) => ThreadView): Model => {
  const view = viewOf(model);

  return view === null
    ? model
    : modifyFields(model, { view: () => ViewState.Ready({ value: change(view) }) });
};

export const toast = (model: Model, text: string, bad = false): UpdateReturn => {
  const id = model.nextToast;

  return {
    model: modifyFields(model, {
      toasts: (toasts) => [...toasts, { id, text, bad }],
      nextToast: (next) => next + 1,
    }),
    commands: [ExpireToast({ id, bad })],
  };
};

const withCommands = (result: UpdateReturn, commands: readonly AnyCommand[]): UpdateReturn => ({
  model: result.model,
  commands: [...(result.commands ?? []), ...commands],
});

const firstSurfaceTab = (view: ThreadView | null): string => view?.surfaces[0]?.id ?? 'files';

const openThread = (model: Model, name: string | null): UpdateReturn => {
  const same = name === model.name;
  const next = modifyFields(model, {
    name: () => name,
    view: (view) => (same ? view : ViewState.Loading()),
    live: (live) => (same ? live : null),
    streamEpoch: (epoch) => (same ? epoch : epoch + 1),
    reconnects: (count) => (same ? count : 0),
    dirPath: (path) => (same ? path : '.'),
    entries: (entries) => (same ? entries : { _tag: 'Loading' as const }),
    file: (file) => (same ? file : FileView.Closed()),
    drawer: () => 'none' as const,
    menuOpen: () => false,
    sizeMenuOpen: () => false,
    draft: (draft) => (same || name === null ? draft : storedDraft(name)),
  });

  if (name === null || same) return { model: next };

  return { model: next, commands: [LoadView({ name, refresh: false })] };
};

const liveFrom = (model: Model): Live => model.live ?? emptyLive;

const applyEvent = (model: Model, event: LiveEvent): UpdateReturn => {
  const name = model.name;

  if (name === null) return { model };

  switch (event._tag) {
    case 'hello':
    case 'page':
      return { model };
    case 'state': {
      const view = viewOf(model);
      const wasBusy = view?.busy ?? false;
      const next = withView(model, (current) => ({
        ...current,
        busy: event.busy,
        phase: event.phase,
        running: event.running,
      }));

      if (wasBusy && !event.busy)
        return {
          model: modifyFields(next, { live: () => null }),
          commands: [LoadView({ name, refresh: true }), LoadThreads()],
        };

      return {
        model:
          event.busy && next.live === null ? modifyFields(next, { live: () => emptyLive }) : next,
      };
    }
    case 'exec':
      return {
        model: withView(model, (view) =>
          view.execs.some((record) => record.seq === event.record.seq)
            ? view
            : { ...view, execs: [...view.execs, event.record] },
        ),
      };
    case 'surfaces': {
      const hadBrowser =
        viewOf(model)?.surfaces.some((surface) => surface.kind === 'browser') ?? false;
      const next = withView(model, (view) => ({ ...view, surfaces: event.surfaces }));

      return {
        model: hadBrowser
          ? next
          : withTab(next, browserTabFor(viewOf(next)?.surfaces ?? [], next.tab, 'browser_')),
      };
    }
    case 'text':
      return {
        model: modifyFields(model, {
          live: () => ({ ...liveFrom(model), text: liveFrom(model).text + event.delta }),
        }),
      };
    case 'tool_start':
      return {
        model: modifyFields(
          withTab(model, browserTabFor(viewOf(model)?.surfaces ?? [], model.tab, event.name)),
          {
            live: () => ({
              ...liveFrom(model),
              text: '',
              tools: [
                ...liveFrom(model).tools,
                {
                  id: event.id,
                  name: event.name,
                  args: event.args,
                  output: '',
                  done: false,
                  startedAt: model.now,
                },
              ],
            }),
          },
        ),
      };
    case 'tool_output':
      return {
        model: modifyFields(model, {
          live: () => ({
            ...liveFrom(model),
            tools: liveFrom(model).tools.map((tool) =>
              tool.id === event.id ? { ...tool, output: tool.output + event.append } : tool,
            ),
          }),
        }),
      };
    case 'tool_end':
      return {
        model: modifyFields(
          withTab(model, browserTabFor(viewOf(model)?.surfaces ?? [], model.tab, event.name)),
          {
            live: () => ({
              ...liveFrom(model),
              tools: liveFrom(model).tools.map((tool) =>
                tool.id === event.id ? { ...tool, done: true } : tool,
              ),
            }),
          },
        ),
        commands: [RefreshViewSoon({ name })],
      };
    case 'turn_end':
      return {
        model: modifyFields(model, { live: () => ({ ...liveFrom(model), text: '' }) }),
        commands: [RefreshViewSoon({ name }), LoadSpend()],
      };
    case 'compaction':
      return {
        model: modifyFields(model, {
          live: () => ({ ...liveFrom(model), compacting: event.phase === 'start' }),
        }),
      };
  }
};

const send = (model: Model): UpdateReturn => {
  const text = model.draft.trim();
  const view = viewOf(model);

  if (text === '' || model.name === null || view === null || view.busy) return { model };

  const pending = modifyFields(model, {
    draft: () => '',
    sending: () => true,
    live: () => ({ ...emptyLive, startedAt: model.now }),
    view: () =>
      ViewState.Ready({
        value: {
          ...view,
          busy: true,
          messages: [...view.messages, { id: 'pending', kind: 'pi.user', role: 'user', text }],
        },
      }),
  });

  return {
    model: pending,
    commands: [
      SendMessage({ name: model.name, text }),
      SaveDraft({ thread: model.name, draft: '' }),
    ],
  };
};

const runAction = (model: Model, action: Action): UpdateReturn => {
  const view = viewOf(model);

  if (model.name === null || view === null || view.busy || model.action !== null) return { model };

  const started = modifyFields(model, { action: () => action, menuOpen: () => false });

  return withCommands(toast(started, DOING[action]), [RunAction({ name: model.name, action })]);
};

const nextTheme = (model: Model) => {
  const dark = model.theme === 'system' ? systemIsDark() : model.theme === 'dark';

  return dark ? ('light' as const) : ('dark' as const);
};

const isSize = (value: string): value is Size => (SIZES as readonly string[]).includes(value);

const selectTab = (model: Model, tab: string): UpdateReturn => {
  const next = modifyFields(model, { tab: () => tab, addMenuOpen: () => false });
  const needsFiles = tab === 'files' && model.entries._tag !== 'Ready' && model.name !== null;

  return needsFiles && model.name !== null
    ? { model: next, commands: [LoadDir({ name: model.name, path: model.dirPath })] }
    : { model: next };
};

const withTab = (model: Model, tab: string): Model =>
  tab === model.tab ? model : modifyFields(model, { tab: () => tab });

const ensureTab = (model: Model): Model => {
  const view = viewOf(model);

  if (view === null || model.tab === 'files' || model.tab === 'history') return model;
  if (view.surfaces.some((surface) => surface.id === model.tab)) return model;

  return modifyFields(model, { tab: () => firstSurfaceTab(view) });
};

const forCurrent = (model: Model, name: string, apply: () => UpdateReturn): UpdateReturn =>
  name === model.name ? apply() : { model };

const anyOverlayOpen = (model: Model): boolean =>
  model.palette !== null ||
  model.modelMenuOpen ||
  model.sizeMenuOpen ||
  model.addMenuOpen ||
  model.menuOpen ||
  model.usageOpen;

const stopFromKeyboard = (model: Model): UpdateReturn => {
  const working = viewOf(model)?.busy ?? false;

  return model.name === null || !working || anyOverlayOpen(model)
    ? { model }
    : update(model, Message.ClickedOp({ name: model.name, op: { _tag: 'Stop' } }));
};

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    LoadedWho: ({ who }) => ({ model: modifyFields(model, { who: () => who }) }),
    LoadedAccount: ({ account, gateway }) => ({
      model: modifyFields(model, {
        account: () => (account === null ? null : { name: account, gateway }),
      }),
    }),
    LoadedSpend: (spend) => ({ model: modifyFields(model, { spend: () => spend }) }),
    ClickedSpendLimit: () => ({
      model,
      commands: [
        EditSpendLimit({ current: model.spend?.limit ?? null, spent: model.spend?.spent ?? 0 }),
      ],
    }),
    LoadedThreads: ({ threads }) => {
      const before = model.threads._tag === 'Ready' ? model.threads.value : [];
      const finished = finishedThreads(before, threads);
      const next = modifyFields(model, { threads: () => ThreadsState.Ready({ value: threads }) });

      return finished.length === 0
        ? { model: next }
        : { model: next, commands: [ShowNotifications({ items: finished })] };
    },
    ClickedNotify: () => ({ model, commands: [AskNotify()] }),
    ChangedNotify: ({ permission }) =>
      toast(
        modifyFields(model, { notify: () => permission }),
        permission === 'granted'
          ? 'Notifications on. coil tells you when a thread or loop finishes while this tab is in the background.'
          : 'Notifications are off for this site.',
        permission !== 'granted',
      ),
    FailedThreads: ({ reason }) => ({
      model: modifyFields(model, { threads: () => ThreadsState.Failed({ reason }) }),
    }),
    ClickedRetryThreads: () => ({
      model: modifyFields(model, { threads: () => ThreadsState.Loading() }),
      commands: [LoadThreads()],
    }),
    Ticked: ({ now }) => ({
      model: modifyFields(model, { now: () => now }),
      commands: [LoadThreads()],
    }),

    TickedTurn: ({ now }) => ({ model: modifyFields(model, { now: () => now }) }),

    NavigatedTo: ({ name }) => openThread(model, name),
    ClickedThread: ({ name }) => ({
      model: modifyFields(model, { drawer: () => 'none' as const }),
      commands: [PushUrl({ url: pathForThread(name) })],
    }),
    LoadedView: ({ name, view }) =>
      forCurrent(model, name, () => {
        const next = ensureTab(
          modifyFields(model, {
            view: () => ViewState.Ready({ value: view }),
            live: (live) => (view.busy ? (live ?? emptyLive) : null),
          }),
        );

        return next.tab === 'files'
          ? { model: next, commands: [LoadDir({ name, path: next.dirPath })] }
          : { model: next };
      }),
    RefreshedView: ({ name, view }) =>
      forCurrent(model, name, () => {
        const busy = viewOf(model)?.busy ?? view.busy;

        return {
          model: ensureTab(
            modifyFields(model, {
              view: () => ViewState.Ready({ value: { ...view, busy } }),
              live: (live) =>
                live === null ? null : { ...live, tools: live.tools.filter((tool) => !tool.done) },
            }),
          ),
        };
      }),
    FailedView: ({ name, reason }) =>
      forCurrent(model, name, () =>
        viewOf(model) === null
          ? { model: modifyFields(model, { view: () => ViewState.Failed({ reason }) }) }
          : { model },
      ),
    ClickedRetryView: () =>
      model.name === null
        ? { model }
        : {
            model: modifyFields(model, { view: () => ViewState.Loading() }),
            commands: [LoadView({ name: model.name, refresh: false })],
          },

    ReceivedEvent: ({ name, event }) => forCurrent(model, name, () => applyEvent(model, event)),
    StreamClosed: ({ name }) =>
      forCurrent(model, name, () => ({
        model: modifyFields(model, {
          streamEpoch: (epoch) => epoch + 1,
          reconnects: (count) => count + 1,
        }),
      })),
    StreamOpened: ({ name }) =>
      forCurrent(model, name, () => ({
        model: modifyFields(model, { reconnects: () => 0 }),
        commands: model.reconnects > 0 ? [LoadView({ name, refresh: true })] : [],
      })),
    ClickedReconnect: () => ({
      model: modifyFields(model, { reconnects: () => 0, streamEpoch: (epoch) => epoch + 1 }),
    }),

    ClickedJumpToLatest: () => ({ model, commands: [JumpToLatest()] }),
    UpdatedDraft: ({ value }) => ({
      model: modifyFields(model, { draft: () => value }),
      commands: model.name === null ? [] : [SaveDraft({ thread: model.name, draft: value })],
    }),
    SubmittedDraft: () => send(model),
    DroppedFiles: ({ count }) =>
      model.name === null || count === 0
        ? { model }
        : {
            model: modifyFields(model, { uploading: (n) => n + count }),
            commands: [UploadFiles({ name: model.name })],
          },
    UploadedFiles: ({ name, paths, failed }) => {
      const done = modifyFields(model, {
        uploading: (n) => Math.max(0, n - paths.length - failed.length),
        draft: (draft) =>
          name !== model.name || paths.length === 0
            ? draft
            : `${draft}${draft === '' || draft.endsWith('\n') ? '' : '\n'}Attached: ${paths.join(', ')}\n`,
      });

      return failed.length === 0
        ? toast(done, `Uploaded ${paths.length} file${paths.length === 1 ? '' : 's'}.`)
        : toast(done, `Could not upload ${failed.join(', ')}.`, true);
    },
    ClickedCopy: ({ text }) => ({ model, commands: [CopyText({ text })] }),
    CopiedText: () => toast(model, 'Copied.'),
    FailedCopy: () => toast(model, 'Could not copy: the browser blocked the clipboard.', true),
    ClickedEdit: ({ text }) => ({
      model: modifyFields(model, { draft: () => text }),
      commands: [FocusComposer()],
    }),
    ClickedRetry: ({ text }) => send(modifyFields(model, { draft: () => text })),
    SentMessage: ({ name }) =>
      forCurrent(model, name, () => ({
        model: modifyFields(model, { sending: () => false }),
        commands: [LoadThreads()],
      })),
    FailedSend: ({ name, text, reason }) =>
      forCurrent(model, name, () => {
        const restored = withView(
          modifyFields(model, { sending: () => false, live: () => null, draft: () => text }),
          (view) => ({
            ...view,
            busy: false,
            messages: view.messages.filter((each) => each.id !== 'pending'),
          }),
        );

        return toast(restored, `Could not send: ${reason}`, true);
      }),

    ClickedAction: ({ action }) => runAction(model, action),
    CompletedAction: ({ name, note }) =>
      withCommands(toast(modifyFields(model, { action: () => null }), note), [
        LoadView({ name, refresh: true }),
        LoadThreads(),
      ]),
    FailedAction: ({ action, reason }) => {
      const label =
        action === 'size'
          ? 'Could not change the size'
          : `${action[0]?.toUpperCase()}${action.slice(1)} failed`;

      return toast(modifyFields(model, { action: () => null }), `${label}: ${reason}`, true);
    },
    ForkedInto: ({ view }) =>
      withCommands(
        toast(modifyFields(model, { action: () => null }), `Forked into ${view.name}.`),
        [LoadThreads(), PushUrl({ url: pathForThread(view.name) })],
      ),
    PausedThread: () => ({ model }),
    PickedSize: ({ size }) => {
      const view = viewOf(model);

      if (model.name === null || view === null) return { model };

      return {
        model: modifyFields(model, { sizeMenuOpen: () => false }),
        commands: [ConfirmResize({ name: model.name, size, running: view.running })],
      };
    },
    ToggledSizeMenu: () => ({ model: modifyFields(model, { sizeMenuOpen: (open) => !open }) }),
    ClickedSize: ({ size }) => {
      const view = viewOf(model);

      if (model.name === null || view === null || view.size === size)
        return { model: modifyFields(model, { sizeMenuOpen: () => false }) };

      const started = modifyFields(model, {
        action: () => 'size' as const,
        sizeMenuOpen: () => false,
        menuOpen: () => false,
      });

      return withCommands(toast(started, `Changing the computer to ${size}…`), [
        Resize({ name: model.name, size }),
      ]);
    },
    ToggledMenu: () => ({
      model: modifyFields(model, { menuOpen: (open) => !open, sizeMenuOpen: () => false }),
    }),
    ClickedOutside: () => ({
      model: modifyFields(model, {
        sizeMenuOpen: () => false,
        addMenuOpen: () => false,
        modelMenuOpen: () => false,
        usageOpen: () => false,
      }),
    }),
    ClickedOp: ({ name, op }) => ({
      model: modifyFields(
        op._tag === 'Stop' && model.name === name
          ? withView(modifyFields(model, { live: () => null }), (view) => ({
              ...view,
              busy: false,
            }))
          : model,
        { modelMenuOpen: () => false, menuOpen: () => false, rowMenu: () => null },
      ),
      commands: [RunOp({ name, op })],
    }),
    CompletedOp: ({ name, note, gone }) => {
      const result = toast(model, note);
      const leaving = gone && model.name === name;

      return withCommands(result, [
        LoadThreads(),
        ...(leaving ? [PushUrl({ url: '/' })] : []),
        ...(!gone && model.name === name ? [LoadView({ name, refresh: true })] : []),
      ]);
    },
    FailedOp: ({ reason }) => toast(model, `Failed: ${reason}`, true),
    ToggledModelMenu: () => ({
      model: modifyFields(model, {
        modelMenuOpen: (open) => !open,
        usageOpen: () => false,
        modelQuery: () => '',
        modelIndex: () => 0,
      }),
      commands: model.modelMenuOpen ? [] : [FocusModelSearch()],
    }),
    LoadedModels: ({ models }) => ({
      model: modifyFields(model, { models: () => models }),
    }),
    UpdatedModelQuery: ({ query }) => ({
      model: modifyFields(model, { modelQuery: () => query, modelIndex: () => 0 }),
    }),
    MovedModelIndex: ({ delta }) => ({
      model: modifyFields(model, {
        modelIndex: (index) =>
          moveIndex(index, delta, pickerOptions(model.models, model.modelQuery).length),
      }),
      commands: [RevealModelOption()],
    }),
    ChoseModel: ({ name, index }) => {
      const chosen = pickerOptions(model.models, model.modelQuery)[index];
      const closed = modifyFields(model, { modelMenuOpen: () => false, modelQuery: () => '' });

      return chosen === undefined
        ? { model: closed }
        : {
            model: closed,
            commands: [RunOp({ name, op: { _tag: 'SetModel', model: chosen.id } })],
          };
    },
    ClosedModelMenu: () => ({
      model: modifyFields(model, { modelMenuOpen: () => false, modelQuery: () => '' }),
    }),
    ToggledUsage: () => ({
      model: modifyFields(model, { usageOpen: (open) => !open, modelMenuOpen: () => false }),
    }),
    PressedShortcut: ({ key }) =>
      key === 'stop'
        ? stopFromKeyboard(model)
        : {
            model: modifyFields(model, {
              palette: (open) => (open === null ? { query: '', index: 0 } : null),
            }),
            commands: [FocusPalette()],
          },
    UpdatedPalette: ({ query }) => ({
      model: modifyFields(model, { palette: () => ({ query, index: 0 }) }),
    }),
    MovedPalette: ({ delta }) => {
      if (model.palette === null) return { model };

      const count = paletteItems(model, model.palette.query).length;
      const index = count === 0 ? 0 : (model.palette.index + delta + count) % count;

      return {
        model: modifyFields(model, {
          palette: () => ({ query: model.palette?.query ?? '', index }),
        }),
      };
    },
    ChosePalette: ({ index }) => {
      const chosen =
        model.palette === null ? undefined : paletteItems(model, model.palette.query)[index];
      const closed = modifyFields(model, { palette: () => null });

      return chosen === undefined ? { model: closed } : update(closed, chosen.message);
    },
    ClosedPalette: () => ({ model: modifyFields(model, { palette: () => null }) }),
    ClickedKillLoops: () => ({ model, commands: [KillLoops()] }),
    KilledLoops: ({ names }) =>
      withCommands(
        toast(
          model,
          names.length === 0
            ? 'No loops were running.'
            : `Stopped ${names.length} loop${names.length === 1 ? '' : 's'}: ${names.join(', ')}.`,
        ),
        [LoadThreads()],
      ),
    ToggledArchived: () => ({ model: modifyFields(model, { showArchived: (on) => !on }) }),
    UpdatedListFilter: ({ value }) => ({ model: modifyFields(model, { listFilter: () => value }) }),
    ToggledRowMenu: ({ name }) => ({
      model: modifyFields(model, { rowMenu: (open) => (open === name ? null : name) }),
    }),

    ClickedTab: ({ tab }) => selectTab(model, tab),
    ToggledAddMenu: () => ({ model: modifyFields(model, { addMenuOpen: (open) => !open }) }),
    ClickedAddSurface: ({ kind }) =>
      model.name === null
        ? { model }
        : {
            model: modifyFields(model, { addMenuOpen: () => false }),
            commands: [AddSurface({ name: model.name, kind })],
          },
    ChangedSurfaces: ({ name, surfaces }) =>
      forCurrent(model, name, () => ({
        model: ensureTab(withView(model, (view) => ({ ...view, surfaces }))),
      })),
    AddedSurface: ({ name, kind, surfaces }) =>
      forCurrent(model, name, () => {
        const made =
          kind === 'browser'
            ? surfaces.find((surface) => surface.kind === 'browser')
            : surfaces.at(-1);
        const next = withView(model, (view) => ({ ...view, surfaces }));

        return {
          model: made === undefined ? ensureTab(next) : modifyFields(next, { tab: () => made.id }),
        };
      }),
    ClickedCloseSurface: ({ id }) =>
      model.name === null
        ? { model }
        : { model, commands: [CloseSurface({ name: model.name, id })] },
    FailedSurface: ({ reason }) => toast(model, reason, true),

    ClickedDir: ({ path }) =>
      model.name === null
        ? { model }
        : {
            model: modifyFields(model, {
              dirPath: () => path,
              entries: () => ({ _tag: 'Loading' as const }),
              file: () => FileView.Closed(),
            }),
            commands: [LoadDir({ name: model.name, path })],
          },
    LoadedDir: ({ name, path, entries }) =>
      forCurrent(model, name, () =>
        path === model.dirPath
          ? {
              model: modifyFields(model, {
                entries: () => ({ _tag: 'Ready' as const, value: entries }),
              }),
            }
          : { model },
      ),
    ClickedFile: ({ path }) =>
      model.name === null
        ? { model }
        : {
            model: modifyFields(model, { file: () => FileView.Loading({ path }) }),
            commands: [LoadFile({ name: model.name, path })],
          },
    LoadedFile: ({ name, path, text }) =>
      forCurrent(model, name, () => ({
        model: modifyFields(model, { file: () => FileView.Loaded({ path, text }) }),
      })),
    FailedFiles: ({ name, reason }) =>
      forCurrent(model, name, () => ({
        model: modifyFields(model, {
          entries: () => ({ _tag: 'Failed' as const, reason }),
          file: () => FileView.Closed(),
        }),
      })),
    ClosedFile: () => ({ model: modifyFields(model, { file: () => FileView.Closed() }) }),

    OpenedDrawer: ({ drawer }) => ({
      model: modifyFields(model, { drawer: () => drawer, menuOpen: () => false }),
    }),
    ClosedDrawer: () => ({ model: modifyFields(model, { drawer: () => 'none' as const }) }),

    ClickedNewThread: () => ({
      model: modifyFields(model, {
        newThread: (form) => ({ ...form, open: true }),
        drawer: () => 'none' as const,
      }),
    }),
    ClosedNewThread: () => ({
      model: modifyFields(model, { newThread: (form) => ({ ...form, open: false }) }),
    }),
    UpdatedNewRepo: ({ value }) => ({
      model: modifyFields(model, { newThread: (form) => ({ ...form, repo: value }) }),
    }),
    UpdatedNewTitle: ({ value }) => ({
      model: modifyFields(model, { newThread: (form) => ({ ...form, title: value }) }),
    }),
    UpdatedNewSize: ({ value }) =>
      isSize(value)
        ? { model: modifyFields(model, { newThread: (form) => ({ ...form, size: value }) }) }
        : { model },
    SubmittedNewThread: () =>
      model.newThread.creating
        ? { model }
        : {
            model: modifyFields(model, { newThread: (form) => ({ ...form, creating: true }) }),
            commands: [
              CreateThread({
                repo: model.newThread.repo.trim(),
                title: model.newThread.title.trim(),
                size: model.newThread.size,
              }),
            ],
          },
    CreatedThread: ({ view }) => ({
      model: modifyFields(model, {
        newThread: (form) => ({ ...form, open: false, creating: false, repo: '', title: '' }),
      }),
      commands: [LoadThreads(), PushUrl({ url: pathForThread(view.name) })],
    }),
    FailedCreate: ({ reason }) =>
      toast(
        modifyFields(model, { newThread: (form) => ({ ...form, creating: false }) }),
        `Could not create the thread: ${reason}`,
        true,
      ),

    ExpiredToast: ({ id }) => ({
      model: modifyFields(model, { toasts: (toasts) => toasts.filter((each) => each.id !== id) }),
    }),
    ChangedOnline: ({ online }) => {
      const next = modifyFields(model, { online: () => online });

      if (!online) return { model: next };

      const commands: AnyCommand[] = [LoadThreads()];

      if (model.name !== null) commands.push(LoadView({ name: model.name, refresh: true }));

      return { model: modifyFields(next, { streamEpoch: (epoch) => epoch + 1 }), commands };
    },
    ClickedTheme: () => ({ model, commands: [SaveTheme({ theme: nextTheme(model) })] }),
    AppliedTheme: ({ theme }) => ({ model: modifyFields(model, { theme: () => theme }) }),
    BecameInstallable: ({ installable }) => ({
      model: modifyFields(model, { installable: () => installable }),
    }),
    ClickedInstall: () => ({ model, commands: [Install()] }),
    CompletedEffect: () => ({ model }),
  });
