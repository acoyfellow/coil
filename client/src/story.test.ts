import { Command, given, message, model, story } from 'foldkit/story';
import { describe, expect, test } from 'vitest';
import type { ThreadView } from '../../shared/protocol';
import {
  ConfirmResize,
  ExpireToast,
  FocusComposer,
  FocusPalette,
  LoadDir,
  LoadThreads,
  LoadView,
  PushUrl,
  Resize,
  RunAction,
  RunOp,
  SaveDraft,
  SendMessage,
} from './command';
import { initialModel } from './main';
import { Message } from './message';
import { type Model, ViewState } from './model';
import { update } from './update';

const thread = (overrides: Partial<ThreadView> = {}): ThreadView => ({
  name: 'demo',
  title: 'Demo',
  phase: 'awake',
  busy: false,
  running: true,
  repo: null,
  origin: { parent: null, forkedFrom: null, base: null, seed: null },
  owner: 'you@example.com',
  size: 'standard-1',
  messages: [],
  pairs: [],
  execs: [],
  surfaces: [{ id: 't1', kind: 'terminal', title: 'shell' }],
  model: '@cf/zai-org/glm-5.3',
  usage: { input: 0, output: 0, cacheRead: 0, cost: 0, contextTokens: 0, contextWindow: 1048576 },
  turns: [],
  ...overrides,
});

const opened = (overrides: Partial<ThreadView> = {}): Model => ({
  ...initialModel({ name: 'demo', now: 1_000, online: true, theme: 'system', openNew: false }),
  view: ViewState.Ready({ value: thread(overrides) }),
});

describe('opening a thread', () => {
  test('a loaded view keeps the terminal tab when the thread has one', () => {
    story(
      update,
      given(
        initialModel({ name: 'demo', now: 1_000, online: true, theme: 'system', openNew: false }),
      ),
      message(Message.LoadedView({ name: 'demo', view: thread() })),
      model((current) => {
        expect(current.view._tag).toBe('Ready');
        expect(current.tab).toBe('t1');
      }),
    );
  });

  test('a view for a thread the user already left is ignored', () => {
    story(
      update,
      given(opened()),
      message(Message.NavigatedTo({ name: 'other' })),
      Command.expectHas(LoadView),
      Command.resolve(
        LoadView,
        Message.LoadedView({ name: 'other', view: thread({ name: 'other', title: 'Other' }) }),
      ),
      message(Message.LoadedView({ name: 'demo', view: thread({ title: 'Stale' }) })),
      model((current) => {
        expect(current.name).toBe('other');
        expect(current.view._tag === 'Ready' ? current.view.value.title : '').toBe('Other');
      }),
    );
  });

  test('a thread with no surfaces opens the files tab and lists the folder', () => {
    story(
      update,
      given(
        initialModel({ name: 'demo', now: 1_000, online: true, theme: 'system', openNew: false }),
      ),
      message(Message.LoadedView({ name: 'demo', view: thread({ surfaces: [] }) })),
      model((current) => expect(current.tab).toBe('files')),
      Command.expectHas(LoadDir),
      Command.resolve(LoadDir, Message.LoadedDir({ name: 'demo', path: '.', entries: [] })),
    );
  });
});

describe('the size menu', () => {
  test('picking a new size on a paused computer resizes without asking', () => {
    story(
      update,
      given(opened({ phase: 'paused', running: false })),
      message(Message.ToggledSizeMenu()),
      model((current) => expect(current.sizeMenuOpen).toBe(true)),
      message(Message.PickedSize({ size: 'standard-3' })),
      model((current) => expect(current.sizeMenuOpen).toBe(false)),
      Command.expectHas(ConfirmResize),
      Command.resolve(ConfirmResize, Message.ClickedSize({ size: 'standard-3' })),
      model((current) => expect(current.action).toBe('size')),
      Command.expectHas(Resize),
      Command.resolve(
        Resize,
        Message.CompletedAction({
          name: 'demo',
          action: 'size',
          note: 'The computer will start at standard-3.',
        }),
      ),
      model((current) => expect(current.action).toBeNull()),
      Command.resolveAll(
        [ExpireToast, Message.ExpiredToast({ id: 1 })],
        [ExpireToast, Message.ExpiredToast({ id: 2 })],
        [
          LoadView,
          Message.RefreshedView({
            name: 'demo',
            view: thread({ phase: 'paused', running: false, size: 'standard-3' }),
          }),
        ],
        [LoadThreads, Message.LoadedThreads({ threads: [] })],
      ),
      model((current) =>
        expect(current.view._tag === 'Ready' ? current.view.value.size : '').toBe('standard-3'),
      ),
    );
  });

  test('picking the current size does nothing', () => {
    story(
      update,
      given(opened()),
      message(Message.ClickedSize({ size: 'standard-1' })),
      model((current) => expect(current.action).toBeNull()),
      Command.expectNone(),
    );
  });
});

