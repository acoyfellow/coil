import type { Html } from 'foldkit/html';
import type { DirEntry, Surface, ThreadView } from '../../../shared/protocol';
import { Message } from '../message';
import { FileView, type Model, ViewState } from '../model';
import { BrowserSurface, TerminalSurface } from '../mount';
import { pathForThread } from '../route';
import { ago, bytes, type H, icon, phaseLabel, skeleton } from './parts';

const tab = (
  h: H,
  model: Model,
  id: string,
  label: string,
  closable: boolean,
  glyph: string | null,
): Html =>
  h.keyed('span')(
    `tab-${id}`,
    [h.Class(`tab${model.tab === id ? ' on' : ''}`), h.DataAttribute('tab', id)],
    [
      h.button(
        [h.Class('tab-main'), h.OnClick(Message.ClickedTab({ tab: id }))],
        [
          ...(glyph === null ? [] : [icon(h, glyph)]),
          glyph === null ? label : h.span([h.Class('tab-label')], [label]),
        ],
      ),
      ...(closable
        ? [
            h.button(
              [
                h.Class('tab-x'),
                h.DataAttribute('tip', 'Close'),
                h.AriaLabel(`Close ${label}`),
                h.OnClick(Message.ClickedCloseSurface({ id })),
              ],
              ['×'],
            ),
          ]
        : []),
    ],
  );

const addMenu = (h: H, model: Model, surfaces: readonly Surface[]): Html =>
  h.span(
    [h.Class('add-wrap'), h.DataAttribute('popover', 'add')],
    [
      h.button(
        [
          h.Class('tab-add'),
          h.DataAttribute('tip', 'New terminal or browser'),
          h.AriaLabel('Add surface'),
          h.OnClick(Message.ToggledAddMenu()),
        ],
        ['+'],
      ),
      h.div(
        [h.Class('add-menu'), h.Hidden(!model.addMenuOpen)],
        [
          h.button([h.OnClick(Message.ClickedAddSurface({ kind: 'terminal' }))], ['▸_  Terminal']),
          h.button([h.OnClick(Message.ClickedAddSurface({ kind: 'browser' }))], ['◎  Browser']),
        ],
      ),
    ],
  );

const tabs = (h: H, model: Model, view: ThreadView | null): Html => {
  const surfaces = view?.surfaces ?? [];

  return h.div(
    [h.Class('tabs'), h.Id('tabs')],
    [
      h.div(
        [h.Class('tab-strip')],
        [
          ...surfaces.map((surface) =>
            tab(
              h,
              model,
              surface.id,
              `${surface.kind === 'browser' ? '◎ ' : '▸ '}${surface.title}`,
              true,
              null,
            ),
          ),
          ...(view === null ? [] : [addMenu(h, model, surfaces)]),
        ],
      ),
      h.span([h.Class('tab-sep')], []),
      tab(h, model, 'files', 'Files', false, 'files'),
      tab(h, model, 'history', 'History', false, 'history'),
      h.button(
        [h.Class('narrow panel-close'), h.AriaLabel('Close'), h.OnClick(Message.ClosedDrawer())],
        ['✕'],
      ),
    ],
  );
};

const joinPath = (dir: string, name: string): string => (dir === '.' ? name : `${dir}/${name}`);

const crumbs = (h: H, path: string): Html => {
  const parts = path === '.' ? [] : path.split('/');

  return h.div(
    [h.Class('crumbs')],
    [
      h.a([h.OnClick(Message.ClickedDir({ path: '.' }))], ['/workspace']),
      ...parts.flatMap((part, index) => [
        h.span([h.Class('faint')], ['/']),
        h.a([h.OnClick(Message.ClickedDir({ path: parts.slice(0, index + 1).join('/') }))], [part]),
      ]),
    ],
  );
};

const entryRow = (h: H, dir: string, entry: DirEntry): Html => {
  const full = joinPath(dir, entry.name);
  const isDir = entry.type === 'directory';

  return h.keyed('div')(
    full,
    [
      h.Class('row'),
      h.OnClick(isDir ? Message.ClickedDir({ path: full }) : Message.ClickedFile({ path: full })),
    ],
    [h.span([h.Class('faint')], [isDir ? '▸' : '·']), `${entry.name}${isDir ? '/' : ''}`],
  );
};

const files = (h: H, model: Model): Html => {
  const back = h.div(
    [h.Class('row'), h.OnClick(Message.ClosedFile())],
    [`← ${model.dirPath === '.' ? '/workspace' : model.dirPath}`],
  );
  const body = FileView.match(model.file, {
    Loading: () => [back, skeleton(h)],
    Loaded: ({ text }) => [back, h.pre([h.Class('viewer')], [text === '' ? '(empty file)' : text])],
    Closed: () => {
      switch (model.entries._tag) {
        case 'Loading':
          return [skeleton(h)];
        case 'Failed':
          return [
            h.div(
              [h.Class('err')],
              [
                model.entries.reason,
                h.button([h.OnClick(Message.ClickedDir({ path: model.dirPath }))], ['Retry']),
              ],
            ),
          ];
        case 'Ready':
          return model.entries.value.length === 0
            ? [h.div([h.Class('faint'), h.Style({ padding: '8px' })], ['This folder is empty.'])]
            : model.entries.value.map((entry) => entryRow(h, model.dirPath, entry));
      }
    },
  });

  return h.div([h.Class('files')], [crumbs(h, model.dirPath), ...body]);
};

