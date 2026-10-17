import { Effect, Queue, Schema, Stream } from 'effect';
import { Mount } from 'foldkit';
import { attachFollow, followNewContent, pinToBottom } from './follow';
import { Message } from './message';
import { attachBrowser } from './surfaces/browser';
import { attachTerminal } from './surfaces/terminal';

const hold = <A>(
  attach: (element: HTMLElement, emit: (message: A) => void) => () => void,
  element: Element,
) =>
  Stream.callback<A>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        element instanceof HTMLElement
          ? attach(element, (message) => Queue.offerUnsafe(queue, message))
          : () => undefined,
      ),
      (detach) => Effect.sync(detach),
    ).pipe(Effect.andThen(Effect.never)),
  );

export const TerminalSurface = Mount.defineStream('TerminalSurface', {
  args: { thread: Schema.String, id: Schema.String },
  messages: [Message.CompletedEffect],
  execute: ({ element, thread, id }) =>
    hold(() => attachTerminal(element as HTMLElement, thread, id), element),
});

export const BrowserSurface = Mount.defineStream('BrowserSurface', {
  args: { thread: Schema.String },
  messages: [Message.FailedSurface],
  execute: ({ element, thread }) =>
    hold<typeof Message.FailedSurface.Type>(
      (host, emit) =>
        attachBrowser(host, thread, (reason) => emit(Message.FailedSurface({ reason }))),
      element,
    ),
});

const fitToContent = (field: HTMLTextAreaElement) => () => {
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
};

const IME_PROCESS_KEY = 229;

const holdEnterWhileComposing = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && (event.isComposing || event.keyCode === IME_PROCESS_KEY))
    event.stopImmediatePropagation();
};

const attachAutosize = (host: HTMLElement) => {
  const field = host as HTMLTextAreaElement;
  const fit = fitToContent(field);
  const observer = new ResizeObserver(fit);

  field.addEventListener('input', fit);
  field.addEventListener('keydown', holdEnterWhileComposing, { capture: true });
  observer.observe(field.parentElement ?? field);
  fit();
  if (globalThis.matchMedia?.('(pointer: fine)').matches ?? true) field.focus();

  return () => {
    field.removeEventListener('input', fit);
    field.removeEventListener('keydown', holdEnterWhileComposing, { capture: true });
    observer.disconnect();
  };
};

export const Autosize = Mount.defineStream('Autosize', {
  args: {},
  messages: [Message.CompletedEffect],
  execute: ({ element }) => hold(() => attachAutosize(element as HTMLElement), element),
});

export const ScrollToEnd = Mount.define('ScrollToEnd', {
  args: { key: Schema.String, pin: Schema.Boolean },
  messages: [Message.CompletedEffect],
  execute: ({ element, pin }) =>
    Effect.sync(() => {
      const feed = element.closest('.feed');

      if (feed !== null) (pin ? pinToBottom : followNewContent)(feed);

      return Message.CompletedEffect();
    }),
});

export const FollowFeed = Mount.defineStream('FollowFeed', {
  args: {},
  messages: [Message.CompletedEffect],
  execute: ({ element }) => hold(() => attachFollow(element as HTMLElement), element),
});
