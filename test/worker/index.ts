import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import type { ModelChoice, ThreadDirectory } from '../../src/agent';
import { restorableUrl, worthRemembering } from '../../src/browser';
import type { Computer } from '../../src/computer';
import { coil, sharedView } from '../../src/service';
import { type Env, Thread } from '../../src/thread';
import { bootSizes, crash, memoryComputer } from '../memory-computer';

export { Directory } from '../../src/directory';

type Context = {
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content?: unknown }>;
};

const asked = (context: Context): string => {
  const content = [...context.messages].reverse().find((m) => m.role === 'user')?.content;

  if (typeof content === 'string') return content;

  if (Array.isArray(content))
    return content
      .map((part) =>
        typeof part === 'object' && part !== null && 'text' in part ? String(part.text) : '',
      )
      .join('');

  return '';
};

const toolRan = (context: Context) =>
  context.messages.findLast((m) => m.role !== 'system')?.role === 'toolResult';

const fileFrom = (request: string) => {
  const match = /write (\S+) containing (.+)$/.exec(request);

  return match?.[1] === undefined || match[2] === undefined
    ? null
    : { path: match[1], content: match[2] };
};

const scripted = (): ModelChoice => {
  const faux = fauxProvider({ tokensPerSecond: 200 });

  faux.setResponses(
    Array.from({ length: 400 }, () => (context: Context) => {
      const request = asked(context);

      if (request.includes('Summarize') || request.includes('summary'))
        return fauxAssistantMessage(
          fauxText('Summary: the thread wrote files into its own computer.'),
        );

      if (request === 'fail on purpose')
        return fauxAssistantMessage([], {
          stopReason: 'error',
          errorMessage: '503 the upstream is down',
        });

      const edit = /^edit (\S+) from (\S+) to (\S+)$/.exec(request);

      if (edit !== null && !toolRan(context))
        return fauxAssistantMessage(
          fauxToolCall('edit_file', {
            path: edit[1] ?? '',
            old_text: edit[2] ?? '',
            new_text: edit[3] ?? '',
          }),
          { stopReason: 'toolUse' },
        );

      const call = /^call (\w+) (\{.*\})$/.exec(request);

      if (call !== null && !toolRan(context))
        return fauxAssistantMessage(fauxToolCall(call[1] ?? '', JSON.parse(call[2] ?? '{}')), {
          stopReason: 'toolUse',
        });

      if (call !== null) {
        const last = context.messages.at(-1)?.content;

        return fauxAssistantMessage(fauxText(`tool said: ${JSON.stringify(last).slice(0, 600)}`));
      }

      const looped = /^\[loop run (\d+) of at most \d+\]/.exec(request);

      if (looped !== null && !toolRan(context))
        return fauxAssistantMessage(
          fauxToolCall('write_file', {
            path: `step-${looped[1]}.txt`,
            content: `run ${looped[1]}`,
          }),
          { stopReason: 'toolUse' },
        );

      const note = /^note (.+)$/.exec(request);

      if (note !== null && !toolRan(context))
        return fauxAssistantMessage(fauxToolCall('notes_write', { content: note[1] ?? '' }), {
          stopReason: 'toolUse',
        });

      const job = /^job (\S+) (.+)$/.exec(request);

      if (job !== null && !toolRan(context))
        return fauxAssistantMessage(
          fauxToolCall('job_start', { name: job[1] ?? '', command: job[2] ?? '' }),
          {
            stopReason: 'toolUse',
          },
        );

      const file = fileFrom(request);

      if (file !== null && !toolRan(context))
        return fauxAssistantMessage(
          [fauxText('Writing it now. '.repeat(40)), fauxToolCall('write_file', file)],
          {
            stopReason: 'toolUse',
          },
        );

      return fauxAssistantMessage(fauxText('Done.'));
    }),
  );

  return { provider: faux.provider, modelId: faux.models[0].id, options: {} };
};

