import { Duration, Effect, Option, Queue, Schema, Stream } from 'effect';
import { Subscription } from 'foldkit';
import { eventsPath, LiveEvent } from '../../shared/protocol';
import { rememberInstallPrompt } from './command';
import { Message } from './message';
import type { Model } from './model';
import type { CoilClient } from './rpc';

const THREAD_REFRESH = Duration.seconds(10);
export const MAX_RECONNECTS = 5;
const reconnectDelay = (epoch: number) =>
  Duration.millis(epoch === 0 ? 0 : Math.min(8000, 500 * 2 ** Math.min(epoch, 4)));
const TURN_TICK = Duration.seconds(1);

const decodeEvent = Schema.decodeUnknownOption(Schema.fromJsonString(LiveEvent));

const legacyToTagged = (raw: string): string => {
  const parsed = Effect.runSync(
    Effect.try(() => JSON.parse(raw) as unknown).pipe(Effect.orElseSucceed(() => null)),
  );

  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return raw;

  const { type, ...rest } = parsed as { type: string };

  return JSON.stringify({ _tag: type, ...rest });
};

const events = (name: string): Stream.Stream<Message> =>
  Stream.callback<Message>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const source = new EventSource(eventsPath(name));

        source.onopen = () => Queue.offerUnsafe(queue, Message.StreamOpened({ name }));
        source.onmessage = (incoming: MessageEvent<string>) => {
          Option.map(decodeEvent(legacyToTagged(incoming.data)), (event) =>
            Queue.offerUnsafe(queue, Message.ReceivedEvent({ name, event })),
          );
        };
        source.onerror = () => {
          source.close();
          Queue.offerUnsafe(queue, Message.StreamClosed({ name }));
        };

        return source;
      }),
      (source) => Effect.sync(() => source.close()),
    ).pipe(Effect.andThen(Effect.never)),
  );

const windowEvent = <A>(type: string, toMessage: (event: Event) => A): Stream.Stream<A> =>
  Stream.callback<A>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const listener = (event: Event) => Queue.offerUnsafe(queue, toMessage(event));

        globalThis.addEventListener(type, listener);

        return listener;
      }),
      (listener) => Effect.sync(() => globalThis.removeEventListener(type, listener)),
    ).pipe(Effect.andThen(Effect.never)),
  );

const installPrompts = windowEvent('beforeinstallprompt', (event) => {
  event.preventDefault();
  rememberInstallPrompt(event as unknown as { prompt: () => Promise<void> });

  return Message.BecameInstallable({ installable: true });
});

const installed = windowEvent('appinstalled', () => {
  rememberInstallPrompt(null);

  return Message.BecameInstallable({ installable: false });
});

const shortcuts = windowEvent('keydown', (event) => {
  const key = event as KeyboardEvent;

  if ((key.metaKey || key.ctrlKey) && key.key.toLowerCase() === 'k') {
    key.preventDefault();

    return Message.PressedShortcut({ key: 'palette' });
  }

  if ((key.metaKey || key.ctrlKey) && key.shiftKey && key.key.toLowerCase() === 'n') {
    key.preventDefault();

    return Message.ClickedNotify();
  }

  if (key.key === 'Escape' && !key.defaultPrevented)
    return Message.PressedShortcut({ key: 'stop' });

  return Message.CompletedEffect();
});

const now = Effect.clockWith((clock) => clock.currentTimeMillis);

const outsideClicks = Stream.callback<Message>((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const listener = (event: MouseEvent) => {
        const target = event.target;

        if (target instanceof Element && target.closest('[data-popover]') !== null) return;

        Queue.offerUnsafe(queue, Message.ClickedOutside());
      };

      globalThis.document.addEventListener('click', listener);

      return listener;
    }),
    (listener) => Effect.sync(() => globalThis.document.removeEventListener('click', listener)),
  ).pipe(Effect.andThen(Effect.never)),
);

export const subscriptions = Subscription.make<Model, Message, CoilClient>()((entry) => ({
  events: entry(
    { name: Schema.NullOr(Schema.String), epoch: Schema.Number },
    {
      modelToDependencies: (model) => ({
        name: model.reconnects > MAX_RECONNECTS ? null : model.name,
        epoch: model.streamEpoch,
      }),
      dependenciesToStream: ({ name, epoch }) =>
        name === null
          ? Stream.empty
          : Stream.fromEffect(Effect.sleep(reconnectDelay(epoch))).pipe(
              Stream.flatMap(() => events(name)),
            ),
    },
  ),
  clock: entry(
    { on: Schema.Boolean },
    {
      modelToDependencies: () => ({ on: true }),
      dependenciesToStream: () =>
        Stream.tick(THREAD_REFRESH).pipe(
          Stream.drop(1),
          Stream.mapEffect(() => now),
          Stream.map((at) => Message.Ticked({ now: at })),
        ),
    },
  ),
  turnClock: entry(
    { working: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        working: model.live !== null || (model.view._tag === 'Ready' && model.view.value.busy),
      }),
      dependenciesToStream: ({ working }) =>
        working
          ? Stream.tick(TURN_TICK).pipe(
              Stream.mapEffect(() => now),
              Stream.map((at) => Message.TickedTurn({ now: at })),
            )
          : Stream.empty,
    },
  ),
  online: entry(
    { on: Schema.Boolean },
    {
      modelToDependencies: () => ({ on: true }),
      dependenciesToStream: () =>
        Stream.merge(
          windowEvent('online', () => Message.ChangedOnline({ online: true })),
          windowEvent('offline', () => Message.ChangedOnline({ online: false })),
        ),
    },
  ),
  keys: entry(
    { on: Schema.Boolean },
    { modelToDependencies: () => ({ on: true }), dependenciesToStream: () => shortcuts },
  ),
  install: entry(
    { on: Schema.Boolean },
    {
      modelToDependencies: () => ({ on: true }),
      dependenciesToStream: () => Stream.merge(installPrompts, installed),
    },
  ),
  outside: entry(
    { open: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        open: model.sizeMenuOpen || model.addMenuOpen || model.modelMenuOpen || model.usageOpen,
      }),
      dependenciesToStream: ({ open }) => (open ? outsideClicks : Stream.empty),
    },
  ),
}));
