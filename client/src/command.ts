import { Duration, Effect, Schema } from 'effect';
import { Command, Navigation } from 'foldkit';
import { type CoilError, Size, SurfaceKind } from '../../shared/protocol';
import { pinToBottom } from './follow';
import { Message } from './message';
import { Action, Theme, ThreadOp } from './model';
import { CoilClient, type RpcClientError } from './rpc';

export const reasonOf = (error: CoilError | RpcClientError): string => {
  switch (error._tag) {
    case 'UnknownThread':
      return `unknown thread ${error.name}`;
    case 'NameTaken':
      return `The name ${error.name} is taken`;
    case 'RpcClientError':
      return `could not reach coil (${error.message})`;
    default:
      return error.reason;
  }
};

export const LoadWho = Command.define('LoadWho', {
  messages: [Message.LoadedWho],
  execute: Effect.gen(function* () {
    const client = yield* CoilClient;
    const { who } = yield* client.WhoAmI();

    return Message.LoadedWho({ who });
  }).pipe(Effect.orElseSucceed(() => Message.LoadedWho({ who: '' }))),
});

const AccountInfo = Schema.Struct({
  signedIn: Schema.Boolean,
  account: Schema.optional(Schema.NullOr(Schema.String)),
  gateway: Schema.optional(Schema.NullOr(Schema.String)),
});

export const LoadAccount = Command.define('LoadAccount', {
  messages: [Message.LoadedAccount],
  execute: Effect.tryPromise(() =>
    fetch('/oauth/me', { credentials: 'same-origin' }).then((r) => r.json()),
  ).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(AccountInfo)),
    Effect.map((info) =>
      Message.LoadedAccount({ account: info.account ?? null, gateway: info.gateway ?? null }),
    ),
    Effect.orElseSucceed(() => Message.LoadedAccount({ account: null, gateway: null })),
  ),
});

export const LoadModels = Command.define('LoadModels', {
  messages: [Message.LoadedModels, Message.CompletedEffect],
  execute: Effect.gen(function* () {
    const client = yield* CoilClient;

    return Message.LoadedModels({ models: yield* client.Models() });
  }).pipe(Effect.orElseSucceed(() => Message.CompletedEffect())),
});

export const CopyText = Command.define('CopyText', {
  args: { text: Schema.String },
  messages: [Message.CopiedText, Message.FailedCopy],
  execute: ({ text }) =>
    Effect.tryPromise(() => navigator.clipboard.writeText(text)).pipe(
      Effect.as(Message.CopiedText()),
      Effect.orElseSucceed(() => Message.FailedCopy()),
    ),
});

export const JumpToLatest = Command.define('JumpToLatest', {
  messages: [Message.CompletedEffect],
  execute: Effect.sync(() => {
    const feed = document.querySelector('#feed');

    if (feed !== null) pinToBottom(feed);

    return Message.CompletedEffect();
  }),
});

export const FocusModelSearch = Command.define('FocusModelSearch', {
  messages: [Message.CompletedEffect],
  execute: Effect.sync(() => {
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#model-search')?.focus());

    return Message.CompletedEffect();
  }),
});

export const RevealModelOption = Command.define('RevealModelOption', {
  messages: [Message.CompletedEffect],
  execute: Effect.sync(() => {
    requestAnimationFrame(() =>
      document
        .querySelector('#model-options [aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' }),
    );

    return Message.CompletedEffect();
  }),
});

export const LoadSpend = Command.define('LoadSpend', {
  messages: [Message.LoadedSpend, Message.CompletedEffect],
  execute: Effect.gen(function* () {
    const client = yield* CoilClient;

    return Message.LoadedSpend(yield* client.GetSpend());
  }).pipe(Effect.orElseSucceed(() => Message.CompletedEffect())),
});

export const parseLimit = (raw: string | null): number | null | 'cancel' | 'invalid' => {
  if (raw === null) return 'cancel';

  const text = raw.trim().replace(/^\$/, '');

  if (text === '' || /^(none|no|off|0)$/i.test(text)) return null;

  const dollars = Number(text);

  return Number.isFinite(dollars) && dollars > 0 ? dollars : 'invalid';
};

