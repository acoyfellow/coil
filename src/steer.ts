import type { Message } from './agent';

export const STEER_RECENT_MESSAGES = 12;

export const STEER_MESSAGE_CHARS = 1_200;

export const STEER_GOAL_CHARS = 500;

export const STEER_DRAFT_CHARS = 2_000;

export const STEER_SYSTEM = [
  'You help a person steer a coding agent that works in its own computer.',
  'You read the end of the conversation and the goal of the person.',
  'You write the next message the person sends to the agent.',
  'Write only that message, as the person, to the agent. Do not explain it.',
  'Make it short, direct and specific: name the exact thing to do next.',
  'If the agent asks a question, answer it in the way that moves toward the goal.',
  'Do not tell the agent to do destructive or irreversible things that the goal does not ask for.',
].join('\n');

export class InvalidGoal extends Error {}

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max)} [cut]`;

const speaker = (message: Message): string | null => {
  if (message.role === 'user') return 'PERSON';
  if (message.role === 'assistant' && message.tool !== undefined)
    return `AGENT CALLED TOOL ${message.tool.name}`;
  if (message.role === 'assistant') return 'AGENT';
  if (message.role === 'toolResult') return 'TOOL RESULT';

  return null;
};

const lineOf = (message: Message): string | null => {
  const who = speaker(message);

  if (who === null) return null;

  const body = message.tool === undefined ? message.text : message.tool.args;

  return `${who}:\n${clip(body.trim(), STEER_MESSAGE_CHARS)}`;
};

export const cleanGoal = (goal: string): string => {
  const clean = goal.trim();

  if (clean === '') throw new InvalidGoal('Write a goal for the next message.');

  return clip(clean, STEER_GOAL_CHARS);
};

export const steerPrompt = (messages: readonly Message[], goal: string): string => {
  const recent = messages
    .map(lineOf)
    .filter((line): line is string => line !== null)
    .slice(-STEER_RECENT_MESSAGES);
  const transcript = recent.length === 0 ? '(the conversation is empty)' : recent.join('\n\n');

  return [
    'END OF THE CONVERSATION:',
    transcript,
    '',
    `GOAL OF THE PERSON: ${cleanGoal(goal)}`,
    '',
    'Write the next message to the agent.',
  ].join('\n');
};

const CODE_FENCE = /^```[a-z]*\n?|\n?```$/g;

const SPEAKER_LABELS = ['person:', 'message:'];

const withoutSpeakerLabel = (text: string): string => {
  const label = SPEAKER_LABELS.find((each) => text.toLowerCase().startsWith(each));

  return label === undefined ? text : text.slice(label.length).trimStart();
};

export const cleanDraft = (raw: string): string => {
  const unquoted = withoutSpeakerLabel(raw.trim().replace(CODE_FENCE, '').trim());

  return clip(unquoted, STEER_DRAFT_CHARS);
};