describe('sending', () => {
  test('a message shows at once, marks the thread busy, and is sent', () => {
    story(
      update,
      given(opened()),
      message(Message.UpdatedDraft({ value: '  build a page  ' })),
      Command.resolve(SaveDraft, Message.CompletedEffect()),
      message(Message.SubmittedDraft()),
      Command.resolve(SaveDraft, Message.CompletedEffect()),
      model((current) => {
        expect(current.draft).toBe('');
        expect(current.view._tag === 'Ready' && current.view.value.busy).toBe(true);
        expect(current.view._tag === 'Ready' ? current.view.value.messages.at(-1)?.text : '').toBe(
          'build a page',
        );
      }),
      Command.expectHas(SendMessage),
      Command.resolve(SendMessage, Message.SentMessage({ name: 'demo' })),
      Command.expectHas(LoadThreads),
      Command.resolve(LoadThreads, Message.LoadedThreads({ threads: [] })),
    );
  });

  test('a failed send puts the text back and says why', () => {
    story(
      update,
      given(opened()),
      message(Message.UpdatedDraft({ value: 'hello' })),
      Command.resolve(SaveDraft, Message.CompletedEffect()),
      message(Message.SubmittedDraft()),
      Command.resolve(SaveDraft, Message.CompletedEffect()),
      Command.resolve(
        SendMessage,
        Message.FailedSend({ name: 'demo', text: 'hello', reason: 'The agent is working.' }),
      ),
      model((current) => {
        expect(current.draft).toBe('hello');
        expect(current.view._tag === 'Ready' && current.view.value.busy).toBe(false);
        expect(current.toasts.at(-1)?.text).toBe('Could not send: The agent is working.');
        expect(current.toasts.at(-1)?.bad).toBe(true);
      }),
      Command.resolve(ExpireToast, Message.ExpiredToast({ id: 1 })),
      model((current) => expect(current.toasts).toEqual([])),
    );
  });

  test('a busy thread does not send', () => {
    story(
      update,
      given(opened({ busy: true })),
      message(Message.UpdatedDraft({ value: 'x' })),
      Command.resolve(SaveDraft, Message.CompletedEffect()),
      message(Message.SubmittedDraft()),
      Command.expectNone(),
    );
  });
});

describe('live stream', () => {
  test('streamed reasoning builds up live and clears when a tool starts', () => {
    story(
      update,
      given(opened({ busy: true })),
      message(
        Message.ReceivedEvent({ name: 'demo', event: { _tag: 'thinking', delta: 'Check ' } }),
      ),
      message(
        Message.ReceivedEvent({ name: 'demo', event: { _tag: 'thinking', delta: 'the repo' } }),
      ),
      model((current) => expect(current.live?.thinking).toBe('Check the repo')),
      message(
        Message.ReceivedEvent({
          name: 'demo',
          event: { _tag: 'tool_start', id: 'c1', name: 'run', args: '{"command":"ls"}' },
        }),
      ),
      model((current) => expect(current.live?.thinking).toBe('')),
    );
  });

  test('streamed text and tools build the live turn, and the end of the turn reloads the view', () => {
    story(
      update,
      given(opened({ busy: true })),
      message(Message.ReceivedEvent({ name: 'demo', event: { _tag: 'text', delta: 'Hel' } })),
      message(Message.ReceivedEvent({ name: 'demo', event: { _tag: 'text', delta: 'lo' } })),
      model((current) => expect(current.live?.text).toBe('Hello')),
      message(
        Message.ReceivedEvent({
          name: 'demo',
          event: { _tag: 'tool_start', id: 'c1', name: 'run', args: '{"command":"ls"}' },
        }),
      ),
      message(
        Message.ReceivedEvent({
          name: 'demo',
          event: { _tag: 'tool_output', id: 'c1', append: 'a.txt' },
        }),
      ),
      model((current) => {
        expect(current.live?.text).toBe('');
        expect(current.live?.tools[0]?.output).toBe('a.txt');
      }),
      message(
        Message.ReceivedEvent({
          name: 'demo',
          event: { _tag: 'state', phase: 'awake', busy: false, running: true },
        }),
      ),
      model((current) => expect(current.live).toBeNull()),
      Command.expectHas(LoadView),
      Command.resolveAll(
        [LoadView, Message.RefreshedView({ name: 'demo', view: thread() })],
        [LoadThreads, Message.LoadedThreads({ threads: [] })],
      ),
    );
  });

  test('events for another thread are ignored', () => {
    story(
      update,
      given(opened({ busy: true })),
      message(Message.ReceivedEvent({ name: 'elsewhere', event: { _tag: 'text', delta: 'nope' } })),
      model((current) => expect(current.live).toBeNull()),
    );
  });
});

