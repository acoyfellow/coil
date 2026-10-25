import { Effect } from 'effect';
import type { Html } from 'foldkit/html';
import type { ChatMessage, ThreadView, Turn } from '../../../shared/protocol';
import { Message } from '../message';
import { type LiveTool, type Model, ViewState } from '../model';
import { FollowFeed, ScrollToEnd } from '../mount';
import { MAX_RECONNECTS } from '../subscriptions';
import { markdown } from './markdown';
import { type H, skeleton, spinner } from './parts';

const EXIT_CODE = /^exit (\d+)/;

const toolTarget = (args: string): string => {
  const parsed = Effect.runSync(
    Effect.try(() => JSON.parse(args) as unknown).pipe(Effect.orElseSucceed(() => null)),
  );

  if (typeof parsed !== 'object' || parsed === null) return args;

  const fields = parsed as Record<string, unknown>;

  for (const key of ['command', 'path', 'task', 'name'])
    if (typeof fields[key] === 'string') return fields[key];

  return args;
};

const tool = (
  h: H,
  key: string,
  name: string,
  args: string,
  output: string | null,
  running: boolean,
  failed: boolean,
  elapsed: string | null = null,
): Html =>
  h.keyed('details')(
    key,
    [h.Class(`tool${failed ? ' failed' : ''}`), h.DataAttribute('tool', name)],
    [
      h.summary(
        [],
        [
          running ? spinner(h) : h.span([h.Class('caret')], ['▶']),
          h.b([], [name]),
          h.span([h.Class('arg')], [toolTarget(args)]),
          ...(elapsed === null ? [] : [h.span([h.Class('tool-time')], [elapsed])]),
        ],
      ),
      h.pre([], [output ?? args]),
    ],
  );

const richText = (h: H, text: string): Html => markdown(h, text);

const message = (h: H, entry: ChatMessage, results: ReadonlyMap<string, string>): Html | null => {
  if (entry.role === 'tool' && entry.tool !== undefined) {
    const output = results.get(entry.tool.id) ?? null;
    const exit = output === null ? null : EXIT_CODE.exec(output);

    return tool(
      h,
      entry.id,
      entry.tool.name,
      entry.tool.args,
      output === null ? null : output || '(no output)',
      false,
      exit?.[1] !== undefined && exit[1] !== '0',
    );
  }

  if (entry.kind === 'pi.compaction')
    return h.keyed('div')(
      entry.id,
      [h.Class('msg summary')],
      [h.div([h.Class('label')], ['Compaction summary']), h.div([h.Class('body')], [entry.text])],
    );

  if ((entry.role !== 'user' && entry.role !== 'assistant') || entry.text === '') return null;

  if (entry.role === 'assistant' && entry.text.startsWith(FAILURE_PREFIX)) return failure(h, entry);

  return h.keyed('div')(
    entry.id,
    [h.Class(`msg ${entry.role}`)],
    [
      ...(entry.role === 'user' ? [] : [h.div([h.Class('label')], ['agent'])]),
      entry.role === 'user' ? h.div([h.Class('body')], [entry.text]) : richText(h, entry.text),
      ...(entry.id !== 'pending'
        ? [
            h.div(
              [h.Class('msg-tools')],
              [
                h.button(
                  [
                    h.Class('copy'),
                    h.AriaLabel('Copy message'),
                    h.DataAttribute('tip', 'Copy this message'),
                    h.OnClick(Message.ClickedCopy({ text: entry.text })),
                  ],
                  ['Copy'],
                ),
                ...(entry.role === 'user' ? userTools(h, entry.text) : []),
              ],
            ),
          ]
        : []),
    ],
  );
};

const userTools = (h: H, text: string): Html[] => [
  h.button(
    [
      h.Class('edit'),
      h.DataAttribute('tip', 'Put this text back in the box to edit it'),
      h.OnClick(Message.ClickedEdit({ text })),
    ],
    ['Edit'],
  ),
  h.button(
    [
      h.Class('retry'),
      h.DataAttribute('tip', 'Send this again as a new turn'),
      h.OnClick(Message.ClickedRetry({ text })),
    ],
    ['Retry'],
  ),
];

const toolResults = (messages: readonly ChatMessage[]): ReadonlyMap<string, string> =>
  new Map(
    messages
      .filter((entry) => entry.role === 'toolResult' && entry.toolCallId !== undefined)
      .map((entry) => [entry.toolCallId ?? '', entry.text]),
  );

const STARTERS = [
  'Explain what is in /workspace',
  'Build a small Worker that returns hello',
  'Find and fix a failing test',
  'Write a plan before you change anything',
] as const;

