import { Option } from 'effect';
import type { Html } from 'foldkit/html';
import type { Folder, ThreadSummary } from '../../../shared/protocol';
import { folderTarget, NEW_FOLDER_TARGET, RECENT_TARGET } from '../folder-drop';
import { liveCount, type Section, sectionsFor } from '../folders';
import { Message } from '../message';
import { type Model, ThreadsState } from '../model';
import { pathForThread } from '../route';
import { type H, icon, phaseKey, phaseLabel, short, skeleton } from './parts';

const matches = (filter: string) => {
  const needle = filter.trim().toLowerCase();

  return (thread: ThreadSummary) =>
    needle === '' ||
    thread.title.toLowerCase().includes(needle) ||
    thread.name.toLowerCase().includes(needle) ||
    (thread.repo ?? '').toLowerCase().includes(needle);
};

const moveItems = (h: H, thread: ThreadSummary): Html[] => [
  h.button(
    [
      h.Role('menuitem'),
      h.DataAttribute('op', 'move'),
      h.OnClick(Message.OpenedMovePicker({ name: thread.name })),
    ],
    ['Move to…'],
  ),
];

const rowMenu = (h: H, thread: ThreadSummary): Html =>
  h.div(
    [
      h.Class('row-menu'),
      h.Role('menu'),
      h.DataAttribute('menu-for', thread.name),
      h.DataAttribute('popover', 'row'),
    ],
    [
      ...moveItems(h, thread),
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
  const open = isOpen(model, `group:${label}`);

  return h.button(
    [
      h.Class(`group${open ? ' open' : ''}`),
      h.Type('button'),
      h.DataAttribute('group', label),
      h.AriaExpanded(open),
      h.OnClick(Message.ToggledCollapsed({ key: `group:${label}` })),
    ],
    [`${label} ${count}`],
  );
};

const row = (h: H, model: Model, thread: ThreadSummary, child: boolean, kids = 0): Html =>
  h.keyed('div')(
    thread.name,
    [
      h.Class(
        `row${model.rowMenu === thread.name ? ' menu-open' : ''}${
          model.dragging?.kind === 'thread' && model.dragging.id === thread.name ? ' dragging' : ''
        }`,
      ),
      h.Draggable(true),
      h.OnDragStart(Message.StartedDrag({ drag: { kind: 'thread', id: thread.name } })),
      h.OnDragEnd(Message.EndedDrag()),
    ],
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
          h.DataAttribute('popover', 'row'),
          h.OnClick(Message.ToggledRowMenu({ name: thread.name })),
        ],
        [icon(h, 'more')],
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

const dropZone =
  (target: string, place: 'into' | 'before' | 'after' = 'into') =>
  (h: H) => [
    h.AllowDrop(),
    h.OnDragEnter(Message.EnteredDrop({ target })),
    h.OnDrop(Message.DroppedOn({ target, place })),
  ];

const isTarget = (model: Model, target: string) =>
  model.dragging !== null && model.dropTarget === target;

const signals = (h: H, threads: readonly ThreadSummary[]): Html[] => {
  const { busy, failed } = liveCount(threads);

  return [
    ...(busy > 0 ? [h.span([h.Class('dot busy'), h.AriaLabel(`${busy} working`)], [])] : []),
    ...(failed > 0 ? [h.span([h.Class('dot failed'), h.AriaLabel(`${failed} failed`)], [])] : []),
  ];
};

const folderEdit = (h: H, folder: Folder): Html =>
  h.input([
    h.Class('folder-edit'),
    h.Id(`folder-edit-${folder.id}`),
    h.Value(folder.name),
    h.Autofocus(true),
    h.AriaLabel('Folder name'),
    h.OnChange((value) => Message.RenamedFolder({ id: folder.id, name: value })),
    h.OnKeyDownPreventDefault((key) =>
      key === 'Escape' ? Option.some(Message.CancelledFolderRename()) : Option.none(),
    ),
  ]);

const folderHeader = (h: H, model: Model, section: Extract<Section, { kind: 'folder' }>): Html => {
  const open = isOpen(model, section.key);
  const target = folderTarget(section.folder.id);
  const draggingFolder = model.dragging?.kind === 'folder';
  const editing = model.editingFolder === section.folder.id;

  return h.keyed('div')(
    section.key,
    [
      h.Class(
        `folder-head${isTarget(model, target) ? (draggingFolder ? ' drop-line' : ' drop-into') : ''}${
          model.dragging?.kind === 'folder' && model.dragging.id === section.folder.id
            ? ' dragging'
            : ''
        }`,
      ),
      h.DataAttribute('folder', section.folder.id),
      h.Draggable(!editing),
      h.OnDragStart(Message.StartedDrag({ drag: { kind: 'folder', id: section.folder.id } })),
      h.OnDragEnd(Message.EndedDrag()),
      ...dropZone(target, draggingFolder ? 'before' : 'into')(h),
    ],
    [
      editing
        ? folderEdit(h, section.folder)
        : h.button(
            [
              h.Class(`group folder${open ? ' open' : ''}`),
              h.Type('button'),
              h.AriaExpanded(open),
              h.Title('Double-click to rename'),
              h.OnClick(Message.ToggledCollapsed({ key: section.key })),
              h.OnDoubleClick(Message.StartedFolderRename({ id: section.folder.id })),
            ],
            [
              h.span([h.Class('folder-name')], [section.label]),
              h.span([h.Class('folder-count')], [String(section.threads.length)]),
              ...signals(h, section.threads),
            ],
          ),
      h.button(
        [
          h.Class('folder-act'),
          h.Type('button'),
          h.AriaLabel(`Rename ${section.label}`),
          h.OnClick(Message.StartedFolderRename({ id: section.folder.id })),
        ],
        [icon(h, 'rename')],
      ),
      h.button(
        [
          h.Class('folder-act'),
          h.Type('button'),
          h.AriaLabel(`Delete ${section.label}`),
          h.OnClick(Message.ClickedDeleteFolder({ id: section.folder.id })),
        ],
        [icon(h, 'close')],
      ),
    ],
  );
};

const sectionRows = (
  h: H,
  model: Model,
  section: Section,
  children: ReadonlyMap<string, readonly ThreadSummary[]>,
): Html[] =>
  section.threads.flatMap((thread) => {
    const kids = children.get(thread.name) ?? [];
    const shown = isOpen(model, kidsKey(thread.name)) ? kids : [];

    return [
      row(h, model, thread, false, kids.length),
      ...shown.map((kid) => row(h, model, kid, true)),
    ];
  });

const recentHeader = (h: H, model: Model): Html =>
  h.keyed('div')(
    'recent-head',
    [
      h.Class(`section-label${isTarget(model, RECENT_TARGET) ? ' drop-into' : ''}`),
      ...(model.dragging?.kind === 'thread' ? dropZone(RECENT_TARGET)(h) : []),
    ],
    ['Recent'],
  );

const newFolderSlot = (h: H, model: Model): Html =>
  h.keyed('div')(
    'new-folder',
    [
      h.Class(
        `new-folder${model.dragging?.kind === 'thread' ? ' armed' : ''}${
          isTarget(model, NEW_FOLDER_TARGET) ? ' drop-into' : ''
        }`,
      ),
      ...(model.dragging?.kind === 'thread' ? dropZone(NEW_FOLDER_TARGET)(h) : []),
    ],
    [
      h.button(
        [h.Type('button'), h.Id('new-folder'), h.OnClick(Message.ClickedNewFolder())],
        [model.dragging?.kind === 'thread' ? 'Drop here for a new folder' : '+ New folder'],
      ),
    ],
  );

const activeList = (h: H, model: Model, threads: readonly ThreadSummary[]): Html[] => {
  const filtering = model.listFilter.trim() !== '';

  if (threads.length === 0 && (filtering || model.folders.length === 0))
    return [
      h.div(
        [h.Class('empty inline')],
        [
          h.div(
            [h.Class('empty-inner')],
            [h.p([], [filtering ? 'No threads match.' : 'No threads yet.'])],
          ),
        ],
      ),
      ...(filtering ? [] : [newFolderSlot(h, model)]),
    ];

  const names = new Set(threads.map((thread) => thread.name));
  const children = new Map<string, ThreadSummary[]>();

  for (const thread of threads)
    if (thread.parent !== null && names.has(thread.parent))
      children.set(thread.parent, [...(children.get(thread.parent) ?? []), thread]);

  const roots = threads.filter((thread) => !(thread.parent !== null && names.has(thread.parent)));
  const sections = sectionsFor(roots, model.folders, model.now, !filtering);
  const firstRecent = sections.findIndex((section) => section.kind === 'recent');

  return sections
    .flatMap((section, index) => {
      const lead =
        index === firstRecent
          ? [...(filtering ? [] : [newFolderSlot(h, model)]), recentHeader(h, model)]
          : [];
      const header =
        section.kind === 'folder'
          ? folderHeader(h, model, section)
          : groupHeader(h, model, section.label, section.threads.length);
      const body = isOpen(model, section.key) ? sectionRows(h, model, section, children) : [];

      return [...lead, header, ...body];
    })
    .concat(firstRecent === -1 && !filtering ? [newFolderSlot(h, model)] : []);
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

export const side = (h: H, model: Model): Html =>
  h.aside(
    [h.Class('side')],
    [
      h.div(
        [h.Class('brand')],
        [
          h.button(
            [
              h.Class('narrow'),
              h.Id('side-menu'),
              h.AriaLabel('Close threads'),
              h.OnClick(Message.ClosedDrawer()),
            ],
            [icon(h, 'menu')],
          ),
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
          h.button(
            [
              h.Class('new'),
              h.Id('new-side'),
              h.DataAttribute('tip', 'New thread'),
              h.AriaLabel('New thread'),
              h.OnClick(Message.ClickedNewThread()),
            ],
            [icon(h, 'plus')],
          ),
          h.button(
            [
              h.Class('narrow'),
              h.Id('side-close'),
              h.AriaLabel('Close'),
              h.OnClick(Message.ClosedDrawer()),
            ],
            [icon(h, 'close')],
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
          h.button(
            [
              h.Id('settings-open'),
              h.Class('settings-open'),
              h.AriaLabel('Settings'),
              h.DataAttribute('tip', 'Settings (⌘,)'),
              h.Attribute('aria-keyshortcuts', 'Meta+Comma Control+Comma'),
              h.OnClick(Message.OpenedSettings({ section: null })),
            ],
            [icon(h, 'settings')],
          ),
        ],
      ),
    ],
  );
