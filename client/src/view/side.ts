import type { Html } from 'foldkit/html';
import type { ThreadSummary } from '../../../shared/protocol';
import { Message } from '../message';
import { type Model, ThreadsState } from '../model';
import { pathForThread } from '../route';
import { type H, phaseKey, phaseLabel, short, skeleton } from './parts';

const GROUPS: readonly [string, (thread: ThreadSummary) => boolean][] = [
  ['Working', (thread) => thread.busy],
  ['Running', (thread) => !thread.busy && thread.phase === 'awake'],
  ['Paused', (thread) => !thread.busy && thread.phase !== 'awake'],
];

const rowTitle = (thread: ThreadSummary): string =>
  [
    thread.title,
    phaseLabel(thread),
    thread.forkedFrom === null ? null : `fork of ${thread.forkedFrom}`,
    thread.createdBy === 'web' ? null : `via ${thread.createdBy}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

const row = (h: H, model: Model, thread: ThreadSummary, child: boolean): Html =>
  h.keyed('a')(
    thread.name,
    [
      h.Class(`item${thread.name === model.name ? ' on' : ''}${child ? ' child' : ''}`),
      h.Href(pathForThread(thread.name)),
      h.DataAttribute('thread', thread.name),
      h.Title(rowTitle(thread)),
      h.OnClick(Message.ClickedThread({ name: thread.name }), { defaultAction: 'Prevent' }),
    ],
    [
      h.span([h.Class(`dot ${phaseKey(thread)}`)], []),
      h.span([h.Class('t')], [thread.title === '' ? thread.name : thread.title]),
      h.span([h.Class('m')], [short(model.now, thread.updatedAt)]),
    ],
  );

const CLOUDFLARE_OWNER_PREFIX = 'cf:';

const isCloudflareUser = (who: string) => who.startsWith(CLOUDFLARE_OWNER_PREFIX);

const signedInLabel = (model: Model) => {
  if (!isCloudflareUser(model.who)) return model.who;
  if (model.account === null) return 'Signed in with Cloudflare';

  return model.account.gateway === null
    ? model.account.name
    : `${model.account.name} · ${model.account.gateway}`;
};

const signOut = (h: H, who: string): Html[] =>
  isCloudflareUser(who)
    ? [
        h.a(
          [
            h.Id('gateway-link'),
            h.Class('sign-out gateway-link'),
            h.Href('/oauth/gateway'),
            h.DataAttribute('tip', 'Pick which AI Gateway on your account runs model calls'),
          ],
          ['Gateway'],
        ),
        h.form(
          [h.Id('sign-out'), h.Class('sign-out'), h.Method('post'), h.Action('/oauth/logout')],
          [
            h.button(
              [
                h.Type('submit'),
                h.DataAttribute('tip', 'Sign out and remove coil access to your account'),
              ],
              ['Sign out'],
            ),
          ],
        ),
      ]
    : [];

const archivedToggle = (h: H, model: Model, count: number): Html[] =>
  count === 0
    ? []
    : [
        h.button(
          [
            h.Class('group archived-toggle'),
            h.Id('archived-toggle'),
            h.OnClick(Message.ToggledArchived()),
          ],
          [model.showArchived ? `Hide archived ${count}` : `Archived ${count}`],
        ),
      ];

const archivedRows = (h: H, model: Model, archived: readonly ThreadSummary[]): Html[] =>
  model.showArchived
    ? archived.map((thread) =>
        h.keyed('div')(
          `archived-${thread.name}`,
          [h.Class('item archived'), h.DataAttribute('archived', thread.name)],
          [
            h.span([h.Class('t')], [thread.title === '' ? thread.name : thread.title]),
            h.button(
              [
                h.Class('restore'),
                h.OnClick(
                  Message.ClickedOp({
                    name: thread.name,
                    op: { _tag: 'Archive', archived: false },
                  }),
                ),
              ],
              ['Restore'],
            ),
          ],
        ),
      )
    : [];

const threadList = (h: H, model: Model, all: readonly ThreadSummary[]): Html[] => {
  const threads = all.filter((thread) => !thread.archived);
  const archived = all.filter((thread) => thread.archived);

  return [
    ...activeList(h, model, threads),
    ...archivedToggle(h, model, archived.length),
    ...archivedRows(h, model, archived),
  ];
};

const activeList = (h: H, model: Model, threads: readonly ThreadSummary[]): Html[] => {
  if (threads.length === 0)
    return [
      h.div(
        [h.Class('empty inline')],
        [h.div([h.Class('empty-inner')], [h.p([], ['No threads yet.'])])],
      ),
    ];

  const names = new Set(threads.map((thread) => thread.name));
  const children = new Map<string, ThreadSummary[]>();

  for (const thread of threads)
    if (thread.parent !== null && names.has(thread.parent))
      children.set(thread.parent, [...(children.get(thread.parent) ?? []), thread]);

  const roots = threads.filter((thread) => !(thread.parent !== null && names.has(thread.parent)));

  return GROUPS.flatMap(([label, belongs]) => {
    const members = roots.filter(belongs);

    if (members.length === 0) return [];

    return [
      h.div([h.Class('group')], [`${label} ${members.length}`]),
      ...members.flatMap((thread) => [
        row(h, model, thread, false),
        ...(children.get(thread.name) ?? []).map((kid) => row(h, model, kid, true)),
      ]),
    ];
  });
};

const listBody = (h: H, model: Model): Html[] =>
  ThreadsState.match(model.threads, {
    Loading: () => [skeleton(h)],
    Failed: ({ reason }) => [
      h.div(
        [h.Class('err')],
        [
          `Could not load threads. ${reason}`,
          h.button([h.OnClick(Message.ClickedRetryThreads())], ['Retry']),
        ],
      ),
    ],
    Ready: ({ value }) => threadList(h, model, value),
  });

export const spendLabel = (spend: Model['spend']): string => {
  if (spend === null) return '$…';

  const spent = `$${spend.spent.toFixed(2)}`;

  return spend.limit === null ? spent : `${spent} / $${spend.limit.toFixed(0)}`;
};

export const side = (h: H, model: Model): Html =>
  h.aside(
    [h.Class('side')],
    [
      h.div(
        [h.Class('brand')],
        [
          h.a(
            [h.Class('logo'), h.Href('/'), h.AriaLabel('coil')],
            [
              h.img([
                h.Src('/brand/coil-wordmark.svg'),
                h.Alt('coil'),
                h.Width('53'),
                h.Height('16'),
              ]),
            ],
          ),
          h.span(
            [h.Style({ display: 'flex', gap: '2px', 'align-items': 'center' })],
            [
              h.button(
                [
                  h.Class('narrow'),
                  h.Id('side-close'),
                  h.AriaLabel('Close'),
                  h.OnClick(Message.ClosedDrawer()),
                ],
                ['✕'],
              ),
              h.button(
                [
                  h.Class('new'),
                  h.Id('new-side'),
                  h.DataAttribute('tip', 'New thread'),
                  h.AriaLabel('New thread'),
                  h.OnClick(Message.ClickedNewThread()),
                ],
                ['+'],
              ),
            ],
          ),
        ],
      ),
      h.nav([h.Class('list'), h.Id('list'), h.AriaLabel('Threads')], listBody(h, model)),
      h.div(
        [h.Class('who')],
        [
          h.span(
            [
              h.Id('whoami'),
              h.DataAttribute('tip', 'Cloudflare account · AI Gateway coil bills to'),
            ],
            [signedInLabel(model)],
          ),
          ...signOut(h, model.who),
          h.button(
            [
              h.Id('spend'),
              h.Class('spend'),
              h.Title('Your spend across all threads. Click to set a limit.'),
              h.OnClick(Message.ClickedSpendLimit()),
            ],
            [spendLabel(model.spend)],
          ),
          h.button(
            [
              h.Id('notify'),
              h.Hidden(model.notify !== 'default'),
              h.DataAttribute('tip', 'Get a notification when a thread or loop finishes'),
              h.OnClick(Message.ClickedNotify()),
            ],
            ['Notify me'],
          ),
          h.button(
            [
              h.Id('install'),
              h.Hidden(!model.installable),
              h.DataAttribute('tip', 'Install coil as an app'),
              h.OnClick(Message.ClickedInstall()),
            ],
            ['Install'],
          ),
          h.button(
            [
              h.Id('theme'),
              h.DataAttribute('tip', 'Switch light or dark'),
              h.AriaLabel('Theme'),
              h.OnClick(Message.ClickedTheme()),
            ],
            ['◐'],
          ),
        ],
      ),
    ],
  );
