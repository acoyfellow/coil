import type { Html, HtmlBuilder } from 'foldkit/html';
import { ICONS } from '../../../src/ui/icons.generated';
import type { Message } from '../message';

export type H = HtmlBuilder<Message>;

export const icon = (h: H, name: string): Html =>
  h.svg(
    [h.ViewBox('0 0 24 24'), h.Class('icon'), h.AriaHidden(true), h.InnerHTML(ICONS[name] ?? '')],
    [],
  );

export const spinner = (h: H): Html => h.span([h.Class('spin')], []);

export const skeleton = (h: H): Html =>
  h.div([h.Class('skeleton')], [h.div([], []), h.div([], []), h.div([], [])]);

export const short = (now: number, at: number): string => {
  const seconds = Math.round((now - at) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;

  return `${Math.round(seconds / 86400)}d`;
};

export const ago = (now: number, at: number): string => {
  const seconds = Math.round((now - at) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;

  return `${Math.round(seconds / 86400)}d ago`;
};

export const bytes = (count: number): string =>
  count >= 1e6 ? `${(count / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(count / 1e3))} KB`;

type Phased = { readonly busy: boolean; readonly phase: string; readonly failed?: boolean };

export const phaseKey = (thread: Phased): string =>
  thread.busy ? 'busy' : thread.failed === true ? 'failed' : thread.phase;

export const phaseLabel = (thread: Phased): string => {
  if (thread.busy) return 'working';
  if (thread.failed === true) return 'last turn failed';

  return (
    ({ new: 'new', awake: 'running', paused: 'paused' } as Record<string, string>)[thread.phase] ??
    thread.phase
  );
};
