import { Effect, Option, Schema } from 'effect';
import { Runtime, Url } from 'foldkit';
import { storedTheme } from './command';
import { installLayout } from './layout';
import { Flags, init } from './main';
import { Message } from './message';
import { Model, SettingsSection } from './model';
import { isAppPath, threadFromPath } from './route';
import { CoilClientLive } from './rpc';
import { keepShellCurrent } from './shell-update';
import { subscriptions } from './subscriptions';
import { update } from './update';
import { view } from './view';

const NEW_THREAD_QUERY = 'new';
const SETTINGS_QUERY = 'settings';
const CONNECTOR_ERROR_QUERY = 'connector_error';

const settingsSectionFrom = (value: string | null) =>
  value !== null && Schema.is(SettingsSection)(value) ? value : null;

const flags = Effect.sync(() => {
  const params = new URLSearchParams(globalThis.location.search);
  const openNew = params.get(NEW_THREAD_QUERY) === '1';
  const openSettings = settingsSectionFrom(params.get(SETTINGS_QUERY));
  const connectorProblem = params.get(CONNECTOR_ERROR_QUERY);

  if (openNew) globalThis.history.replaceState({}, '', '/');
  else if (openSettings !== null || connectorProblem !== null)
    globalThis.history.replaceState({}, '', globalThis.location.pathname);

  return {
    name: threadFromPath(globalThis.location.pathname),
    now: Date.now(),
    online: globalThis.navigator.onLine,
    theme: storedTheme(),
    openNew,
    openSettings,
    connectorProblem,
  };
});

const application = Runtime.makeApplication({
  Model,
  Flags,
  init,
  update,
  view,
  subscriptions,
  routing: {
    onUrlRequest: (request) => {
      if (request._tag === 'Internal' && isAppPath(request.url.pathname))
        return Message.NavigatedTo({ name: threadFromPath(request.url.pathname) });
      if (request._tag === 'Internal') return Message.LeftApp({ href: Url.toString(request.url) });

      return Message.LeftApp({ href: request.href });
    },
    onUrlChange: (url) => Message.NavigatedTo({ name: threadFromPath(url.pathname) }),
  },
  resources: CoilClientLive,
  container: document.getElementById('root'),
  devTools: false,
  crash: {
    report: ({ error, message }) => {
      const body = JSON.stringify({
        error: error.message,
        stack: (error.stack ?? '').split('\n').slice(0, 12).join('\n'),
        message: Option.match(message, { onNone: () => null, onSome: (each) => each._tag }),
        agent: navigator.userAgent,
        path: globalThis.location.pathname,
      });

      navigator.sendBeacon('/api/crash', new Blob([body], { type: 'application/json' }));
    },
  },
});

installLayout();
Runtime.run(application, { flags });

if ('serviceWorker' in navigator && globalThis.location.protocol === 'https:')
  keepShellCurrent(navigator.serviceWorker);
