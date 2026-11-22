import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';
import type { Message } from '../src/agent';
import {
  cleanDraft,
  InvalidGoal,
  STEER_GOAL_CHARS,
  STEER_MESSAGE_CHARS,
  STEER_RECENT_MESSAGES,
  steerPrompt,
} from '../src/steer';

const message = (role: string, text: string, extra: Partial<Message> = {}): Message => ({
  id: crypto.randomUUID(),
  kind: 'message',
  role,
  text,
  ...extra,
});

describe('steer prompt', () => {
  test('names each speaker and puts the goal last', () => {
    const prompt = steerPrompt(
      [
        message('user', 'fix the build'),
        message('assistant', '', {
          tool: { id: 't1', name: 'bash', args: '{"command":"npm test"}' },
        }),
        message('toolResult', '3 tests failed'),
        message('assistant', 'Should I update the snapshots?'),
      ],
      'yes, update them',
    );

    expect(prompt).toContain('PERSON:\nfix the build');
    expect(prompt).toContain('AGENT CALLED TOOL bash:\n{"command":"npm test"}');
    expect(prompt).toContain('TOOL RESULT:\n3 tests failed');
    expect(prompt).toContain('AGENT:\nShould I update the snapshots?');
    expect(prompt.trimEnd().endsWith('Write the next message to the agent.')).toBe(true);
    expect(prompt).toContain('GOAL OF THE PERSON: yes, update them');
  });

  test('keeps only the recent messages and cuts long ones', () => {
    const many = Array.from({ length: STEER_RECENT_MESSAGES + 5 }, (_, i) =>
      message(
        'assistant',
        `turn ${i} ${'x'.repeat(i === STEER_RECENT_MESSAGES + 4 ? STEER_MESSAGE_CHARS * 2 : 1)}`,
      ),
    );
    const prompt = steerPrompt(many, 'continue');

    expect(prompt).not.toContain('turn 0 ');
    expect(prompt).not.toContain('turn 4 ');
    expect(prompt).toContain('turn 5 ');
    expect(prompt).toContain('[cut]');
  });

  test('skips system rows and says when the conversation is empty', () => {
    expect(steerPrompt([message('system', 'hidden')], 'start')).toContain(
      '(the conversation is empty)',
    );
  });

  test('refuses an empty goal and cuts a long one', () => {
    expect(() => steerPrompt([], '  ')).toThrow(InvalidGoal);
    expect(steerPrompt([], 'g'.repeat(STEER_GOAL_CHARS + 50))).toContain('[cut]');
  });

  test('cleans the draft the model returns', () => {
    expect(cleanDraft('PERSON: run the tests')).toBe('run the tests');
    expect(cleanDraft('```\nrun the tests\n```')).toBe('run the tests');
    expect(cleanDraft('  Message: go  ')).toBe('go');
  });
});

describe('steer on a thread', () => {
  let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

  beforeAll(async () => {
    worker = await unstable_startWorker({
      config: resolve('test/worker/wrangler.jsonc'),
      dev: { server: { port: 0 }, inspector: false, logLevel: 'error', persist: false },
    });
  }, 60_000);

  afterAll(async () => {
    await worker.dispose();
  });

  test('drafts from the thread and the goal, and sends nothing', {
    timeout: 60_000,
  }, async () => {
    const response = await worker.fetch(`http://coil/steer?run=${crypto.randomUUID().slice(0, 8)}`);
    const out = (await response.json()) as {
      draft: string;
      before: number;
      after: number;
      empty: string;
    };

    expect(out.draft).toBe('Steered toward "make it run the tests" (saw the earlier request).');
    expect(out.after).toBe(out.before);
    expect(out.empty).toContain('Write a goal');
  });
});
