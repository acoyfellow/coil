import * as Domain from '@alchemy.run/domain';
import { ArchiveThread, ThreadArchived } from './ArchiveThread.command.ts';
import { AttachRepo, RepoAttached } from './AttachRepo.command.ts';
import { CreateThread, ThreadCreated } from './CreateThread.command.ts';
import { FinishTurn, TurnFinished } from './FinishTurn.command.ts';
import { PauseThread, ThreadPaused } from './PauseThread.command.ts';
import { BrowserReset, ResetBrowser } from './ResetBrowser.command.ts';
import { StartTurn, TurnStarted } from './StartTurn.command.ts';
import { ThreadId } from './Thread.id.ts';
import { AlreadyCreated, Archived, Busy, NotCreated } from './ThreadRejections.rejection.ts';
import { type Live, ThreadState } from './ThreadState.ts';
import { ThreadWoke, WakeThread } from './WakeThread.command.ts';

const created = (s: ThreadState): Live | NotCreated => (s._tag === 'Unborn' ? new NotCreated() : s);

const usable = (s: ThreadState): Exclude<Live, { _tag: 'Archived' }> | NotCreated | Archived => {
  const live = created(s);

  if (live._tag === 'NotCreated') return live;

  return live._tag === 'Archived' ? new Archived() : live;
};

const idle = (s: ThreadState) => {
  const live = usable(s);

  if (live._tag === 'NotCreated' || live._tag === 'Archived') return live;

  return live._tag === 'Working' ? new Busy() : live;
};

const common = (s: Live) => ({
  owner: s.owner,
  title: s.title,
  repo: s.repo,
  browserGeneration: s.browserGeneration,
});

export class Thread extends Domain.Aggregate('Thread', {
  id: ThreadId,
  state: ThreadState,
  initial: { _tag: 'Unborn' },
  commands: [
    CreateThread,
    WakeThread,
    PauseThread,
    StartTurn,
    FinishTurn,
    AttachRepo,
    ResetBrowser,
    ArchiveThread,
  ],
  decide: {
    CreateThread: (s, cmd) =>
      s._tag !== 'Unborn'
        ? new AlreadyCreated()
        : [new ThreadCreated({ owner: cmd.owner, title: cmd.title, repo: cmd.repo })],
    WakeThread: (s) => {
      const live = usable(s);

      if (live._tag === 'NotCreated' || live._tag === 'Archived') return live;

      return live._tag === 'Paused' ? [new ThreadWoke()] : [];
    },
    PauseThread: (s) => {
      const live = created(s);

      if (live._tag === 'NotCreated') return live;
      if (live._tag === 'Working') return new Busy();

      return live._tag === 'Awake' ? [new ThreadPaused()] : [];
    },
    StartTurn: (s, cmd) => {
      const live = idle(s);

      if (live._tag === 'NotCreated' || live._tag === 'Archived' || live._tag === 'Busy')
        return live;

      const started = new TurnStarted({ turn: cmd.turn, text: cmd.text });

      return live._tag === 'Paused' ? [new ThreadWoke(), started] : [started];
    },
    FinishTurn: (s, cmd) =>
      s._tag === 'Working' && s.turn === cmd.turn
        ? [new TurnFinished({ turn: cmd.turn, outcome: cmd.outcome })]
        : [],
    AttachRepo: (s, cmd) => {
      const live = usable(s);

      if (live._tag === 'NotCreated' || live._tag === 'Archived') return live;

      return live.repo === cmd.repo ? [] : [new RepoAttached({ repo: cmd.repo })];
    },
    ResetBrowser: (s) => {
      const live = usable(s);

      if (live._tag === 'NotCreated' || live._tag === 'Archived') return live;

      return [new BrowserReset({ generation: live.browserGeneration + 1 })];
    },
    ArchiveThread: (s) => {
      const live = created(s);

      if (live._tag === 'NotCreated') return live;
      if (live._tag === 'Working') return new Busy();

      return live._tag === 'Archived' ? [] : [new ThreadArchived()];
    },
  },
  evolve: {
    ThreadCreated: (_, e) => ({
      _tag: 'Paused' as const,
      owner: e.owner,
      title: e.title,
      repo: e.repo,
      browserGeneration: 0,
    }),
    ThreadWoke: (s) => (s._tag === 'Paused' ? { ...common(s), _tag: 'Awake' as const } : s),
    ThreadPaused: (s) => (s._tag === 'Awake' ? { ...common(s), _tag: 'Paused' as const } : s),
    TurnStarted: (s, e) =>
      s._tag === 'Awake' ? { ...common(s), _tag: 'Working' as const, turn: e.turn } : s,
    TurnFinished: (s) => (s._tag === 'Working' ? { ...common(s), _tag: 'Awake' as const } : s),
    RepoAttached: (s, e) => (s._tag === 'Unborn' ? s : { ...s, repo: e.repo }),
    BrowserReset: (s, e) => (s._tag === 'Unborn' ? s : { ...s, browserGeneration: e.generation }),
    ThreadArchived: (s) =>
      s._tag === 'Unborn' || s._tag === 'Working' ? s : { ...common(s), _tag: 'Archived' as const },
  },
  reply: {
    ResetBrowser: (s) => ({ generation: s._tag === 'Unborn' ? 0 : s.browserGeneration }),
  },
}) {}

export { ThreadArchived, RepoAttached, ThreadCreated, TurnFinished, ThreadPaused, BrowserReset, TurnStarted, ThreadWoke };