export class TestThread extends Thread {
  async crashComputer() {
    crash(this.ctx.id.toString());
  }

  async bootSizes() {
    return bootSizes(this.ctx.id.toString());
  }

  async runAlarm() {
    await this.alarm();
  }

  async forceDueForTest() {
    const loop = this.ledger.loop;

    if (loop !== null) this.ledger.loop = { ...loop, nextAt: 0 };
  }

  async raceStopForTest() {
    const tick = this.loopTickForRace();
    await this.stopLoop('stopped by the owner');
    await tick;

    return this.ledger.loop;
  }

  async childSendForTest(name: string) {
    return (this as unknown as { threadDirectory: () => ThreadDirectory })
      .threadDirectory()
      .send(name, 'do work')
      .then(
        (ok: string) => ok,
        (error: unknown) => String(error),
      );
  }

  async childCreateForTest(task: string) {
    return (this as unknown as { threadDirectory: () => ThreadDirectory })
      .threadDirectory()
      .create('child', task)
      .then(
        (ok: string) => ok,
        (error: unknown) => String(error),
      );
  }

  private loopTickForRace() {
    return (this as unknown as { loopStep: () => Promise<void> }).loopStep();
  }

  async loopTick() {
    await this.alarm();
  }

  async rememberPageForTest(url: string) {
    if (worthRemembering(url)) this.ledger.browserUrl = url;
  }

  async browserUrlForTest() {
    return restorableUrl(this.ledger.browserUrl);
  }

  async notesForTest() {
    return this.ledger.notes;
  }

  async forgetActivity() {
    this.ledger.lastActivity = 0;
  }

  protected override model(): ModelChoice {
    return scripted();
  }

  protected override route(): ModelChoice {
    return scripted();
  }

  protected override otherProviders() {
    return [];
  }

