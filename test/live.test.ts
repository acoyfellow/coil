import type { ConversationView, LiveState } from '@earendil-works/pi-durable';
import { describe, expect, it } from 'vitest';
import { liveEvents } from '../src/live';

const view = (live: LiveState): ConversationView =>
  ({ conversation: {}, entries: [], docs: { 'pi.live': live } }) as unknown as ConversationView;

const message = (content: unknown[]) =>
  ({ role: 'assistant', content }) as unknown as NonNullable<LiveState['generation']>['message'];

describe('liveEvents', () => {
  it('turns conversation view revisions into the deltas the client streams', () => {
    const next = liveEvents();
    const run = { taskId: 't', inputs: [], turns: 0 } as unknown as LiveState['run'];

    expect(next(view({}))).toEqual([]);
    expect(
      next(
        view({
          run,
          generation: { attempt: 1, message: message([{ type: 'thinking', thinking: 'Hm' }]) },
        }),
      ),
    ).toEqual([{ type: 'thinking', delta: 'Hm' }]);
    expect(
      next(
        view({
          run,
          generation: {
            attempt: 1,
            message: message([
              { type: 'thinking', thinking: 'Hmm' },
              { type: 'text', text: 'Hi' },
              { type: 'toolCall', id: 'c1', name: 'run', arguments: { command: 'ls' } },
            ]),
          },
          tools: [{ callId: 'c1', name: 'run', status: 'running', output: 'a' }],
        }),
      ),
    ).toEqual([
      { type: 'thinking', delta: 'm' },
      { type: 'text', delta: 'Hi' },
      { type: 'tool_start', id: 'c1', name: 'run', args: '{"command":"ls"}' },
      { type: 'tool_output', id: 'c1', append: 'a' },
    ]);
    expect(
      next(
        view({
          run: { ...run, turns: 1 } as LiveState['run'],
          tools: [{ callId: 'c1', name: 'run', status: 'done', output: 'ab' }],
          compactions: [{}] as unknown as LiveState['compactions'],
        }),
      ),
    ).toEqual([
      { type: 'tool_output', id: 'c1', append: 'b' },
      { type: 'tool_end', id: 'c1', name: 'run' },
      { type: 'turn_end' },
      { type: 'compaction', phase: 'start' },
    ]);
    expect(next(view({}))).toEqual([{ type: 'turn_end' }, { type: 'compaction', phase: 'end' }]);
  });
});