describe('actions', () => {
  test('fork opens the new thread', () => {
    story(
      update,
      given(opened()),
      message(Message.ClickedAction({ action: 'fork' })),
      model((current) => expect(current.action).toBe('fork')),
      Command.expectHas(RunAction),
      Command.resolve(RunAction, Message.ForkedInto({ view: thread({ name: 'demo-fork' }) })),
      model((current) => expect(current.action).toBeNull()),
      Command.expectHas(PushUrl),
      Command.resolveAll(
        [ExpireToast, Message.ExpiredToast({ id: 1 })],
        [ExpireToast, Message.ExpiredToast({ id: 2 })],
        [LoadThreads, Message.LoadedThreads({ threads: [] })],
        [PushUrl, Message.CompletedEffect()],
      ),
    );
  });

  test('actions are locked while the agent works', () => {
    story(
      update,
      given(opened({ busy: true })),
      message(Message.ClickedAction({ action: 'pause' })),
      Command.expectNone(),
    );
  });
});

describe('the palette and message tools', () => {
  test('cmd-k opens the palette; typing filters; enter runs the chosen command', () => {
    story(
      update,
      given(opened()),
      message(Message.PressedShortcut({ key: 'palette' })),
      Command.expectHas(FocusPalette),
      Command.resolve(FocusPalette, Message.CompletedEffect()),
      message(Message.UpdatedPalette({ query: 'stop' })),
      model((current) => expect(current.palette).toEqual({ query: 'stop', index: 0 })),
      message(Message.ChosePalette({ index: 0 })),
      Command.expectHas(RunOp),
      Command.resolve(RunOp, Message.CompletedOp({ name: 'demo', note: 'Stopped.', gone: false })),
      model((current) => expect(current.palette).toBeNull()),
      Command.resolveAll(
        [LoadThreads, Message.LoadedThreads({ threads: [] })],
        [LoadView, Message.FailedView({ name: 'demo', reason: 'x' })],
        [ExpireToast, Message.ExpiredToast({ id: 0 })],
      ),
    );
  });

  test('edit puts the text back; retry sends it again', () => {
    story(
      update,
      given(opened()),
      message(Message.ClickedEdit({ text: 'make it blue' })),
      model((current) => expect(current.draft).toBe('make it blue')),
      Command.resolve(FocusComposer, Message.CompletedEffect()),
      message(Message.ClickedRetry({ text: 'make it blue' })),
      Command.expectHas(SendMessage),
      model((current) => expect(current.draft).toBe('')),
      Command.resolve(SaveDraft, Message.CompletedEffect()),
      Command.resolve(SendMessage, Message.SentMessage({ name: 'demo' })),
      Command.resolveAll([LoadThreads, Message.LoadedThreads({ threads: [] })]),
    );
  });
});

describe('live connection', () => {
  test('a dropped stream counts reconnects, an open stream resets and reloads', () => {
    story(
      update,
      given(opened({ busy: true })),
      message(Message.StreamClosed({ name: 'demo' })),
      message(Message.StreamClosed({ name: 'demo' })),
      model((current) => expect(current.reconnects).toBe(2)),
      message(Message.StreamOpened({ name: 'demo' })),
      model((current) => expect(current.reconnects).toBe(0)),
      Command.resolve(
        LoadView,
        Message.RefreshedView({ name: 'demo', view: thread({ busy: true }) }),
      ),
    );
  });

  test('Reconnect after giving up starts a fresh stream', () => {
    story(
      update,
      given({ ...opened(), reconnects: 9, streamEpoch: 9 }),
      message(Message.ClickedReconnect()),
      model((current) => {
        expect(current.reconnects).toBe(0);
        expect(current.streamEpoch).toBe(10);
      }),
    );
  });
});
