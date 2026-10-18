import { Effect, Queue, Schema, Stream } from 'effect';
import { Mount } from 'foldkit';
import { rememberFiles } from './command';
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

const pastedFiles = (event: ClipboardEvent): File[] =>
  [...(event.clipboardData?.items ?? [])]
    .filter((item) => item.kind === 'file')
    .flatMap((item) => {
      const file = item.getAsFile();

      return file === null ? [] : [file];
    });

const attachAutosize = (host: HTMLElement, onFiles: (count: number) => void) => {
  const field = host as HTMLTextAreaElement;
  const paste = (event: ClipboardEvent) => {
    const files = pastedFiles(event);

    if (files.length === 0) return;
    event.preventDefault();
    rememberFiles(files);
    onFiles(files.length);
  };
  const fit = fitToContent(field);
  const observer = new ResizeObserver(fit);

  field.addEventListener('input', fit);
  field.addEventListener('keydown', holdEnterWhileComposing, { capture: true });
  field.addEventListener('paste', paste);
  observer.observe(field.parentElement ?? field);
  fit();
  if (globalThis.matchMedia?.('(pointer: fine)').matches ?? true)
    requestAnimationFrame(() => {
      if (document.activeElement === document.body || document.activeElement === null)
        field.focus();
    });

  return () => {
    field.removeEventListener('input', fit);
    field.removeEventListener('keydown', holdEnterWhileComposing, { capture: true });
    field.removeEventListener('paste', paste);
    observer.disconnect();
  };
};

export const Autosize = Mount.defineStream('Autosize', {
  args: {},
  messages: [Message.DroppedFiles],
  execute: ({ element }) =>
    hold<typeof Message.DroppedFiles.Type>(
      (host, emit) => attachAutosize(host, (count) => emit(Message.DroppedFiles({ count }))),
      element,
    ),
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
