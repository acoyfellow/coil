import type { ThreadSummary } from '../../shared/protocol';

export type Finished = {
  readonly name: string;
  readonly title: string;
  readonly why: 'turn' | 'loop' | 'waiting';
};

export const finishedThreads = (
  before: readonly ThreadSummary[],
  after: readonly ThreadSummary[],
): Finished[] => {
  const previous = new Map(before.map((thread) => [thread.name, thread]));

  return after.flatMap((thread): Finished[] => {
    const old = previous.get(thread.name);

    if (old === undefined) return [];
    if ((thread.waiting ?? 0) > (old.waiting ?? 0))
      return [{ name: thread.name, title: thread.title, why: 'waiting' }];
    if (old.looping && !thread.looping)
      return [{ name: thread.name, title: thread.title, why: 'loop' }];
    if (old.busy && !thread.busy && !thread.looping)
      return [{ name: thread.name, title: thread.title, why: 'turn' }];

    return [];
  });
};