export const EditSpendLimit = Command.define('EditSpendLimit', {
  args: { current: Schema.NullOr(Schema.Number), spent: Schema.Number },
  messages: [Message.LoadedSpend, Message.FailedOp, Message.CompletedEffect],
  execute: ({ current, spent }) =>
    Effect.gen(function* () {
      const answer = parseLimit(
        globalThis.prompt(
          `You have spent $${spent.toFixed(2)} across all your threads.\nSet a spend limit in dollars. New turns stop when you reach it. Leave empty for no limit.`,
          current === null ? '' : String(current),
        ),
      );

      if (answer === 'cancel') return Message.CompletedEffect();
      if (answer === 'invalid')
        return Message.FailedOp({
          name: '',
          reason: 'Enter a dollar amount, like 50, or leave it empty for no limit.',
        });

      const client = yield* CoilClient;

      return Message.LoadedSpend(yield* client.SetSpendLimit({ dollars: answer }));
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedOp({ name: '', reason: reasonOf(error) })),
      ),
    ),
});

export const LoadThreads = Command.define('LoadThreads', {
  messages: [Message.LoadedThreads, Message.FailedThreads],
  execute: Effect.gen(function* () {
    const client = yield* CoilClient;

    return Message.LoadedThreads({ threads: yield* client.ListThreads() });
  }).pipe(
    Effect.catch((error) => Effect.succeed(Message.FailedThreads({ reason: reasonOf(error) }))),
  ),
});

export const LoadView = Command.define('LoadView', {
  args: { name: Schema.String, refresh: Schema.Boolean },
  messages: [Message.LoadedView, Message.RefreshedView, Message.FailedView],
  execute: ({ name, refresh }) =>
    Effect.gen(function* () {
      const client = yield* CoilClient;
      const view = yield* client.ViewThread({ name });

      return refresh ? Message.RefreshedView({ name, view }) : Message.LoadedView({ name, view });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedView({ name, reason: reasonOf(error) })),
      ),
    ),
});

export const RefreshViewSoon = Command.define('RefreshViewSoon', {
  args: { name: Schema.String },
  messages: [Message.RefreshedView, Message.FailedView],
  interrupt: true,
  execute: ({ name }) =>
    Effect.gen(function* () {
      yield* Effect.sleep(Duration.millis(300));

      const client = yield* CoilClient;

      return Message.RefreshedView({ name, view: yield* client.ViewThread({ name }) });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedView({ name, reason: reasonOf(error) })),
      ),
    ),
});

export const SendMessage = Command.define('SendMessage', {
  args: { name: Schema.String, text: Schema.String },
  messages: [Message.SentMessage, Message.FailedSend],
  execute: ({ name, text }) =>
    Effect.gen(function* () {
      const client = yield* CoilClient;

      yield* client.StartMessage({ name, text, requestId: crypto.randomUUID() });

      return Message.SentMessage({ name });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedSend({ name, text, reason: reasonOf(error) })),
      ),
    ),
});

export const RunAction = Command.define('RunAction', {
  args: { name: Schema.String, action: Action },
  messages: [Message.CompletedAction, Message.FailedAction, Message.ForkedInto],
  execute: ({ name, action }) =>
    Effect.gen(function* () {
      const client = yield* CoilClient;

      if (action === 'fork') return Message.ForkedInto({ view: yield* client.Fork({ name }) });

      if (action === 'compact') {
        yield* client.Compact({ name });

        return Message.CompletedAction({
          name,
          action,
          note: 'Compacted. Summary and disk saved together.',
        });
      }

      yield* client.Pause({ name });

      return Message.CompletedAction({
        name,
        action,
        note: 'Paused. The disk is saved and the computer is off.',
      });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedAction({ name, action, reason: reasonOf(error) })),
      ),
    ),
});

