import type { ThreadSummary } from '../../shared/protocol';
import { Message } from './message';
import { type Model, ThreadsState } from './model';

export type PaletteItem = {
  readonly label: string;
  readonly hint: string;
  readonly message: Message;
};

const matches = (query: string, ...fields: string[]): boolean => {
  const needle = query.trim().toLowerCase();

  return needle === '' || fields.some((field) => field.toLowerCase().includes(needle));
};

const threadsOf = (model: Model): readonly ThreadSummary[] =>
  ThreadsState.match(model.threads, {
    Loading: () => [],
    Failed: () => [],
    Ready: ({ value }) => value,
  });

const actionsFor = (model: Model): PaletteItem[] => {
  const name = model.name;
  const base: PaletteItem[] = [
    { label: 'New thread', hint: 'command', message: Message.ClickedNewThread() },
    { label: 'Settings', hint: '⌘,', message: Message.OpenedSettings({ section: null }) },
    { label: 'Toggle theme', hint: 'command', message: Message.ClickedTheme() },
    ...(model.connectors
      ? [
          {
            label: 'Connectors',
            hint: 'settings',
            message: Message.OpenedSettings({ section: 'connectors' }),
          },
          ...model.connectorList.map((connector) => ({
            label: `${connector.connected ? 'Disconnect' : 'Connect'} ${connector.id}`,
            hint: 'connector',
            message: Message.ChoseConnectorAction({
              id: connector.id,
              action: connector.connected ? 'disconnect' : 'start',
            }),
          })),
        ]
      : []),
  ];

  if (name === null) return base;

  return [
    ...base,
    {
      label: 'Stop the agent',
      hint: 'command',
      message: Message.ClickedOp({ name, op: { _tag: 'Stop' } }),
    },
    {
      label: 'Rename this thread',
      hint: 'command',
      message: Message.ClickedOp({ name, op: { _tag: 'Rename' } }),
    },
    {
      label: 'Archive this thread',
      hint: 'command',
      message: Message.ClickedOp({ name, op: { _tag: 'Archive', archived: true } }),
    },
    {
      label: 'Share a read-only link',
      hint: 'command',
      message: Message.ClickedOp({ name, op: { _tag: 'Share' } }),
    },
    {
      label: 'Stop every loop (kill switch)',
      hint: 'command',
      message: Message.ClickedKillLoops(),
    },
    { label: 'Compact', hint: 'command', message: Message.ClickedAction({ action: 'compact' }) },
    { label: 'Fork', hint: 'command', message: Message.ClickedAction({ action: 'fork' }) },
    { label: 'Pause', hint: 'command', message: Message.ClickedAction({ action: 'pause' }) },
  ];
};

export const paletteItems = (model: Model, query: string): PaletteItem[] => {
  const threads = threadsOf(model)
    .filter((thread) => matches(query, thread.title, thread.name))
    .slice(0, 12)
    .map((thread) => ({
      label: thread.title === '' ? thread.name : thread.title,
      hint: thread.archived ? 'archived thread' : 'thread',
      message: Message.ClickedThread({ name: thread.name }),
    }));
  const actions = actionsFor(model).filter((item) => matches(query, item.label));

  return [...actions, ...threads];
};
