import { inertHtml } from 'foldkit/html';
import { describe, expect, test } from 'vitest';
import type { ChatMessage, Turn } from '../../shared/protocol';
import { withTurnFooters } from './view/feed';

const h = inertHtml;

const user = (id: string): ChatMessage => ({ id, kind: 'pi.user', role: 'user', text: id });
const reply = (id: string): ChatMessage => ({
  id,
  kind: 'pi.assistant',
  role: 'assistant',
  text: id,
});
const turn = (seq: number, ended: number): Turn => ({
  seq,
  at: seq,
  ended,
  tools: 0,
  prompt: '',
  stat: '',
  diff: '',
});

const order = (nodes: ReturnType<typeof withTurnFooters>) =>
  nodes.map((node) => String(node?.key ?? ''));

describe('turn footers', () => {
  const messages = [user('u1'), reply('a1'), user('u2'), reply('a2')];

  test('every finished turn gets a footer after its own reply', () => {
    const nodes = withTurnFooters(h, messages, [turn(1, 5), turn(2, 9)], (entry) =>
      h.keyed('div')(entry.id, [], []),
    );

    expect(order(nodes)).toEqual(['u1', 'a1', 'ran-1', 'u2', 'a2', 'ran-2']);
  });

  test('while the latest prompt is still running, no footer lands under it', () => {
    const nodes = withTurnFooters(
      h,
      messages,
      [turn(1, 5), turn(2, 9)],
      (entry) => h.keyed('div')(entry.id, [], []),
      true,
    );

    expect(order(nodes)).toEqual(['u1', 'a1', 'ran-1', 'u2', 'a2']);
  });
});