export const Resize = Command.define('Resize', {
  args: { name: Schema.String, size: Size },
  messages: [Message.CompletedAction, Message.FailedAction],
  execute: ({ name, size }) =>
    Effect.gen(function* () {
      const client = yield* CoilClient;
      const result = yield* client.Resize({ name, size });
      const note = result.restarted
        ? `Restarted at ${size}. The disk was kept.`
        : `The computer will start at ${size}.`;

      return Message.CompletedAction({ name, action: 'size', note });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedAction({ name, action: 'size', reason: reasonOf(error) })),
      ),
    ),
});

export const AddSurface = Command.define('AddSurface', {
  args: { name: Schema.String, kind: SurfaceKind },
  messages: [Message.AddedSurface, Message.FailedSurface],
  execute: ({ name, kind }) =>
    Effect.gen(function* () {
      const client = yield* CoilClient;

      return Message.AddedSurface({
        name,
        kind,
        surfaces: yield* client.AddSurface({ name, kind }),
      });
    }).pipe(
      Effect.catch((error) => Effect.succeed(Message.FailedSurface({ reason: reasonOf(error) }))),
    ),
});

export const CloseSurface = Command.define('CloseSurface', {
  args: { name: Schema.String, id: Schema.String },
  messages: [Message.ChangedSurfaces, Message.FailedSurface],
  execute: ({ name, id }) =>
    Effect.gen(function* () {
      const client = yield* CoilClient;

      return Message.ChangedSurfaces({ name, surfaces: yield* client.CloseSurface({ name, id }) });
    }).pipe(
      Effect.catch((error) => Effect.succeed(Message.FailedSurface({ reason: reasonOf(error) }))),
    ),
});

export const LoadDir = Command.define('LoadDir', {
  args: { name: Schema.String, path: Schema.String },
  messages: [Message.LoadedDir, Message.FailedFiles],
  execute: ({ name, path }) =>
    Effect.gen(function* () {
      const client = yield* CoilClient;

      return Message.LoadedDir({ name, path, entries: yield* client.ListDir({ name, path }) });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedFiles({ name, reason: reasonOf(error) })),
      ),
    ),
});

export const LoadFile = Command.define('LoadFile', {
  args: { name: Schema.String, path: Schema.String },
  messages: [Message.LoadedFile, Message.FailedFiles],
  execute: ({ name, path }) =>
    Effect.gen(function* () {
      const client = yield* CoilClient;

      return Message.LoadedFile({ name, path, text: yield* client.ReadFile({ name, path }) });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedFiles({ name, reason: reasonOf(error) })),
      ),
    ),
});

export const CreateThread = Command.define('CreateThread', {
  args: { repo: Schema.String, title: Schema.String, size: Size },
  messages: [Message.CreatedThread, Message.FailedCreate],
  execute: ({ repo, title, size }) =>
    Effect.gen(function* () {
      const client = yield* CoilClient;
      const view = yield* client.CreateThread({
        repo: repo === '' ? null : repo,
        title: title === '' ? undefined : title,
        size,
      });

      return Message.CreatedThread({ view });
    }).pipe(
      Effect.catch((error) => Effect.succeed(Message.FailedCreate({ reason: reasonOf(error) }))),
    ),
});

export const PushUrl = Command.define('PushUrl', {
  args: { url: Schema.String },
  messages: [Message.CompletedEffect],
  execute: ({ url }) =>
    Effect.gen(function* () {
      if (globalThis.location.pathname !== url) yield* Navigation.pushUrl(url);

      return Message.CompletedEffect();
    }),
});

export const ExpireToast = Command.define('ExpireToast', {
  args: { id: Schema.Number, bad: Schema.Boolean },
  messages: [Message.ExpiredToast],
  execute: ({ id, bad }) =>
    Effect.sleep(Duration.millis(bad ? 6000 : 2500)).pipe(Effect.as(Message.ExpiredToast({ id }))),
});

const THEME_KEY = 'coil-theme';

