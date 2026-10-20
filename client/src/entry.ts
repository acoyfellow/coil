import { Effect } from 'effect';
import { Runtime, Url } from 'foldkit';
import { storedTheme } from './command';
import { installLayout } from './layout';
import { Flags, init } from './main';
import { Message } from './message';
import { Model } from './model';
import { isAppPath, threadFromPath } from './route';
import { CoilClientLive } from './rpc';
import { keepShellCurrent } from './shell-update';
import { subscriptions } from './subscriptions';
import { update } from './update';
import { view } from './view';

const NEW_THREAD_QUERY = 'new';

const flags = Effect.sync(() => {
  const params = new URLSearchParams(globalThis.location.search);
  const openNew = params.get(NEW_THREAD_QUERY) === '1';

  if (openNew) globalThis.history.replaceState({}, '', '/');

  return {
    name: threadFromPath(globalThis.location.pathname),
    now: Date.now(),
    online: globalThis.navigator.onLine,
    theme: storedTheme(),
    openNew,
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
});

installLayout();
Runtime.run(application, { flags });

if ('serviceWorker' in navigator && globalThis.location.protocol === 'https:')
  keepShellCurrent(navigator.serviceWorker);
