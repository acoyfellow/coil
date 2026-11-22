import { Command, given, message, model, story } from 'foldkit/story';
import { describe, expect, test } from 'vitest';
import type { PendingApproval, ThreadView } from '../../shared/protocol';
import { Decide, ExpireToast } from './command';
import { initialModel } from './main';
import { Message } from './message';
import { type Model, ViewState } from './model';
import { update } from './update';

const push: PendingApproval = {
  key: 'k-push',
  taskId: 7,
  tool: 'run',
  args: '{"command":"git push origin main"}',
  risk: 'push',
  until: 90_000,
};

const thread: ThreadView = {
  name: 'demo',
  title: 'Demo',
  phase: 'awake',
  busy: true,
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
  approvals: [],
};

const open = (): Model => ({
  ...initialModel({ name: 'demo', now: 1_000, online: true, theme: 'system', openNew: false }),
  view: ViewState.Ready({ value: thread }),
});

const approvals = (current: Model) =>
  current.view._tag === 'Ready' ? (current.view.value.approvals ?? []) : [];

describe('approvals, told as stories', () => {
  test('a parked push shows up, the person approves, and the card goes away', () => {
    story(
      update,
      given(open()),
      message(
        Message.ReceivedEvent({ name: 'demo', event: { _tag: 'approvals', approvals: [push] } }),
      ),
      model((current) => expect(approvals(current)).toEqual([push])),
      message(Message.ClickedDecide({ key: 'k-push', allow: true })),
      model((current) => expect(current.deciding).toEqual(['k-push'])),
      Command.expectHas(Decide),
      Command.resolve(Decide, Message.DecidedApproval({ name: 'demo', approvals: [] })),
      model((current) => {
        expect(approvals(current)).toEqual([]);
        expect(current.deciding).toEqual([]);
      }),
    );
  });

  test('a failed answer keeps the card and says why', () => {
    story(
      update,
      given(open()),
      message(
        Message.ReceivedEvent({ name: 'demo', event: { _tag: 'approvals', approvals: [push] } }),
      ),
      message(Message.ClickedDecide({ key: 'k-push', allow: false })),
      Command.resolve(
        Decide,
        Message.FailedDecide({
          name: 'demo',
          key: 'k-push',
          reason: 'No open question has this key.',
        }),
      ),
      model((current) => {
        expect(approvals(current)).toEqual([push]);
        expect(current.deciding).toEqual([]);
        expect(current.toasts.at(-1)?.text).toContain('No open question');
      }),
      Command.resolve(ExpireToast, Message.ExpiredToast({ id: 0 })),
    );
  });
});