const ready = (h: H, view: ThreadView): Html =>
  h.div(
    [h.Class('empty inline')],
    [
      h.div(
        [h.Class('empty-inner')],
        [
          h.h2([], ['Ready when you are']),
          h.p(
            [],
            [
              view.repo === null
                ? 'Its computer has an empty git repo in /workspace.'
                : `Its computer has ${view.repo} checked out in /workspace.`,
            ],
          ),
          h.p(
            [h.Class('faint')],
            [
              view.origin.forkedFrom !== null
                ? `Forked from ${view.origin.forkedFrom}: it starts from that disk and a summary of that conversation.`
                : view.origin.parent !== null
                  ? `A child thread started by ${view.origin.parent}.`
                  : view.origin.base !== null
                    ? 'It started warm, from a prepared snapshot of this repo.'
                    : 'Ask it to build, fix, or explore something.',
            ],
          ),
          h.div(
            [h.Class('starters'), h.Id('starters')],
            STARTERS.map((text) =>
              h.button(
                [h.Class('starter'), h.Type('button'), h.OnClick(Message.ClickedEdit({ text }))],
                [text],
              ),
            ),
          ),
        ],
      ),
    ],
  );

const uniqueById = <T extends { readonly id: string }>(items: readonly T[]): T[] => {
  const seen = new Set<string>();

  return items.filter((item) => !seen.has(item.id) && seen.add(item.id) !== undefined);
};

const liveItems = (h: H, model: Model): Html[] => {
  const live = model.live;

  if (live === null) return [];

  const tools = uniqueById(live.tools).map((each: LiveTool) =>
    tool(
      h,
      `live-${each.id}`,
      each.name,
      each.args,
      each.output,
      !each.done,
      false,
      each.done ? null : ranFor(Math.max(0, model.now - each.startedAt)),
    ),
  );

  if (live.text !== '')
    return [
      ...tools,
      h.keyed('div')(
        'live-text',
        [h.Class('msg assistant'), h.Id('live-text')],
        [h.div([h.Class('label')], [spinner(h), 'agent']), markdown(h, live.text)],
      ),
    ];

  if (live.tools.every((each) => each.done))
    return [
      ...tools,
      h.keyed('div')(
        'live-wait',
        [h.Class('msg'), h.Id('live-wait')],
        [h.div([h.Class('label')], [spinner(h), live.compacting ? 'compacting…' : 'thinking…'])],
      ),
    ];

  return tools;
};

export const ranFor = (ms: number): string => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;

  return `${seconds}s`;
};

const turnFooter = (h: H, turn: Turn): Html =>
  h.keyed('div')(
    `ran-${turn.seq}`,
    [h.Class('ran'), h.DataAttribute('turn', String(turn.seq))],
    [
      `Ran for ${ranFor(turn.ended - turn.at)}${turn.tools > 0 ? ` · ${turn.tools} tool${turn.tools === 1 ? '' : 's'}` : ''}`,
    ],
  );

const noReply = (h: H, seq: number): Html =>
  h.keyed('div')(
    `no-reply-${seq}`,
    [h.Class('msg note'), h.DataAttribute('note', 'no-reply')],
    ['The agent finished without writing a reply.'],
  );

const FAILURE_PREFIX = 'The model call failed: ';
const SUMMARY_LIMIT = 160;

const failure = (h: H, entry: ChatMessage): Html => {
  const detail = entry.text.slice(FAILURE_PREFIX.length);
  const status = detail.match(/^\d{3}/)?.[0];
  const message = detail.match(/"message"\s*:\s*"([^"]{1,200})/)?.[1];
  const summary =
    message === undefined
      ? detail.slice(0, SUMMARY_LIMIT)
      : `${status === undefined ? '' : `${status}: `}${message}`;

  return h.keyed('div')(
    entry.id,
    [h.Class('msg assistant error')],
    [
      h.div([h.Class('label')], ['agent']),
      h.p([h.Class('error-summary')], [`The model call failed. ${summary}`]),
      ...(detail.length > summary.length
        ? [h.details([h.Class('error-detail')], [h.summary([], ['Details']), h.pre([], [detail])])]
        : []),
    ],
  );
};

