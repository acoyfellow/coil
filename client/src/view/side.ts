import type { Html } from 'foldkit/html';
import type { ThreadSummary } from '../../../shared/protocol';
import { Message } from '../message';
import { type Model, ThreadsState } from '../model';
import { pathForThread } from '../route';
import { type H, phaseKey, phaseLabel, short, skeleton } from './parts';

const DAY_MS = 86_400_000;

const startOfDay = (now: number) => {
  const day = new Date(now);

  day.setHours(0, 0, 0, 0);

  return day.getTime();
};

const groupsFor = (now: number): readonly [string, (thread: ThreadSummary) => boolean][] => {
  const today = startOfDay(now);
  const yesterday = today - DAY_MS;
  const week = today - 6 * DAY_MS;
  const unpinned = (thread: ThreadSummary) => thread.pinned !== true;

  return [
    ['Pinned', (thread) => thread.pinned === true],
    ['Today', (thread) => unpinned(thread) && thread.updatedAt >= today],
    [
      'Yesterday',
      (thread) => unpinned(thread) && thread.updatedAt >= yesterday && thread.updatedAt < today,
    ],
    [
      'Previous 7 days',
      (thread) => unpinned(thread) && thread.updatedAt >= week && thread.updatedAt < yesterday,
    ],
    ['Earlier', (thread) => unpinned(thread) && thread.updatedAt < week],
  ];
};

const matches = (filter: string) => {
  const needle = filter.trim().toLowerCase();

  return (thread: ThreadSummary) =>
    needle === '' ||
    thread.title.toLowerCase().includes(needle) ||
    thread.name.toLowerCase().includes(needle) ||
    (thread.repo ?? '').toLowerCase().includes(needle);
};

const rowMenu = (h: H, thread: ThreadSummary): Html =>
  h.div(
    [h.Class('row-menu'), h.Role('menu'), h.DataAttribute('menu-for', thread.name)],
    [
      h.button(
        [
          h.Role('menuitem'),
          h.DataAttribute('op', 'pin'),
          h.OnClick(
            Message.ClickedOp({
              name: thread.name,
              op: { _tag: 'Pin', pinned: thread.pinned !== true },
            }),
          ),
        ],
        [thread.pinned === true ? 'Unpin' : 'Pin'],
      ),
      h.button(
        [
          h.Role('menuitem'),
          h.DataAttribute('op', 'rename'),
          h.OnClick(Message.ClickedOp({ name: thread.name, op: { _tag: 'Rename' } })),
        ],
        ['Rename'],
      ),
      h.button(
        [
          h.Role('menuitem'),
          h.DataAttribute('op', 'archive'),
          h.OnClick(
            Message.ClickedOp({ name: thread.name, op: { _tag: 'Archive', archived: true } }),
          ),
        ],
        ['Archive'],
      ),
    ],
  );