export const SaveTheme = Command.define('SaveTheme', {
  args: { theme: Theme },
  messages: [Message.AppliedTheme],
  execute: ({ theme }) =>
    Effect.sync(() => {
      const root = globalThis.document.documentElement;

      if (theme === 'system') delete root.dataset.theme;
      else root.dataset.theme = theme;

      Effect.runSync(
        Effect.try(() => globalThis.localStorage.setItem(THEME_KEY, theme)).pipe(Effect.ignore),
      );

      return Message.AppliedTheme({ theme });
    }),
});

export const storedTheme = (): Theme => {
  const value = Effect.runSync(
    Effect.try(() => globalThis.localStorage.getItem(THEME_KEY)).pipe(
      Effect.orElseSucceed(() => null),
    ),
  );

  return value === 'light' || value === 'dark' ? value : 'system';
};

const draftKey = (thread: string) => `coil-draft:${thread}`;

export const storedDraft = (thread: string): string =>
  Effect.runSync(
    Effect.try(() => globalThis.localStorage.getItem(draftKey(thread)) ?? '').pipe(
      Effect.orElseSucceed(() => ''),
    ),
  );

export const SaveDraft = Command.define('SaveDraft', {
  args: { thread: Schema.String, draft: Schema.String },
  messages: [Message.CompletedEffect],
  execute: ({ thread, draft }) =>
    Effect.try(() =>
      draft === ''
        ? globalThis.localStorage.removeItem(draftKey(thread))
        : globalThis.localStorage.setItem(draftKey(thread), draft),
    ).pipe(Effect.ignore, Effect.as(Message.CompletedEffect())),
});

export const systemIsDark = () =>
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

type InstallPrompt = { prompt: () => Promise<void> };

let installPrompt: InstallPrompt | null = null;

export const rememberInstallPrompt = (prompt: InstallPrompt | null) => {
  installPrompt = prompt;
};

export const Install = Command.define('Install', {
  messages: [Message.BecameInstallable],
  execute: Effect.promise(async () => {
    await installPrompt?.prompt();
    installPrompt = null;

    return Message.BecameInstallable({ installable: false });
  }),
});

export const ConfirmResize = Command.define('ConfirmResize', {
  args: { name: Schema.String, size: Size, running: Schema.Boolean },
  messages: [Message.ClickedSize, Message.CompletedEffect],
  execute: ({ size, running }) =>
    Effect.sync(() =>
      !running ||
      globalThis.confirm(
        `Restart the computer at ${size}? The disk is saved first; running programs stop.`,
      )
        ? Message.ClickedSize({ size })
        : Message.CompletedEffect(),
    ),
});

const askTitle = (name: string) =>
  Effect.sync(() => globalThis.prompt('New title for this thread', name)?.trim() ?? '');

export const RunOp = Command.define('RunOp', {
  args: { name: Schema.String, op: ThreadOp },
  messages: [Message.CompletedOp, Message.FailedOp, Message.CompletedEffect],
  execute: ({ name, op }) =>
    Effect.gen(function* () {
      const client = yield* CoilClient;
      const done = (note: string, gone = false) => Message.CompletedOp({ name, note, gone });

      switch (op._tag) {
        case 'Stop':
          yield* client.Stop({ name });
          return done('Stopped.');
        case 'SetModel':
          yield* client.SetModel({ name, model: op.model });
          return done(`Model set to ${op.model.split('/').pop()}.`);
        case 'Rename': {
          const title = yield* askTitle(name);

          if (title === '') return Message.CompletedEffect();
          yield* client.Rename({ name, title });
          return done(`Renamed to ${title}.`);
        }
        case 'Archive':
          yield* client.Archive({ name, archived: op.archived });
          return done(op.archived ? 'Archived.' : 'Restored.');
        case 'Share': {
          const { path } = yield* client.Share({ name });
          const url = `${globalThis.location.origin}${path}`;

          yield* Effect.promise(
            () => navigator.clipboard?.writeText(url).catch(() => undefined) ?? Promise.resolve(),
          );

          return done(
            `Share link copied: ${url}. Only people your Access policy allows can open it.`,
          );
        }
        case 'Delete': {
          const sure = yield* Effect.sync(() =>
            globalThis.confirm(`Delete ${name}? Its computer, disk and chat are removed for good.`),
          );

          if (!sure) return Message.CompletedEffect();
          yield* client.DeleteThread({ name });
          return done(`Deleted ${name}.`, true);
        }
      }
    }).pipe(
      Effect.catch((error) => Effect.succeed(Message.FailedOp({ name, reason: reasonOf(error) }))),
    ),
});

