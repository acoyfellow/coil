import { Command, given, message, model, story } from 'foldkit/story';
import { describe, expect, test } from 'vitest';
import type { ThreadView } from '../../shared/protocol';
import { DraftSteer, FocusComposer, FocusSteerGoal } from './command';
import { initialModel } from './main';
import { Message } from './message';
import { type Model, ViewState } from './model';
import {
  acceptsResult,
  canDraft,
  draftInto,
  failDraft,
  openSteer,
  startDraft,
  typeGoal,
} from './steer';
import { update } from './update';

const thread: ThreadView = {
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
  surfaces: [],
  model: '@cf/zai-org/glm-5.3',
  usage: { input: 0, output: 0, cacheRead: 0, cost: 0, contextTokens: 0, contextWindow: 1048576 },
  turns: [],
};

const open = (): Model => ({
  ...initialModel({ name: 'demo', now: 1_000, online: true, theme: 'system', openNew: false }),
  view: ViewState.Ready({ value: thread }),
});

describe('steer state', () => {
  test('a goal is needed, and a second draft does not start while one runs', () => {
    const empty = openSteer('demo');

    expect(canDraft(empty)).toBe(false);
    expect(startDraft(empty)).toBe(empty);

    const typed = typeGoal(empty, 'run the tests');
    const drafting = startDraft(typed);

    expect(drafting.status).toBe('drafting');
    expect(canDraft(drafting)).toBe(false);
  });

  test('only the result for the current thread and goal is accepted', () => {
    const drafting = startDraft(typeGoal(openSteer('demo'), '  run the tests '));

    expect(acceptsResult(drafting, 'demo', 'run the tests')).toBe(true);
    expect(acceptsResult(drafting, 'other', 'run the tests')).toBe(false);
    expect(acceptsResult(drafting, 'demo', 'something else')).toBe(false);
    expect(acceptsResult(null, 'demo', 'run the tests')).toBe(false);
    expect(acceptsResult(failDraft(drafting, 'x'), 'demo', 'run the tests')).toBe(false);
  });

  test('the draft never replaces what the person already typed', () => {
    expect(draftInto('', 'run the tests')).toBe('run the tests');
    expect(draftInto('  ', 'run the tests')).toBe('run the tests');
    expect(draftInto('my note', 'run the tests')).toBe('my note\n\nrun the tests');
  });
});

describe('steer, told as stories', () => {
  test('open, pick a goal, draft: the draft lands in the message box and nothing is sent', () => {
    story(
      update,
      given(open()),
      message(Message.ClickedSteer()),
      Command.expectHas(FocusSteerGoal),
      Command.resolve(FocusSteerGoal, Message.CompletedEffect()),
      message(Message.UpdatedSteerGoal({ goal: 'make it run the tests' })),
      message(Message.SubmittedSteer()),
      model((current) => expect(current.steer?.status).toBe('drafting')),
      Command.expectHas(DraftSteer),
      Command.resolve(
        DraftSteer,
        Message.DraftedSteer({
          name: 'demo',
          goal: 'make it run the tests',
          draft: 'Run npm test and fix what fails.',
        }),
      ),
      Command.resolve(FocusComposer, Message.CompletedEffect()),
      model((current) => {
        expect(current.steer).toBeNull();
        expect(current.draft).toBe('Run npm test and fix what fails.');
        expect(current.sending).toBe(false);
      }),
    );
  });

  test('a failed draft keeps the goal and shows the reason', () => {
    story(
      update,
      given(open()),
      message(Message.ClickedSteer()),
      Command.resolve(FocusSteerGoal, Message.CompletedEffect()),
      message(Message.UpdatedSteerGoal({ goal: 'get it unstuck' })),
      message(Message.SubmittedSteer()),
      Command.resolve(
        DraftSteer,
        Message.FailedSteer({ name: 'demo', goal: 'get it unstuck', reason: 'model is down' }),
      ),
      model((current) => {
        expect(current.steer?.status).toBe('failed');
        expect(current.steer?.problem).toBe('model is down');
        expect(current.steer?.goal).toBe('get it unstuck');
        expect(current.draft).toBe('');
      }),
    );
  });

  test('a draft for an older goal, or after steer is closed, is dropped', () => {
    story(
      update,
      given(open()),
      message(Message.ClickedSteer()),
      Command.resolve(FocusSteerGoal, Message.CompletedEffect()),
      message(Message.UpdatedSteerGoal({ goal: 'get it unstuck' })),
      message(Message.SubmittedSteer()),
      Command.resolve(
        DraftSteer,
        Message.DraftedSteer({ name: 'demo', goal: 'something older', draft: 'stale' }),
      ),
      model((current) => {
        expect(current.steer?.status).toBe('drafting');
        expect(current.draft).toBe('');
      }),
      message(Message.ClosedSteer()),
      message(Message.DraftedSteer({ name: 'demo', goal: 'get it unstuck', draft: 'late' })),
      model((current) => {
        expect(current.steer).toBeNull();
        expect(current.draft).toBe('');
      }),
    );
  });
});
