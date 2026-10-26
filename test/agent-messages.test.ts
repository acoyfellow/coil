import { describe, expect, it } from 'vitest';
import { type ChatEntry, entriesToMessages } from '../src/agent';

const parallelCalls: ChatEntry = {
  id: 27,
  kind: 'pi.assistant',
  model: [
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'call_a', name: 'run', arguments: { command: 'ls' } },
        { type: 'toolCall', id: 'call_b', name: 'run', arguments: { command: 'pwd' } },
      ],
    },
  ],
};

describe('entriesToMessages', () => {
  it('gives each parallel tool call its own id', () => {
    const ids = entriesToMessages([parallelCalls]).map((message) => message.id);

    expect(ids).toEqual(['27:call_a', '27:call_b']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps reasoning as its own message before the reply', () => {
    const entry: ChatEntry = {
      id: 30,
      kind: 'pi.assistant',
      model: [
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Look at the files first.' },
            { type: 'text', text: 'Done.' },
          ],
        },
      ],
    };

    expect(entriesToMessages([entry]).map((each) => [each.id, each.role, each.text])).toEqual([
      ['30:thinking', 'thinking', 'Look at the files first.'],
      ['30', 'assistant', 'Done.'],
    ]);
  });

  it('shows nothing extra when the reasoning is empty', () => {
    const entry: ChatEntry = {
      id: 31,
      kind: 'pi.assistant',
      model: [
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: ' ' },
            { type: 'text', text: 'Hi.' },
          ],
        },
      ],
    };

    expect(entriesToMessages([entry]).map((each) => each.role)).toEqual(['assistant']);
  });
});
