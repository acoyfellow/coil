import type { Html } from 'foldkit/html';
import type { DirEntry, Surface, ThreadView } from '../../../shared/protocol';
import { Message } from '../message';
import { FileView, type Model, ViewState } from '../model';
import { BrowserSurface, TerminalSurface } from '../mount';
import { pathForThread } from '../route';
import { editorPane } from './editor';
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
              [icon(h, 'close')],
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
          h.button(
            [h.OnClick(Message.ClickedAddSurface({ kind: 'terminal' }))],
            [icon(h, 'terminal'), 'Terminal'],
          ),
          h.button(
            [h.OnClick(Message.ClickedAddSurface({ kind: 'browser' }))],
            [icon(h, 'browser'), 'Browser'],
          ),
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
          tab(h, model, 'files', 'Files', false, 'folder'),
          ...surfaces.map((surface) => tab(h, model, surface.id, surface.title, true, null)),
          ...(view === null ? [] : [addMenu(h, model, surfaces)]),
        ],
      ),
      h.button(
        [h.Class('narrow panel-close'), h.AriaLabel('Close'), h.OnClick(Message.ClosedDrawer())],
        [icon(h, 'close')],
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
    [
      isDir ? icon(h, 'folder') : h.span([h.Class('icon-gap')], []),
      `${entry.name}${isDir ? '/' : ''}`,
      ...(entry.pending === true && !isDir ? [pendingMark(h)] : []),
    ],
  );
};

const pendingMark = (h: H): Html =>
  h.span(
    [
      h.Class('pending-mark'),
      h.DataAttribute(
        'tip',
        'Saved while the computer was asleep. It goes onto the disk when the computer starts.',
      ),
      h.AriaLabel('Saved while asleep'),
    ],
    [icon(h, 'cloud-upload')],
  );

const fileDialog = (h: H, label: string, children: readonly Html[]): Html =>
  h.div(
    [h.Class('dialog-backdrop editor-backdrop'), h.OnClick(Message.RequestedCloseFile())],
    [
      h.div(
        [
          h.Class('dialog editor-dialog'),
          h.Id('file-dialog'),
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabel(label),
          h.OnClick(Message.CompletedEffect(), { propagation: 'Stop' }),
        ],
        children,
      ),
    ],
  );

export const fileModal = (h: H, model: Model): Html =>
  FileView.match(model.file, {
    Closed: () => null,
    Loading: ({ path }) =>
      fileDialog(h, path, [
        h.div(
          [h.Class('editor-bar')],
          [
            h.span([h.Class('editor-path')], [path]),
            h.button(
              [h.Class('icon-btn'), h.AriaLabel('Close file'), h.OnClick(Message.ClosedFile())],
              [icon(h, 'close')],
            ),
          ],
        ),
        skeleton(h),
      ]),
    Loaded: ({ path, text }) =>
      fileDialog(h, path, [h.pre([h.Class('viewer')], [text === '' ? '(empty file)' : text])]),
    Editing: (file) => fileDialog(h, file.active, [editorPane(h, model, file)]),
  });

const historyButton = (h: H): Html =>
  h.button(
    [
      h.Class('history-open'),
      h.DataAttribute('tip', 'Turns, forks and rewind'),
      h.AriaLabel('History'),
      h.OnClick(Message.OpenedHistory()),
    ],
    [icon(h, 'history'), h.span([], ['History'])],
  );

export const historyModal = (h: H, model: Model): Html => {
  const view = model.view._tag === 'Ready' ? model.view.value : null;

  if (!model.historyOpen || view === null) return null;

  return h.div(
    [h.Class('dialog-backdrop'), h.OnClick(Message.ClosedHistory())],
    [
      h.div(
        [
          h.Class('dialog history-dialog'),
          h.Id('history'),
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabel('History'),
          h.OnClick(Message.CompletedEffect(), { propagation: 'Stop' }),
        ],
        [
          h.div(
            [h.Class('dialog-head')],
            [
              h.h2([], ['History']),
              h.button(
                [h.Class('icon-btn'), h.AriaLabel('Close'), h.OnClick(Message.ClosedHistory())],
                [icon(h, 'close')],
              ),
            ],
          ),
          h.div([h.Class('history-body')], [history(h, model, view)]),
        ],
      ),
    ],
  );
};

const treeBody = (h: H, model: Model): Html[] => {
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
};

const files = (h: H, model: Model): Html => {
  const body = treeBody(h, model);

  const empty = model.entries._tag === 'Ready' && model.entries.value.length === 0;

  return h.div(
    [h.Class(empty ? 'files is-empty' : 'files')],
    [h.div([h.Class('files-head')], [crumbs(h, model.dirPath), historyButton(h)]), ...body],
  );
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
        [h.Class('surface browser-surface'), h.OnMount(BrowserSurface({ thread: view.name }))],
        [],
      )
    : h.keyed('div')(
        `term-${view.name}-${surface.id}`,
        [
          h.Class('surface term-surface'),
          h.OnMount(TerminalSurface({ thread: view.name, id: surface.id })),
        ],
        [],
      );

const pane = (h: H, model: Model): Html[] => {
  if (model.name === null) return [];

  return ViewState.match(model.view, {
    Loading: () => [skeleton(h)],
    Failed: () => [h.div([h.Class('err')], ['This thread is unavailable.'])],
    Ready: ({ value }) => {
      const surface = value.surfaces.find((each) => each.id === model.tab);

      if (surface !== undefined) return [surfacePane(h, value, surface)];

      return [files(h, model)];
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