  protected override computer(): Computer {
    return memoryComputer(this.ctx.id.toString());
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const api = coil(env, 'ana@example.com');
    const other = coil(env, 'bo@example.com');
    const stub = (name: string) => env.THREAD.getByName(name);
    const run = url.searchParams.get('run') ?? crypto.randomUUID().slice(0, 8);

    if (url.pathname === '/isolation') {
      const a = `a-${run}`;
      const b = `b-${run}`;

      await api.create({ name: a, createdBy: 'test' });
      await api.create({ name: b, createdBy: 'test' });
      await api.send(a, 'r1', 'write secret.txt containing only-in-a');

      const inA = await api.exec(a, ['bash', '-lc', 'ls']);
      const inB = await api.exec(b, ['bash', '-lc', 'ls']);
      const bRead = await api.read(b, 'secret.txt').then(
        () => 'read',
        (error: Error) => `refused: ${error.message.slice(0, 40)}`,
      );

      return Response.json({ inA: inA.stdout, inB: inB.stdout, bRead });
    }

    if (url.pathname === '/browser-url') {
      const name = `bu-${run}`;
      const test = (env.THREAD as unknown as DurableObjectNamespace<TestThread>).getByName(name);

      await api.create({ name, createdBy: 'test' });
      await test.rememberPageForTest('http://localhost:3000/');
      await test.rememberPageForTest('about:blank');

      const killed = await stub(name)
        .kill('killed by the test')
        .then(
          () => 'returned',
          (error: Error) =>
            String(error).includes('killed by the test') ? 'aborted' : String(error),
        );
      const fresh = (env.THREAD as unknown as DurableObjectNamespace<TestThread>).getByName(name);

      return Response.json({ killed, restored: await fresh.browserUrlForTest() });
    }

    if (url.pathname === '/kill') {
      const name = `k-${run}`;

      await api.create({ name, createdBy: 'test' });
      await stub(name).start('req-1', 'write note.txt containing survived');
      await sleep(150);

      const killed = await stub(name)
        .kill('killed by the test')
        .then(
          () => 'returned',
          (error: Error) =>
            String(error).includes('killed by the test') ? 'aborted' : String(error),
        );

      const answer = await stub(name).waitForAnswer();
      const view = await stub(name).view();
      const file = await stub(name)
        .readFile('note.txt')
        .catch(() => null);

      return Response.json({
        killed,
        answer,
        file,
        busy: view.busy,
        turns: view.messages.filter((m) => m.role === 'user').length,
      });
    }

    if (url.pathname === '/compact') {
      const name = `c-${run}`;

      await api.create({ name, createdBy: 'test' });
      await api.send(name, 'r1', 'write a.txt containing first');
      await api.send(name, 'r2', 'write b.txt containing second');

      const pair = await api.compact(name);
      const paused = await api.pause(name);
      const afterPause = await api.view(name);

      await stub(name)
        .kill('killed after compaction')
        .catch(() => undefined);

      const resumedFiles = await api.exec(name, ['bash', '-lc', 'ls']);

      await api.send(name, 'r3', 'write c.txt containing third');

      const view = await api.view(name);

      return Response.json({
        pairReason: pair.reason,
        summaryEntry: pair.summaryEntry,
        pausedReason: paused?.reason ?? null,
        phaseAfterPause: afterPause.phase,
        runningAfterPause: afterPause.running,
        resumedFiles: resumedFiles.stdout,
        pairs: view.pairs.map((p) => p.reason),
        hasSummary: view.messages.some((m) => m.kind === 'pi.compaction'),
        summaryIdMatches: view.messages.some(
          (m) => m.kind === 'pi.compaction' && m.id === pair.summaryEntry,
        ),
        lastAnswer:
          view.messages.filter((m) => m.role === 'assistant' && m.text !== '').at(-1)?.text ?? null,
        finalFiles: (await api.exec(name, ['bash', '-lc', 'ls'])).stdout,
      });
    }

    if (url.pathname === '/failed-mark') {
      const name = `fm-${run}`;

      await api.create({ name, createdBy: 'web', title: 'failing' });
      await api.send(name, 'f1', 'fail on purpose');

      const afterFail = (await api.list()).find((t) => t.name === name)?.failed ?? null;

      await api.send(name, 'f2', 'write ok.txt containing fine');

      const afterOk = (await api.list()).find((t) => t.name === name)?.failed ?? null;

      return Response.json({ afterFail, afterOk });
    }

    if (url.pathname === '/directory-fork-child') {
      const name = `d-${run}`;

      await api.create({ name, createdBy: 'mcp', title: 'parent' });
      await api.send(name, 'r1', 'write plan.txt containing the plan');

      const forked = await api.fork(name, `${name}-f`, 'web');
      const forkSees = await api.read(forked.name, 'plan.txt').catch(() => null);

      await api.exec(forked.name, ['bash', '-lc', 'true']);
      await stub(forked.name).readFile('plan.txt');

      const list = await api.list();
      const mine = list.filter((t) => t.name.startsWith(name));

      return Response.json({
        listed: mine.map((t) => ({
          name: t.name,
          createdBy: t.createdBy,
          forkedFrom: t.forkedFrom,
        })),
        forkSees,
        forkOrigin: forked.origin,
        forkSeeded: forked.origin.forkedFrom === name,
        unknown: await api.view('nope-nope').then(
          () => 'found',
          (error: Error) => error.message,
        ),
      });
    }

    if (url.pathname === '/owners') {
      const mine = `o-${run}`;
      const refused = (work: Promise<unknown>) =>
        work.then(
          () => 'allowed',
          (error: Error) => error.message,
        );

      await api.create({ name: mine, createdBy: 'test' });
      await api.send(mine, 'r1', 'write private.txt containing ana-only');

      const forked = await api.fork(mine, `${mine}-f`, 'web');

      return Response.json({
        anaSees: (await api.list()).map((t) => t.name).filter((n) => n.startsWith(mine)),
        boSees: (await other.list()).map((t) => t.name).filter((n) => n.startsWith(mine)),
        boView: await refused(other.view(mine)),
        boRead: await refused(other.read(mine, 'private.txt')),
        boExec: await refused(other.exec(mine, ['bash', '-lc', 'ls'])),
        boPause: await refused(other.pause(mine)),
        boFork: await refused(other.fork(mine, undefined, 'web')),
        boTakesName: await refused(other.create({ name: mine, createdBy: 'test' })),
        forkOwner: forked.owner,
        anaOwner: (await api.view(mine)).owner,
      });
    }

    if (url.pathname === '/limit') {
      const mine = `lim-${run}`;
      const owner = `limit-${run}@example.com`;
      const me = coil(env, owner);
      const neighbor = coil(env, `neighbor-${run}@example.com`);
      const directory = env.DIRECTORY.getByName('all');
      const outcome = (work: Promise<unknown>) =>
        work.then(
          () => 'allowed',
          (error: Error) => error.message,
        );

      await me.create({ name: mine, createdBy: 'test' });

      const noLimit = await me.spend();

      const firstTurn = await outcome(me.send(mine, 'a', 'write a.txt containing 1'));

      await directory.upsert({ name: mine, spend: 30 });

      const set = await me.setSpendLimit(25);
      const overLimit = await outcome(me.send(mine, 'b', 'write b.txt containing 2'));
      const neighborSpend = await neighbor.spend();
      const raised = await me.setSpendLimit(100);
      const underRaised = await outcome(me.send(mine, 'c', 'write c.txt containing 3'));
      const cleared = await me.setSpendLimit(null);
      const badLimit = await outcome(me.setSpendLimit(-5));

      return Response.json({
        noLimit,
        firstTurn,
        set,
        overLimit,
        neighborSpend,
        raised,
        underRaised,
        cleared,
        badLimit,
      });
    }

    if (url.pathname === '/tools') {
      const name = `tools-${run}`;
      const test = (env.THREAD as unknown as DurableObjectNamespace<TestThread>).getByName(name);

      await api.create({ name, createdBy: 'test' });
      await api.send(name, 'w', 'write app.txt containing color=red size=2');
      await api.send(name, 'e', 'edit app.txt from red to blue');
      const edited = await api.read(name, 'app.txt');

      await api.send(name, 'n', 'note goal is a blue app');
      const notes = await test.notesForTest();
      const view = await api.view(name);
      const toolNames = view.messages.flatMap((m) => (m.tool === undefined ? [] : [m.tool.name]));

      return Response.json({
        edited,
        notes,
        toolNames,
        turns: view.turns.length,
        usage: view.usage,
      });
    }

    if (url.pathname === '/threads') {
      const a = `ta-${run}`;
      const b = `tb-${run}`;
      const foreign = `tf-${run}`;

      await api.create({ name: a, createdBy: 'test' });
      await api.create({ name: b, createdBy: 'test' });
      await other.create({ name: foreign, createdBy: 'test' });
      await api.send(b, 'b1', 'write b.txt containing hello from b');

      const listed = await api.send(a, 'l', 'call thread_list {}');
      const read = await api.send(a, 'r', `call thread_read {"name":"${b}"}`);
      const sent = await api.send(
        a,
        's',
        `call thread_send {"name":"${b}","text":"write c.txt containing sent from a"}`,
      );
      await api.answer(b);
      const bFiles = await api.exec(b, ['bash', '-lc', 'ls']);
      const foreignRead = await api.send(a, 'f', `call thread_read {"name":"${foreign}"}`);
      const created = await api.send(a, 'c', 'call thread_create {"title":"Made by a"}');
      const list = await api.list();

      return Response.json({
        listed: listed.answer,
        read: read.answer,
        sent: sent.answer,
        bFiles: bFiles.stdout,
        foreignRead: foreignRead.answer,
        created: created.answer,
        madeByA: list.filter((t) => t.createdBy === `thread:${a}`).map((t) => t.title),
        foreignListedForAna: list.some((t) => t.name === foreign),
      });
    }

    if (url.pathname === '/loop') {
      const name = `loop-${run}`;
      const test = (env.THREAD as unknown as DurableObjectNamespace<TestThread>).getByName(name);

      await api.create({ name, createdBy: 'test' });
      await api.startLoop(name, {
        prompt: 'take the next step',
        everySeconds: 30,
        maxRuns: 5,
        maxSpend: 1,
        gate: 'at-least 3 step-',
      });

      const ticks: string[] = [];

      for (let i = 0; i < 40; i += 1) {
        const before = await api.getLoop(name);

        if (before === null || !before.enabled) break;
        if (before.nextAt > Date.now()) await test.forceDueForTest();
        await test.loopTick();
        await api.answer(name);
        ticks.push(`${before.runs.length}`);
      }

      const loop = await api.getLoop(name);
      const files = await api.exec(name, ['bash', '-lc', 'ls step-*.txt']);
      const view = await api.view(name);

      const killName = `kill-${run}`;
      await api.create({ name: killName, createdBy: 'test' });
      await api.startLoop(killName, {
        prompt: 'never',
        everySeconds: 3600,
        maxRuns: 5,
        maxSpend: 1,
        gate: null,
      });
      const killed = await api.stopAllLoops();
      const afterKill = await api.getLoop(killName);

      return Response.json({
        runs: loop?.runs.length,
        enabled: loop?.enabled,
        stoppedBecause: loop?.stoppedBecause,
        gates: loop?.runs.map((r) => r.gateExit),
        files: files.stdout.trim().split('\n'),
        digest: view.execs.find((e) => e.argv.join(' ') === 'coil loop-digest')?.output ?? '',
        killed,
        afterKill: { enabled: afterKill?.enabled, stoppedBecause: afterKill?.stoppedBecause },
      });
    }

    if (url.pathname === '/loop-send') {
      const name = `lsend-${run}`;
      const other = `lother-${run}`;
      const test = (env.THREAD as unknown as DurableObjectNamespace<TestThread>).getByName(name);

      await api.create({ name, createdBy: 'test' });
      await api.create({ name: other, createdBy: 'test' });
      await api.startLoop(name, {
        prompt: 'x',
        everySeconds: 3600,
        maxRuns: 2,
        maxSpend: 1,
        gate: null,
      });

      return Response.json({ sent: await test.childSendForTest(other) });
    }

    if (url.pathname === '/loop-race') {
      const name = `race-${run}`;
      const test = (env.THREAD as unknown as DurableObjectNamespace<TestThread>).getByName(name);

      await api.create({ name, createdBy: 'test' });
      await api.startLoop(name, {
        prompt: 'take the next step',
        everySeconds: 30,
        maxRuns: 5,
        maxSpend: 1,
        gate: null,
      });
      await test.forceDueForTest();
      const blocked = await test.childCreateForTest('do work');
      const raced = await test.raceStopForTest();
      await test.forceDueForTest();
      await test.loopTick();
      const after = await api.getLoop(name);
      const view = await api.view(name);

      return Response.json({
        blocked,
        racedEnabled: raced?.enabled,
        afterEnabled: after?.enabled,
        runs: after?.runs.length,
        stoppedBecause: after?.stoppedBecause,
        digests: view.execs.filter((e) => e.argv.join(' ') === 'coil loop-digest').length,
      });
    }

    if (url.pathname === '/share') {
      const name = `share-${run}`;

      await api.create({ name, createdBy: 'test' });
      await api.send(name, 's1', 'write a.txt containing <script>alert(1)</script>');
      const { path } = await api.share(name);
      const again = await api.share(name);
      const token = path.split('/').pop() ?? '';
      const page = await sharedView(env, token);
      const foreignShare = await other.share(name).then(
        () => 'shared',
        (e: unknown) => String(e),
      );
      await api.unshare(name);
      const after = await sharedView(env, token);

      return Response.json({
        path,
        same: again.path === path,
        title: page?.title,
        messages: page?.messages.length,
        foreignShare,
        afterUnshare: after === null,
      });
    }

    if (url.pathname === '/size') {
      const name = `s-${run}`;
      const test = (env.THREAD as unknown as DurableObjectNamespace<TestThread>).getByName(name);

      const made = await api.create({ name, createdBy: 'test', size: 'standard-2' });

      await api.exec(name, ['bash', '-lc', 'true']);
      await api.send(name, 'r1', 'write big.txt containing survives-resize');

      const resized = await api.resize(name, 'standard-4');
      const afterResize = await api.read(name, 'big.txt');
      const same = await api.resize(name, 'standard-4');

      await api.pause(name);

      const pausedResize = await api.resize(name, 'lite');

      await api.exec(name, ['bash', '-lc', 'true']);

      return Response.json({
        created: made.size,
        resized,
        afterResize,
        same,
        pausedResize,
        boots: await test.bootSizes(),
        finalSize: (await api.view(name)).size,
      });
    }

    if (url.pathname === '/lifecycle') {
      const name = `l-${run}`;
      const test = (env.THREAD as unknown as DurableObjectNamespace<TestThread>).getByName(name);

      await api.create({ name, createdBy: 'test' });
      await api.send(name, 'r1', 'write kept.txt containing before-pause');
      await stub(name).start('r2', 'write late.txt containing during-turn');

      const pauseDuringTurn = await api.pause(name).then(
        () => 'paused',
        (error: Error) => error.message,
      );

      const compactDuringTurn = await api.compact(name).then(
        () => 'compacted',
        (error: Error) => error.message,
      );

      await stub(name).waitForAnswer();

      const [raced] = await Promise.all([
        api.pause(name).then(
          (pair) => pair?.reason ?? 'none',
          (error: Error) => (/agent is working/.test(error.message) ? 'refused' : error.message),
        ),
        stub(name).start('r3', 'write raced.txt containing after-pause'),
      ]);
      await stub(name).waitForAnswer();

      const afterRace = await api.view(name);
      const racedFiles = await api.exec(name, ['bash', '-lc', 'ls']);

      const [compacted, pausedDuringCompaction] = await Promise.all([
        api.compact(name).then((pair) => pair.reason),
        api.pause(name).then(
          (pair) => pair?.reason ?? 'none',
          (error: Error) =>
            /command is running|agent is working/.test(error.message) ? 'refused' : error.message,
        ),
      ]);
      const afterCompaction = await api.exec(name, ['bash', '-lc', 'ls']);

      await api.pause(name);
      await api.exec(name, ['bash', '-lc', 'true']);
      await test.crashComputer();

      const afterCrash = await api.exec(name, ['bash', '-lc', 'ls']);
      const crashed = await api.view(name);

      await test.forgetActivity();
      await test.runAlarm();

      const idle = await api.view(name);

      return Response.json({
        pauseDuringTurn,
        compactDuringTurn,
        compacted,
        pausedDuringCompaction,
        filesAfterCompaction: afterCompaction.stdout,
        racedPause: raced,
        racedTurnAnswered: afterRace.messages.some(
          (m) => m.role === 'user' && m.text.includes('raced.txt'),
        ),
        racedFile: racedFiles.stdout.split('\n').includes('raced.txt'),
        filesAfterCrash: afterCrash.stdout,
        lostNoticed: crashed.execs.some((e) => e.argv.includes('computer-lost')),
        idlePhase: idle.phase,
        idleRunning: idle.running,
        idlePairs: idle.pairs.map((p) => p.reason),
      });
    }

    return new Response('not found', { status: 404 });
  },
};