const withTurnFooters = (
  h: H,
  messages: readonly ChatMessage[],
  turns: readonly Turn[],
  render: (entry: ChatMessage) => Html | null,
): Html[] => {
  const finished = [...turns].filter((turn) => turn.ended > 0).sort((a, b) => a.seq - b.seq);
  const prompts = messages.flatMap((entry, index) => (entry.role === 'user' ? [index] : []));
  const offset = prompts.length - finished.length;
  const footerAfter = new Map<number, Turn>();

  const silent = new Set<number>();

  finished.forEach((turn, position) => {
    const promptIndex = prompts[position + offset];

    if (promptIndex === undefined) return;

    const nextPrompt = prompts[position + offset + 1] ?? messages.length;
    const replied = messages
      .slice(promptIndex + 1, nextPrompt)
      .some((entry) => entry.role === 'assistant' && entry.text !== '');

    footerAfter.set(nextPrompt - 1, turn);
    if (!replied) silent.add(nextPrompt - 1);
  });

  const seen = new Set<string>();

  return messages.flatMap((entry, index) => {
    if (seen.has(entry.id)) return [];

    seen.add(entry.id);

    const item = entry.role === 'toolResult' ? null : render(entry);
    const footer = footerAfter.get(index);

    return [
      ...(item === null ? [] : [item]),
      ...(silent.has(index) && footer !== undefined ? [noReply(h, footer.seq)] : []),
      ...(footer === undefined ? [] : [turnFooter(h, footer)]),
    ];
  });
};

const welcome = (h: H): Html =>
  h.div(
    [h.Class('empty')],
    [
      h.div(
        [h.Class('empty-inner')],
        [
          h.img([
            h.Class('mark'),
            h.Src('/icons/coil-mark.svg'),
            h.Alt(''),
            h.Width('40'),
            h.Height('40'),
          ]),
          h.h2([], ['One thread, one agent, one computer']),
          h.p(
            [],
            [
              'Each thread gets its own Linux machine with a git checkout. Pause it and the disk is saved. Come back later and it resumes where it left off. Fork it to try another idea from the same point.',
            ],
          ),
          h.button(
            [
              h.Class('primary'),
              h.DataAttribute('new', '1'),
              h.OnClick(Message.ClickedNewThread()),
            ],
            ['New thread'],
          ),
        ],
      ),
    ],
  );

const turnTimer = (h: H, model: Model, view: ThreadView): Html[] => {
  const starts = [view.turns.find((turn) => turn.ended === 0)?.at, model.live?.startedAt].filter(
    (at): at is number => typeof at === 'number',
  );
  const startedAt = starts.length === 0 ? null : Math.min(...starts, model.now);

  if (!view.busy || startedAt === null) return [];

  return [
    h.keyed('div')(
      'turn-timer',
      [h.Class('ran running'), h.Id('turn-timer'), h.AriaLive('off')],
      [`Running for ${ranFor(Math.max(0, model.now - startedAt))}`],
    ),
  ];
};

const connection = (h: H, model: Model): Html[] => {
  if (model.reconnects === 0 || !model.online) return [];

  const gaveUp = model.reconnects > MAX_RECONNECTS;

  return [
    h.div(
      [h.Class(`connection${gaveUp ? ' lost' : ''}`), h.Id('connection'), h.Role('status')],
      gaveUp
        ? [
            'Lost the live connection to this thread. The agent keeps working; new output appears when you reconnect.',
            h.button([h.OnClick(Message.ClickedReconnect())], ['Reconnect']),
          ]
        : ['Reconnecting to the live stream…'],
    ),
  ];
};

const pinsReader = (view: ThreadView): boolean => view.messages.at(-1)?.id === 'pending';

const conversation = (h: H, model: Model, view: ThreadView): Html => {
  const results = toolResults(view.messages);
  const items = withTurnFooters(h, view.messages, view.turns, (entry) =>
    message(h, entry, results),
  );
  const live = [...liveItems(h, model), ...turnTimer(h, model, view)];
  const endKey = `${view.messages.length}:${model.live?.text.length ?? 0}:${model.live?.tools.length ?? 0}`;

  return h.div(
    [h.Class('feed-inner')],
    [
      ...(items.length === 0 && model.live === null ? [ready(h, view)] : []),
      ...items,
      ...live,
      h.keyed('div')(
        endKey,
        [h.Class('feed-end'), h.OnMount(ScrollToEnd({ key: endKey, pin: pinsReader(view) }))],
        [],
      ),
    ],
  );
};

export const feed = (h: H, model: Model): Html => {
  const body =
    model.name === null
      ? welcome(h)
      : ViewState.match(model.view, {
          Loading: () => h.div([h.Class('feed-inner')], [skeleton(h)]),
          Failed: ({ reason }) =>
            h.div(
              [h.Class('err')],
              [reason, h.button([h.OnClick(Message.ClickedRetryView())], ['Retry'])],
            ),
          Ready: ({ value }) => conversation(h, model, value),
        });

  return h.keyed('section')(
    model.name ?? 'home',
    [h.Class('feed'), h.Id('feed'), h.AriaLive('polite'), h.OnMount(FollowFeed({}))],
    [
      ...connection(h, model),
      body,
      h.button(
        [
          h.Id('jump-to-latest'),
          h.Class('jump'),
          h.AriaLabel('Scroll to latest message'),
          h.OnClick(Message.ClickedJumpToLatest()),
        ],
        ['↓ Latest'],
      ),
    ],
  );
};
