import type { ConversationView, LiveState, ToolSlot } from '@earendil-works/pi-durable';
import type { LiveEvent } from './thread';

type MessageContent = {
  readonly type: string;
  readonly text?: string;
  readonly thinking?: string;
  readonly id?: string;
  readonly arguments?: unknown;
};

type Seen = {
  readonly started: Set<string>;
  readonly ended: Set<string>;
  readonly output: Map<string, string>;
  readonly args: Map<string, string>;
  streamed: string[];
  attempt: number | undefined;
  turns: number | undefined;
  compactions: number;
};

const appended = (before: string, after: string): string =>
  after.startsWith(before) ? after.slice(before.length) : after;

const messageEvents = (live: LiveState, seen: Seen): LiveEvent[] => {
  const generation = live.generation;
  if (generation?.attempt !== seen.attempt) {
    seen.attempt = generation?.attempt;
    seen.streamed = [];
  }
  const content = (generation?.message?.content ?? []) as readonly MessageContent[];

  return content.flatMap((part, index): LiveEvent[] => {
    if (part.type === 'toolCall' && part.id !== undefined)
      seen.args.set(part.id, JSON.stringify(part.arguments ?? {}));
    const text =
      part.type === 'text' ? part.text : part.type === 'thinking' ? part.thinking : undefined;
    if (text === undefined) return [];
    const delta = appended(seen.streamed[index] ?? '', text);
    seen.streamed[index] = text;
    if (delta === '') return [];

    return [{ type: part.type === 'text' ? 'text' : 'thinking', delta }];
  });
};

const toolEvents = (slot: ToolSlot, seen: Seen): LiveEvent[] => {
  const events: LiveEvent[] = [];
  if (!seen.started.has(slot.callId)) {
    seen.started.add(slot.callId);
    events.push({
      type: 'tool_start',
      id: slot.callId,
      name: slot.name,
      args: seen.args.get(slot.callId) ?? '{}',
    });
  }
  const output = slot.output ?? '';
  const delta = appended(seen.output.get(slot.callId) ?? '', output);
  if (output !== '') seen.output.set(slot.callId, output);
  if (delta !== '') events.push({ type: 'tool_output', id: slot.callId, append: delta });
  if (slot.status === 'done' && !seen.ended.has(slot.callId)) {
    seen.ended.add(slot.callId);
    events.push({ type: 'tool_end', id: slot.callId, name: slot.name });
  }

  return events;
};

const turnEvents = (live: LiveState, seen: Seen): LiveEvent[] => {
  const turns = live.run?.turns;
  const previous = seen.turns;
  seen.turns = turns;
  const advanced = turns !== undefined && previous !== undefined && turns > previous;
  const finished = turns === undefined && previous !== undefined;

  return advanced || finished ? [{ type: 'turn_end' }] : [];
};

const compactionEvents = (live: LiveState, seen: Seen): LiveEvent[] => {
  const running = live.compactions?.length ?? 0;
  const previous = seen.compactions;
  seen.compactions = running;
  if (running > previous) return [{ type: 'compaction', phase: 'start' }];
  if (running < previous) return [{ type: 'compaction', phase: 'end' }];

  return [];
};

export const liveEvents = () => {
  const seen: Seen = {
    started: new Set(),
    ended: new Set(),
    output: new Map(),
    args: new Map(),
    streamed: [],
    attempt: undefined,
    turns: undefined,
    compactions: 0,
  };
  let first = true;

  return (view: ConversationView): LiveEvent[] => {
    const live = (view.docs['pi.live'] ?? {}) as LiveState;
    const events = [
      ...messageEvents(live, seen),
      ...(live.tools ?? []).flatMap((slot) => toolEvents(slot, seen)),
      ...turnEvents(live, seen),
      ...compactionEvents(live, seen),
    ];
    if (!first) return events;
    first = false;

    return [];
  };
};