const rowTitle = (thread: ThreadSummary): string =>
  [
    thread.title,
    phaseLabel(thread),
    thread.forkedFrom === null ? null : `fork of ${thread.forkedFrom}`,
    thread.createdBy === 'web' ? null : `via ${thread.createdBy}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

const isOpen = (model: Model, key: string) =>
  model.listFilter.trim() !== '' || !model.collapsed.includes(key);

const groupKey = (label: string) => `group:${label}`;

const kidsKey = (name: string) => `kids:${name}`;

const kidsToggle = (h: H, model: Model, thread: ThreadSummary, kids: number): Html[] => {
  if (kids === 0) return [];

  const open = isOpen(model, kidsKey(thread.name));

  return [
    h.button(
      [
        h.Class(`kids-toggle${open ? ' open' : ''}`),
        h.Type('button'),
        h.DataAttribute('kids-for', thread.name),
        h.AriaExpanded(open),
        h.AriaLabel(`${open ? 'Hide' : 'Show'} ${kids} child thread${kids === 1 ? '' : 's'}`),
        h.OnClick(Message.ToggledCollapsed({ key: kidsKey(thread.name) })),
      ],
      [],
    ),
  ];
};

const groupHeader = (h: H, model: Model, label: string, count: number): Html => {
  const open = isOpen(model, groupKey(label));

  return h.button(
    [
      h.Class(`group${open ? ' open' : ''}`),
      h.Type('button'),
      h.DataAttribute('group', label),
      h.AriaExpanded(open),
      h.OnClick(Message.ToggledCollapsed({ key: groupKey(label) })),
    ],
    [`${label} ${count}`],
  );
};

const row = (h: H, model: Model, thread: ThreadSummary, child: boolean, kids = 0): Html =>
  h.keyed('div')(
    thread.name,
    [h.Class(`row${model.rowMenu === thread.name ? ' menu-open' : ''}`)],
    [
      ...kidsToggle(h, model, thread, kids),
      h.a(
        [
          h.Class(`item${thread.name === model.name ? ' on' : ''}${child ? ' child' : ''}`),
          h.Href(pathForThread(thread.name)),
          h.DataAttribute('thread', thread.name),
          h.Title(rowTitle(thread)),
          h.OnClick(Message.ClickedThread({ name: thread.name }), { defaultAction: 'Prevent' }),
        ],
        [
          h.span([h.Class(`dot ${phaseKey(thread)}`), h.AriaLabel(phaseLabel(thread))], []),
          h.span([h.Class('t')], [thread.title === '' ? thread.name : thread.title]),
          h.span([h.Class('m')], [short(model.now, thread.updatedAt)]),
        ],
      ),
      h.button(
        [
          h.Class('row-more'),
          h.Type('button'),
          h.AriaLabel(`Actions for ${thread.title === '' ? thread.name : thread.title}`),
          h.AriaExpanded(model.rowMenu === thread.name),
          h.OnClick(Message.ToggledRowMenu({ name: thread.name })),
        ],
        ['⋯'],
      ),
      ...(model.rowMenu === thread.name ? [rowMenu(h, thread)] : []),
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
            h.Class(`group archived-toggle${model.showArchived ? ' open' : ''}`),
            h.Id('archived-toggle'),
            h.Type('button'),
            h.AriaExpanded(model.showArchived),
            h.OnClick(Message.ToggledArchived()),
          ],
          [`Archived ${count}`],
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

const filterBox = (h: H, model: Model): Html =>
  h.input([
    h.Class('list-filter'),
    h.Id('list-filter'),
    h.Type('search'),
    h.Placeholder('Filter threads'),
    h.AriaLabel('Filter threads'),
    h.Value(model.listFilter),
    h.OnInput((value) => Message.UpdatedListFilter({ value })),
  ]);

const threadList = (h: H, model: Model, all: readonly ThreadSummary[]): Html[] => {
  const threads = all.filter((thread) => !thread.archived && matches(model.listFilter)(thread));
  const archived = all.filter((thread) => thread.archived);

  return [
    ...(all.length === 0 ? [] : [filterBox(h, model)]),
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
        [
          h.div(
            [h.Class('empty-inner')],
            [h.p([], [model.listFilter.trim() === '' ? 'No threads yet.' : 'No threads match.'])],
          ),
        ],
      ),
    ];

  const names = new Set(threads.map((thread) => thread.name));
  const children = new Map<string, ThreadSummary[]>();

  for (const thread of threads)
    if (thread.parent !== null && names.has(thread.parent))
      children.set(thread.parent, [...(children.get(thread.parent) ?? []), thread]);

  const roots = threads.filter((thread) => !(thread.parent !== null && names.has(thread.parent)));

  return groupsFor(model.now).flatMap(([label, belongs]) => {
    const members = roots.filter(belongs);

    if (members.length === 0) return [];

    const header = groupHeader(h, model, label, members.length);

    if (!isOpen(model, groupKey(label))) return [header];

    return [
      header,
      ...members.flatMap((thread) => {
        const kids = children.get(thread.name) ?? [];
        const shown = isOpen(model, kidsKey(thread.name)) ? kids : [];

        return [
          row(h, model, thread, false, kids.length),
          ...shown.map((kid) => row(h, model, kid, true)),
        ];
      }),
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
              h.DataAttribute('tip', 'Get a notification when a thread or loop finishes (⌘⇧N)'),
              h.Attribute('aria-keyshortcuts', 'Meta+Shift+N Control+Shift+N'),
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
