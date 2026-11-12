import * as Domain from '@alchemy.run/domain';
import { Story } from '@alchemy.run/domain/Story';
import { expect, it } from '@effect/vitest';
import { Coil } from '../src/Coil.model.ts';
import { ArchiveThread } from '../src/Thread/ArchiveThread.command.ts';
import { AttachRepo } from '../src/Thread/AttachRepo.command.ts';
import { CreateThread } from '../src/Thread/CreateThread.command.ts';
import { FinishTurn } from '../src/Thread/FinishTurn.command.ts';
import { PauseThread } from '../src/Thread/PauseThread.command.ts';
import { ResetBrowser } from '../src/Thread/ResetBrowser.command.ts';
import { StartTurn } from '../src/Thread/StartTurn.command.ts';
import {
  BrowserReset,
  RepoAttached,
  Thread,
  ThreadArchived,
  ThreadCreated,
  ThreadPaused,
  ThreadWoke,
  TurnFinished,
  TurnStarted,
} from '../src/Thread/Thread.aggregate.ts';
import { AlreadyCreated, Archived, Busy, NotCreated } from '../src/Thread/ThreadRejections.rejection.ts';
import { WakeThread } from '../src/Thread/WakeThread.command.ts';

const story = Story.make(Coil);
const t1 = Thread.ref('t-1');
const born = new ThreadCreated({ owner: 'jordan', title: 'demo', repo: null });

it('has no definition problems', () => {
  expect(Domain.verify(Coil)).toEqual([]);
});

it.effect('creates a thread once and refuses a second create', () =>
  story(
    Story.when(t1, new CreateThread({ owner: 'jordan', title: 'demo', repo: null })),
    Story.then(t1, born),
    Story.when(t1, new CreateThread({ owner: 'jordan', title: 'again', repo: null })),
    Story.rejected(new AlreadyCreated()),
  ),
);

it.effect('refuses work on a thread that does not exist', () =>
  story(Story.when(t1, new WakeThread({})), Story.rejected(new NotCreated())),
);

it.effect('wakes a paused thread when a turn starts and refuses a second turn', () =>
  story(
    Story.given(t1, born),
    Story.when(t1, new StartTurn({ turn: 'u1', text: 'hi' })),
    Story.then(t1, new ThreadWoke({}), new TurnStarted({ turn: 'u1', text: 'hi' })),
    Story.when(t1, new StartTurn({ turn: 'u2', text: 'again' })),
    Story.rejected(new Busy()),
    Story.when(t1, new PauseThread({})),
    Story.rejected(new Busy()),
  ),
);

it.effect('finishes only the running turn, then pauses', () =>
  story(
    Story.given(t1, born, new ThreadWoke({}), new TurnStarted({ turn: 'u1', text: 'hi' })),
    Story.when(t1, new FinishTurn({ turn: 'stale', outcome: 'done' })),
    Story.then(t1),
    Story.when(t1, new FinishTurn({ turn: 'u1', outcome: 'done' })),
    Story.then(t1, new TurnFinished({ turn: 'u1', outcome: 'done' })),
    Story.when(t1, new PauseThread({})),
    Story.then(t1, new ThreadPaused({})),
    Story.state(t1, { _tag: 'Paused' }),
  ),
);

it.effect('attaches a repo after creation, once per repo', () =>
  story(
    Story.given(t1, born),
    Story.when(t1, new AttachRepo({ repo: 'https://github.com/o/r' })),
    Story.then(t1, new RepoAttached({ repo: 'https://github.com/o/r' })),
    Story.when(t1, new AttachRepo({ repo: 'https://github.com/o/r' })),
    Story.then(t1),
    Story.state(t1, { repo: 'https://github.com/o/r' }),
  ),
);

it.effect('revives the browser with a new generation and keeps the thread state', () =>
  story(
    Story.given(t1, born, new ThreadWoke({})),
    Story.when(t1, new ResetBrowser({})),
    Story.then(t1, new BrowserReset({ generation: 1 })),
    Story.replied({ generation: 1 }),
    Story.when(t1, new ResetBrowser({})),
    Story.then(t1, new BrowserReset({ generation: 2 })),
    Story.replied({ generation: 2 }),
    Story.state(t1, { _tag: 'Awake', browserGeneration: 2 }),
  ),
);

it.effect('archives an idle thread and refuses work after', () =>
  story(
    Story.given(t1, born),
    Story.when(t1, new ArchiveThread({})),
    Story.then(t1, new ThreadArchived({})),
    Story.when(t1, new StartTurn({ turn: 'u1', text: 'hi' })),
    Story.rejected(new Archived()),
    Story.when(t1, new ResetBrowser({})),
    Story.rejected(new Archived()),
  ),
);