const threadLink = (h: H, name: string, text: string): Html =>
  h.a(
    [
      h.Href(pathForThread(name)),
      h.OnClick(Message.ClickedThread({ name }), { defaultAction: 'Prevent' }),
    ],
    [text],
  );

const lineClass = (line: string): string => {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) return 'dh';
  if (line.startsWith('@@')) return 'dk';
  if (line.startsWith('+')) return 'da';
  if (line.startsWith('-')) return 'dd';

  return '';
};

const diffView = (h: H, diff: string): Html =>
  h.pre(
    [h.Class('diff')],
    diff.split('\n').map((line) => h.span([h.Class(lineClass(line))], [`${line}\n`])),
  );

const history = (h: H, model: Model, view: ThreadView): Html => {
  const origin = view.origin;
  const threads = model.threads._tag === 'Ready' ? model.threads.value : [];
  const kids = threads.filter(
    (thread) => thread.parent === view.name || thread.forkedFrom === view.name,
  );
  const items: Html[] = [
    ...(origin.forkedFrom === null
      ? []
      : [
          h.div(
            [h.Class('tl')],
            [
              h.div(
                [h.Class('h')],
                ['Forked from', threadLink(h, origin.forkedFrom, origin.forkedFrom)],
              ),
            ],
          ),
        ]),
    ...(origin.parent === null
      ? []
      : [
          h.div(
            [h.Class('tl')],
            [h.div([h.Class('h')], ['Child of', threadLink(h, origin.parent, origin.parent)])],
          ),
        ]),
    ...(origin.base !== null && origin.forkedFrom === null && origin.parent === null
      ? [
          h.div(
            [h.Class('tl')],
            [
              h.div(
                [h.Class('h')],
                ['Started warm', h.span([h.Class('faint')], ['prepared base'])],
              ),
              h.div([h.Class('d')], [`snapshot ${origin.base.slice(0, 12)}`]),
            ],
          ),
        ]
      : []),
    ...kids.map((kid) =>
      h.div(
        [h.Class('tl')],
        [
          h.div(
            [h.Class('h')],
            [
              kid.parent === view.name ? 'Child' : 'Fork',
              threadLink(h, kid.name, kid.title === '' ? kid.name : kid.title),
            ],
          ),
          h.div([h.Class('d')], [`${phaseLabel(kid)} · ${ago(model.now, kid.updatedAt)}`]),
        ],
      ),
    ),
    ...view.turns.map((turn) =>
      h.keyed('details')(
        `turn-${turn.seq}`,
        [h.Class('tl turn'), h.DataAttribute('turn', String(turn.seq))],
        [
          h.summary(
            [],
            [
              h.div(
                [h.Class('h')],
                [
                  turn.stat === '' ? 'Turn, no file changes' : 'Turn changed files',
                  h.span([h.Class('faint')], [ago(model.now, turn.at)]),
                ],
              ),
              h.div([h.Class('d')], [turn.prompt]),
            ],
          ),
          ...(turn.diff === '' ? [] : [diffView(h, turn.diff)]),
        ],
      ),
    ),
    ...[...view.pairs]
      .reverse()
      .map((pair) =>
        h.div(
          [h.Class('tl')],
          [
            h.div(
              [h.Class('h')],
              [
                pair.reason === 'compaction' ? 'Compacted' : 'Paused',
                h.span([h.Class('faint')], [ago(model.now, pair.at)]),
              ],
            ),
            h.div(
              [h.Class('d')],
              [
                `disk ${bytes(pair.snapshot.size)} · ${pair.snapshot.id.slice(0, 12)}${pair.summaryEntry === null ? '' : ' · with summary'}`,
              ],
            ),
          ],
        ),
      ),
  ];

  return h.div(
    [h.Class('timeline')],
    items.length === 0
      ? [
          h.div(
            [h.Class('faint')],
            [
              'Nothing saved yet. Pause saves the disk. Compact saves a summary and the disk together. Fork starts a new thread from here.',
            ],
          ),
        ]
      : items,
  );
};

const surfacePane = (h: H, view: ThreadView, surface: Surface): Html =>
  surface.kind === 'browser'
    ? h.keyed('div')(
        `browser-${view.name}-${surface.id}`,
        [
          h.Class('surface browser-surface'),
          h.OnMount(BrowserSurface({ thread: view.name, running: view.running })),
        ],
        [],
      )
    : h.keyed('div')(
        `term-${view.name}-${surface.id}`,
        [
          h.Class('surface term-surface'),
          h.OnMount(TerminalSurface({ thread: view.name, id: surface.id, running: view.running })),
        ],
        [],
      );

const pane = (h: H, model: Model): Html[] => {
  if (model.name === null)
    return [
      h.div(
        [h.Class('empty')],
        [h.div([h.Class('empty-inner')], [h.p([], ['Pick a thread to see its computer.'])])],
      ),
    ];

  return ViewState.match(model.view, {
    Loading: () => [skeleton(h)],
    Failed: () => [h.div([h.Class('err')], ['This thread is unavailable.'])],
    Ready: ({ value }) => {
      const surface = value.surfaces.find((each) => each.id === model.tab);

      if (surface !== undefined) return [surfacePane(h, value, surface)];

      return [model.tab === 'history' ? history(h, model, value) : files(h, model)];
    },
  });
};

export const panel = (h: H, model: Model): Html => {
  const view = model.view._tag === 'Ready' ? model.view.value : null;

  return h.aside(
    [h.Class('panel')],
    [tabs(h, model, view), h.div([h.Class('pane'), h.Id('pane')], pane(h, model))],
  );
};