export const FocusComposer = Command.define('FocusComposer', {
  messages: [Message.CompletedEffect],
  execute: Effect.sync(() => {
    const box = document.querySelector<HTMLTextAreaElement>('#text');

    box?.focus();
    box?.setSelectionRange(box.value.length, box.value.length);

    return Message.CompletedEffect();
  }),
});

export const FocusPalette = Command.define('FocusPalette', {
  messages: [Message.CompletedEffect],
  execute: Effect.sync(() => {
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('#palette-input')?.focus(),
    );

    return Message.CompletedEffect();
  }),
});

const pendingFiles: File[] = [];

export const rememberFiles = (files: readonly File[]) => {
  pendingFiles.push(...files);
};

const safeName = (name: string) =>
  name
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 120) || 'file';

export const UploadFiles = Command.define('UploadFiles', {
  args: { name: Schema.String },
  messages: [Message.UploadedFiles],
  execute: ({ name }) =>
    Effect.promise(async () => {
      const files = pendingFiles.splice(0);
      const paths: string[] = [];
      const failed: string[] = [];

      for (const file of files) {
        const response = await fetch(
          `/api/threads/${name}/upload?file=${encodeURIComponent(safeName(file.name))}`,
          { method: 'PUT', body: file },
        ).catch(() => null);
        const body = response?.ok ? ((await response.json()) as { path?: string }) : null;

        if (typeof body?.path === 'string') paths.push(body.path);
        else failed.push(file.name);
      }

      return Message.UploadedFiles({ name, paths, failed });
    }),
});

export const KillLoops = Command.define('KillLoops', {
  messages: [Message.KilledLoops, Message.FailedOp],
  execute: Effect.gen(function* () {
    const client = yield* CoilClient;

    return Message.KilledLoops({ names: yield* client.StopAllLoops() });
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(Message.FailedOp({ name: '', reason: reasonOf(error) })),
    ),
  ),
});

type Permission = 'unsupported' | 'default' | 'granted' | 'denied';

export const notifyPermission = (): Permission =>
  typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as Permission);

export const AskNotify = Command.define('AskNotify', {
  messages: [Message.ChangedNotify],
  execute: Effect.promise(async () => {
    if (typeof Notification === 'undefined')
      return Message.ChangedNotify({ permission: 'unsupported' });

    const permission = (await Notification.requestPermission()) as Permission;

    return Message.ChangedNotify({ permission });
  }),
});

export const ShowNotifications = Command.define('ShowNotifications', {
  args: {
    items: Schema.Array(
      Schema.Struct({ name: Schema.String, title: Schema.String, why: Schema.String }),
    ),
  },
  messages: [Message.CompletedEffect],
  execute: ({ items }) =>
    Effect.promise(async () => {
      if (notifyPermission() !== 'granted' || !document.hidden) return Message.CompletedEffect();

      const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);

      for (const item of items) {
        const body =
          item.why === 'loop'
            ? 'Loop finished. Open it for the digest.'
            : 'The agent finished its turn.';
        const options = {
          body,
          tag: `coil-${item.name}`,
          data: { url: `/t/${item.name}` },
          icon: '/icons/icon-192.png',
        };

        if (registration !== undefined)
          await registration.showNotification(item.title || item.name, options);
        else new Notification(item.title || item.name, options);
      }

      return Message.CompletedEffect();
    }),
});
