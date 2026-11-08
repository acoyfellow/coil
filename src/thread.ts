import { DurableObject } from 'cloudflare:workers';
import type { Extension, HarnessSettings } from '@earendil-works/pi-durable';
import { GATEWAY_MODELS, type ModelInfo, modelInfo as pinnedModelInfo } from '../shared/models';
import {
  type Agent,
  type BrowserTools,
  type Children,
  type Message,
  MODEL_FAILURE_PREFIX,
  type ModelChoice,
  openAgent,
  type ThreadDirectory,
} from './agent';
import { type AccountCredentials, accountModel } from './auth/account-models';
import { accountToken, replacedToken, SignedOut } from './auth/refresh';
import { isCloudflareOwner, mayUseHostInference } from './auth/types';
import {
  Browser,
  browserEnv,
  displayArgs,
  type PageState,
  restorableUrl,
  VNC_PORT,
  worthRemembering,
} from './browser';
import { compactionPolicy } from './compaction';
import { seal, unseal } from './connectors/seal';
import {
  type Computer,
  type Entry,
  type ExecResult,
  type Snapshot,
  sandboxComputer,
  WORKSPACE,
} from './computer';
import { connectorsOf } from './connectors/config';
import type { ConnectorStore } from './connectors/store';
import { connectorTools } from './connectors/tools';
import type { Directory, Grant, ThreadUpdate } from './directory';
import { DIRECTORY_NAME } from './directory-name';
import {
  describeExtensions,
  extensionTools,
  isExtensionReport,
  preparePaths,
  workspaceTarget,
} from './extensions';
import { gatewayModel, isGatewayModel } from './gateway';
import {
  type ExecRecord,
  Ledger,
  type Origin,
  type Pair,
  type Phase,
  type Surface,
  type Turn,
} from './ledger';
import { liveEvents } from './live';
import { decide, digest, type LoopSpec, type LoopState, validSpec } from './loop';
import { workersAI } from './model';
import { bounded, HUMAN_LIMIT_SECONDS } from './shell';
import { DEFAULT_SIZE, type Size } from './size';
import { bridge, parseSize, SESSION, terminalEnv, tmuxArgs } from './terminal';
import { pipeSocket } from './vnc';
import { ensureWebkit } from './webkit-patch';

const TURN_DIFF_LIMIT = 60_000;

const STOP_WAIT_MS = 5_000;

const VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

export type ThreadView = {
  readonly name: string;
  readonly title: string;
  readonly phase: Phase;
  readonly busy: boolean;
  readonly repo: string | null;
  readonly running: boolean;
  readonly origin: Origin;
  readonly owner: string;
  readonly size: Size;
  readonly messages: Message[];
  readonly pairs: Pair[];
  readonly execs: ExecRecord[];
  readonly surfaces: Surface[];
  readonly model: string;
  readonly usage: Usage;
  readonly turns: Turn[];
};

export type Usage = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cost: number;
  readonly contextTokens: number;
  readonly contextWindow: number;
};

export type CreateOptions = {
  readonly repo?: string | null;
  readonly title?: string;
  readonly createdBy?: string;
  readonly parent?: string;
  readonly forkedFrom?: string;
  readonly base?: string;
  readonly seed?: string;
  readonly owner?: string;
  readonly size?: Size;
};

export type Env = {
  readonly THREAD: DurableObjectNamespace<Thread>;
  readonly DIRECTORY: DurableObjectNamespace<Directory>;
  readonly AI: Ai;
  readonly ASSETS: Fetcher;
  readonly LOADER: WorkerLoader;
  readonly MODEL: string;
  readonly COIL_COMMIT?: string;
  readonly AI_GATEWAY?: string;
  readonly MODEL_GATEWAY_URL?: string;
  readonly MODEL_GATEWAY_HEADER?: string;
  readonly MODEL_GATEWAY_TOKEN?: string;
  readonly LOCAL_DEV_WITHOUT_ACCESS?: string;
  readonly COIL_AUTH?: string;
  readonly OAUTH_CLIENT_ID?: string;
  readonly OAUTH_CLIENT_SECRET?: string;
  readonly SESSION_SECRET?: string;
  readonly COIL_USER_GATEWAY?: string;
  readonly ACCESS_TEAM_DOMAIN?: string;
  readonly ACCESS_AUD?: string;
  readonly CONNECTORS?: DurableObjectNamespace<ConnectorStore>;
  readonly CONNECTORS_JSON?: string;
  readonly CONNECTOR_SEAL_KEY?: string;
};

export type LiveEvent =
  | { readonly type: 'text'; readonly delta: string }
  | { readonly type: 'thinking'; readonly delta: string }
  | {
      readonly type: 'tool_start';
      readonly id: string;
      readonly name: string;
      readonly args: string;
    }
  | { readonly type: 'tool_output'; readonly id: string; readonly append: string }
  | { readonly type: 'tool_end'; readonly id: string; readonly name: string }
  | { readonly type: 'turn_end' }
  | { readonly type: 'compaction'; readonly phase: 'start' | 'end' }
  | {
      readonly type: 'state';
      readonly phase: Phase;
      readonly busy: boolean;
      readonly running: boolean;
    }
  | { readonly type: 'exec'; readonly record: ExecRecord }
  | { readonly type: 'surfaces'; readonly surfaces: Surface[] }
  | { readonly type: 'page'; readonly page: PageState };

const IMAGE = 'computer';

const IDLE_CHECK_MS = 1000;

const COOKIE_JAR_KEY = 'browser-cookie-jar';

const AUTO_PAUSE_AFTER_MS = 9 * 60 * 1000;

export class ThreadBusy extends Error {
  override readonly name = 'ThreadBusy';
}

const MANUAL_KEEP_TOKENS = 200;

const AUTO_KEEP_TOKENS = 20_000;

export const childName = (parent: string, index: number) =>
  `${parent.slice(0, 50)}-c${index}`.replace(/-+/g, '-');

export class Thread extends DurableObject<Env> {
  protected readonly ledger: Ledger;

  private agent: Promise<Agent> | undefined;

  private grant: Grant | null = null;

  private booting: Promise<Computer> | undefined;

  private readonly listeners = new Set<(event: LiveEvent) => void>();

  private unwatch: (() => void) | undefined;

  private browser: Promise<Browser> | undefined;

  private lifecycle: Promise<unknown> = Promise.resolve();

  private viewers = 0;

  private inFlight = 0;

  private pausing: Promise<unknown> | undefined;

  private async using<T>(work: () => Promise<T>): Promise<T> {
    this.inFlight += 1;

    try {
      return await work();
    } finally {
      this.inFlight -= 1;
      await this.touch();
    }
  }

  private watched(socket: WebSocket) {
    this.viewers += 1;

    const done = () => {
      socket.removeEventListener('close', done);
      socket.removeEventListener('error', done);
      this.viewers -= 1;
      void this.touch();
    };

    socket.addEventListener('close', done);
    socket.addEventListener('error', done);
  }

  private serialized<T>(step: () => Promise<T>): Promise<T> {
    const run = this.lifecycle.then(step, step);

    this.lifecycle = run.catch(() => undefined);

    return run;
  }

  private async touch() {
    this.ledger.lastActivity = Date.now();
    await this.ctx.storage.setAlarm(
      Date.now() + (this.ledger.busy ? IDLE_CHECK_MS : AUTO_PAUSE_AFTER_MS),
    );
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ledger = new Ledger(ctx.storage.sql);
  }

  protected model(): ModelChoice {
    return this.route(this.currentModel());
  }

  private requireHostInference(): void {
    if (!mayUseHostInference(this.env.COIL_AUTH, this.ledger.owner))
      throw new SignedOut('Sign in with Cloudflare: coil only runs models on your own account.');
  }

  protected route(id: string): ModelChoice {
    if (isCloudflareOwner(this.ledger.owner))
      return accountModel(this.accountCredentials(), id, undefined, this.ledger.modelDetails);

    this.requireHostInference();

    return isGatewayModel(id)
      ? gatewayModel(this.env.AI, this.env.AI_GATEWAY ?? 'default', id, this.externalGateway())
      : workersAI(this.env.AI, id);
  }

  private accountCredentials(): AccountCredentials {
    const owner = this.ledger.owner;
    const directory = () => this.directory;

    return {
      route: () => accountToken(this.env, owner, directory()),
      rejected: (token) => replacedToken(this.env, owner, token, directory()),
    };
  }

  private externalGateway() {
    const url = this.env.MODEL_GATEWAY_URL ?? '';
    const token = this.env.MODEL_GATEWAY_TOKEN ?? '';

    return url === '' || token === ''
      ? null
      : { url, token, header: this.env.MODEL_GATEWAY_HEADER ?? 'authorization' };
  }

  protected otherProviders() {
    const other = isGatewayModel(this.currentModel())
      ? this.env.MODEL
      : (GATEWAY_MODELS[0]?.id ?? this.env.MODEL);

    return [this.route(other).provider];
  }

  protected settings(): HarnessSettings {
    const ledger = this.ledger;
    const modelWindow = () => this.modelInfo(this.currentModel())?.context ?? 0;

    return {
      get compaction() {
        const keepRecentTokens = ledger.compacting ? MANUAL_KEEP_TOKENS : AUTO_KEEP_TOKENS;

        return compactionPolicy(modelWindow(), ledger.contextBudget, keepRecentTokens);
      },
    };
  }

  protected computer(): Computer {
    const container = this.ctx.container;

    if (container === undefined) throw new Error('This Durable Object has no container binding');

    return sandboxComputer(container, container.images[IMAGE] ?? IMAGE);
  }

  private get directory() {
    return this.env.DIRECTORY.getByName(DIRECTORY_NAME);
  }

  private async publish(update: Omit<ThreadUpdate, 'name'> = {}) {
    const name = this.ledger.name;

    if (name === null) return;

    await this.directory.upsert({
      name,
      phase: this.ledger.phase,
      busy: this.ledger.busy,
      ...update,
    });
  }

  private emit(event: LiveEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private state() {
    this.emit({
      type: 'state',
      phase: this.ledger.phase,
      busy: this.ledger.busy,
      running: this.ctx.container?.running ?? false,
    });
  }

  private async awake(): Promise<Computer> {
    while (this.pausing !== undefined) await this.pausing.catch(() => undefined);

    return this.awakeInsideLifecycle();
  }

  private awakeInsideLifecycle(): Promise<Computer> {
    this.booting ??= (async () => {
      const box = this.computer();

      if (!box.running()) {
        const from = this.ledger.bootSnapshot();

        if (this.ledger.phase === 'awake') await this.recordLostComputer(from);

        await box.boot(from, this.ledger.size);

        if (from === undefined && this.ledger.repo !== null) {
          const cloned = await box.exec(
            [
              'bash',
              '-c',
              `cd ${WORKSPACE} && git clone --depth 50 "$1" .`,
              'clone',
              this.ledger.repo,
            ],
            '/',
          );

          if (cloned.exitCode !== 0)
            throw new Error(
              `Could not clone ${this.ledger.repo}: ${cloned.stderr.trim().slice(-300)}`,
            );
        } else if (from === undefined)
          await box.exec(
            ['bash', '-c', `mkdir -p ${WORKSPACE} && cd ${WORKSPACE} && git init -q`],
            '/',
          );
      }

      this.warmBrowser();

      if (this.ledger.phase !== 'awake') {
        this.ledger.phase = 'awake';
        await this.publish();
        this.state();
      }

      await this.touch();

      return box;
    })().finally(() => {
      this.booting = undefined;
    });

    return this.booting;
  }

  private children(): Children {
    return {
      spawn: async (task) => {
        const parent = this.ledger.name ?? 'thread';
        const index = this.ledger.nextChild();
        const name = childName(parent, index);
        const box = await this.awake();
        const snapshot = await box.snapshot(`coil-${parent}-child-${index}-${Date.now()}`);
        const child = this.env.THREAD.getByName(name);

        await child.create(name, {
          repo: this.ledger.repo,
          title: task.slice(0, 80),
          createdBy: 'agent',
          parent,
          base: snapshot.id,
          owner: await this.ownerEmail(),
          size: this.ledger.size,
        });
        await child.start(`${name}-task`, task);

        return name;
      },
      result: async (name) => {
        const answer = await this.env.THREAD.getByName(name).waitForAnswer();

        return answer === '' ? `${name} finished with no answer` : answer;
      },
    };
  }

  private threadDirectory(): ThreadDirectory {
    const self = () => this.ledger.name ?? '';
    const owned = async (name: string) => {
      const owner = await this.ownerEmail();
      const summary = await this.directory.get(name);

      if (summary === null || summary.owner !== owner || name === self())
        throw new Error(`unknown thread ${name}`);

      return summary;
    };

    return {
      list: async () => {
        const owner = await this.ownerEmail();
        const rows = (await this.directory.list(owner)).filter(
          (t) => t.name !== self() && !t.archived,
        );

        return rows.length === 0
          ? '(no other threads)'
          : rows.map((t) => `${t.name}\t${t.busy ? 'working' : t.phase}\t${t.title}`).join('\n');
      },
      read: async (name, last) => {
        await owned(name);
        const view = await this.env.THREAD.getByName(name).view();
        const said = view.messages
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text !== '')
          .slice(-last)
          .map((m) => `${m.role}: ${m.text}`)
          .join('\n\n');

        return `<thread-data name="${name}" state="${view.busy ? 'working' : view.phase}">\n${said}\n</thread-data>`;
      },
      send: async (name, message) => {
        if (this.ledger.loop?.enabled === true)
          throw new Error('A looping thread cannot send work to other threads');

        await owned(name);
        const target = this.env.THREAD.getByName(name);

        if ((await target.view()).busy) return `${name} is working; try again after its turn.`;

        await target.start(
          `from-${self()}-${crypto.randomUUID().slice(0, 8)}`,
          `[message from thread ${self()}]\n${message}`,
        );

        return `sent to ${name}`;
      },
      wait: async (name, seconds) => {
        await owned(name);
        const target = this.env.THREAD.getByName(name);
        const answer = await Promise.race([
          target.waitForAnswer(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), seconds * 1000)),
        ]);

        if (answer === null)
          return `${name} is still working after ${seconds}s; call thread_wait again later.`;

        return `<thread-data name="${name}" state="done">\n${answer === '' ? '(no answer)' : answer}\n</thread-data>`;
      },
      create: async (title, task) => {
        const withTask = task !== undefined && task.trim() !== '';
        const owner = await this.ownerEmail();

        await this.assertChildBudget(owner, withTask);
        const name = `${
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 24) || 'thread'
        }-${crypto.randomUUID().slice(0, 6)}`;
        const target = this.env.THREAD.getByName(name);

        await target.create(name, {
          title: title.slice(0, 80),
          createdBy: `thread:${self()}`,
          owner,
          size: this.ledger.size,
        });
        if (task !== undefined && task.trim() !== '') await target.start(`${name}-task`, task);

        return `created ${name}`;
      },
    };
  }

  private surfacesChanged(next: Surface[]) {
    this.ledger.surfaces = next;
    this.emit({ type: 'surfaces', surfaces: next });
  }

  private ensureBrowserSurface() {
    const current = this.ledger.surfaces;

    if (!current.some((s) => s.kind === 'browser'))
      this.surfacesChanged([...current, { id: 'b1', kind: 'browser', title: 'browser' }]);
  }

  private async saveCookieJar(): Promise<void> {
    if (this.browser === undefined) return;

    try {
      const browser = await this.browser;
      const cookies = await browser.cookies();

      if (cookies.length === 0) {
        await this.ctx.storage.delete(COOKIE_JAR_KEY);
        return;
      }

      const owner = await this.ownerEmail();
      const sealed = await seal(this.env.CONNECTOR_SEAL_KEY, owner, JSON.stringify(cookies));

      await this.ctx.storage.put(COOKIE_JAR_KEY, sealed);
    } catch {
      return;
    }
  }

  private async restoreCookieJar(browser: Browser): Promise<void> {
    try {
      const sealed = await this.ctx.storage.get(COOKIE_JAR_KEY);

      if (typeof sealed !== 'string' || sealed === '') return;

      const owner = await this.ownerEmail();
      const cookies = JSON.parse(await unseal(this.env.CONNECTOR_SEAL_KEY, owner, sealed));

      await browser.setCookies(cookies);
    } catch {
      return;
    }
  }

  private openBrowser(): Promise<Browser> {
    const existing = this.browser;

    if (existing !== undefined)
      return existing.then((b) => {
        if (b.alive) return b;

        this.browser = undefined;

        return this.openBrowser();
      });

    this.browser = (async () => {
      await this.awake();

      const container = this.ctx.container;

      if (container === undefined) throw new Error('This Durable Object has no container binding');

      await ensureWebkit(container, this.env.ASSETS);

      const browser = await Browser.launch(container);

      await this.restoreCookieJar(browser);

      const saved = restorableUrl(this.ledger.browserUrl);

      browser.pages.add((page) => {
        if (worthRemembering(page.url)) this.ledger.browserUrl = page.url;
        this.emit({ type: 'page', page });
      });

      if (saved !== null && !worthRemembering(browser.page.url))
        await browser.open(saved).catch(() => undefined);
      this.ensureBrowserSurface();

      return browser;
    })().catch((cause) => {
      this.browser = undefined;
      throw cause;
    });

    return this.browser;
  }

  private browserTools(): BrowserTools {
    const page = (p: PageState) => `${p.title === '' ? '(no title)' : p.title}\n${p.url}`;

    return {
      open: async (url) => page(await (await this.openBrowser()).open(url)),
      snapshot: async () => (await this.openBrowser()).snapshot(),
      click: async (ref) => {
        const browser = await this.openBrowser();

        await browser.clickRef(ref);
        await new Promise((r) => setTimeout(r, 400));

        return `clicked ${ref}; now at ${page(browser.page)}`;
      },
      type: async (text, ref) => {
        const browser = await this.openBrowser();

        if (ref !== undefined) await browser.clickRef(ref);
        await browser.type(text);

        return `typed ${text.length} chars`;
      },
      key: async (key) => {
        const browser = await this.openBrowser();

        await browser.key({ type: 'keyDown', key });
        await new Promise((r) => setTimeout(r, 300));

        return `pressed ${key}; now at ${page(browser.page)}`;
      },
      evaluate: async (expression) => (await this.openBrowser()).evaluate(expression),
      look: async (question) => {
        const browser = await this.openBrowser();
        const shot = await browser.screenshot();

        return `${page(browser.page)}\n${await this.describe(shot, question)}`;
      },
      logs: async (clear) => {
        const lines = (await this.openBrowser()).consoleLogs(clear);

        return lines.length === 0 ? '(no console messages)' : lines.join('\n');
      },
    };
  }

  private async runVision(inputs: Record<string, unknown>): Promise<unknown> {
    if (!isCloudflareOwner(this.ledger.owner)) {
      this.requireHostInference();
      return this.env.AI.run(VISION_MODEL as keyof AiModels, inputs as never);
    }

    const route = await this.accountCredentials().route();
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(route.accountId)}/ai/run/${VISION_MODEL}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${route.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(inputs),
      },
    );
    const parsed: unknown = await response.json().catch(() => null);

    if (!response.ok)
      throw new Error(`Workers AI on your account refused the vision call: ${response.status}`);

    return typeof parsed === 'object' && parsed !== null && 'result' in parsed
      ? parsed.result
      : parsed;
  }

  private async describe(jpegBase64: string, question: string): Promise<string> {
    const result = (await this.runVision({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `This is a screenshot of a web page. ${question}\nAnswer plainly and briefly. Quote visible text exactly.`,
            },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
          ],
        },
      ],
      max_tokens: 600,
    })) as { response?: string; choices?: { message?: { content?: string } }[] };
    const answer = result.response ?? result.choices?.[0]?.message?.content ?? '';

    if (answer.trim() === '') throw new Error('The vision model returned nothing');

    return answer.trim();
  }

  private async loadGrant() {
    if (!isCloudflareOwner(this.ledger.owner)) return;

    const grant = await this.directory.grantFor(this.ledger.owner);

    if (grant === null)
      throw new SignedOut(
        'Sign in with Cloudflare again: coil no longer has access to your account.',
      );

    if (this.grant?.accountId !== grant.accountId || this.grant?.gateway !== grant.gateway) {
      this.grant = grant;
      await this.reopenAgent();
    }
  }

  private open(): Promise<Agent> {
    const current = this.model();

    this.agent ??= openAgent(
      this.ctx.storage,
      current,
      () => this.awake(),
      this.ledger,
      this.children(),
      this.settings(),
      () => this.ledger.origin.seed,
      this.browserTools(),
      undefined,
      this.threadDirectory(),
      this.otherProviders(),
      (id) => this.route(id),
      this.plugins(),
    )
      .then(async (agent) => {
        const toLive = liveEvents();
        this.unwatch ??= await agent.watch((view) => {
          for (const live of toLive(view)) this.emit(live);
        });

        return agent;
      })
      .catch((cause) => {
        this.agent = undefined;
        throw cause;
      });

    return this.agent;
  }

  async create(name: string, options: CreateOptions = {}): Promise<ThreadView> {
    const fresh = this.ledger.name === null;

    this.ledger.claim(name);

    if (fresh) {
      this.ledger.repo = options.repo ?? null;
      this.ledger.owner = options.owner ?? '';
      this.ledger.size = options.size ?? DEFAULT_SIZE;
      this.ledger.origin = {
        parent: options.parent ?? null,
        forkedFrom: options.forkedFrom ?? null,
        base: options.base ?? null,
        seed: options.seed ?? null,
      };
      await this.directory.upsert({
        name,
        title: options.title ?? name,
        phase: 'new',
        busy: false,
        repo: options.repo ?? null,
        parent: options.parent ?? null,
        forkedFrom: options.forkedFrom ?? null,
        createdBy: options.createdBy ?? 'api',
        owner: options.owner ?? '',
      });
    }

    await this.open();

    if (fresh) this.ctx.waitUntil(this.awake().catch(() => undefined));

    return this.view();
  }

  private async assertChildBudget(owner: string, withTask: boolean): Promise<void> {
    if (withTask && this.ledger.loop?.enabled === true)
      throw new Error('A looping thread cannot start other threads with a task');

    this.ledger.childrenMade += 1;
    await this.assertUnderLimit(owner);
  }

  private async assertUnderLimit(owner: string): Promise<void> {
    const limit = await this.directory.limitFor(owner);

    if (limit === null) return;

    const spent = await this.directory.spendFor(owner);

    if (spent >= limit)
      throw new Error(
        `Your spend limit of $${limit.toFixed(2)} is reached ($${spent.toFixed(2)} spent). Raise or remove it in the sidebar to continue.`,
      );
  }

  private async assertOwnerBudget(): Promise<void> {
    const owner = this.ledger.owner;

    if (owner === null || owner === '') return;

    await this.assertUnderLimit(owner);
  }

  async start(requestId: string, input: string): Promise<{ requestId: string }> {
    while (this.pausing !== undefined) await this.pausing.catch(() => undefined);

    await this.assertOwnerBudget();

    this.inFlight += 1;

    try {
      await this.loadGrant();
      const agent = await this.open();

      await this.markTurn(input);
      await agent.submit(requestId, input);
      this.ledger.busy = true;
    } finally {
      this.inFlight -= 1;
    }

    this.ledger.lastActivity = Date.now();
    await this.publish({ title: this.ledger.titled ? undefined : input.slice(0, 80) });
    this.ledger.titled = true;
    this.state();
    await this.ctx.storage.setAlarm(Date.now() + IDLE_CHECK_MS);

    return { requestId };
  }

  async send(requestId: string, input: string): Promise<{ status: string; answer: string }> {
    await this.start(requestId, input);

    return { status: 'done', answer: await this.waitForAnswer() };
  }

  async waitForAnswer(): Promise<string> {
    const agent = await this.open();

    await agent.idle();
    await this.settle();

    return agent.lastAnswer();
  }

  private async gitTree(): Promise<string> {
    const ran = await this.computer().exec([
      'bash',
      '-lc',
      'git rev-parse --git-dir >/dev/null 2>&1 || exit 0; export GIT_INDEX_FILE=$(mktemp -u); git add -A >/dev/null 2>&1; git write-tree; rm -f "$GIT_INDEX_FILE"',
    ]);

    return ran.exitCode === 0 ? ran.stdout.trim() : '';
  }

  private async markTurn(input: string) {
    if (!this.computer().running()) {
      this.ledger.startTurn(input, '');
      return;
    }

    this.ledger.startTurn(input, await this.gitTree().catch(() => ''));
  }

  private async toolsInLastTurn(): Promise<number> {
    const all = await (await this.open()).messages().catch(() => []);
    const lastPrompt = all.findLastIndex((entry) => entry.role === 'user');

    return all.slice(lastPrompt + 1).filter((entry) => entry.role === 'tool').length;
  }

  private async closeTurn() {
    const open = this.ledger.openTurn();

    if (open === null) return;

    const tools = await this.toolsInLastTurn();

    if (open.base === '' || !this.computer().running()) {
      this.ledger.finishTurn(open.seq, '', '', tools);
      return;
    }

    const now = await this.gitTree().catch(() => '');

    if (now === '' || now === open.base) {
      this.ledger.finishTurn(open.seq, '', '', tools);
      return;
    }

    const stat = await this.computer().exec(['git', 'diff', '--stat', open.base, now]);
    const diff = await this.computer().exec(['git', 'diff', open.base, now]);

    this.ledger.finishTurn(
      open.seq,
      stat.stdout.slice(0, 4000),
      diff.stdout.slice(0, TURN_DIFF_LIMIT),
      tools,
    );
  }

  private async settle() {
    await this.closeTurn().catch(() => undefined);

    if (!this.ledger.busy) return;

    this.ledger.busy = false;
    await this.publish({ spend: (await this.usage()).cost, failed: await this.lastTurnFailed() });
    this.state();
    await this.deliverDone().catch(() => undefined);
    await this.drainInbox().catch(() => undefined);
  }

  private async lastTurnFailed(): Promise<boolean> {
    const said = (await (await this.open()).messages().catch(() => []))
      .filter((entry) => entry.role === 'assistant' && entry.text !== '')
      .at(-1);

    return said?.text.startsWith(MODEL_FAILURE_PREFIX) ?? false;
  }

  private async deliverDone() {
    const parent = this.ledger.origin.parent;

    if (parent === null) return;

    const agent = await this.open();
    const answers = (await agent.messages()).filter((m) => m.role === 'assistant' && m.text !== '');
    const latest = answers.at(-1);

    if (latest === undefined || answers.length <= this.ledger.doneDelivered) return;

    const line = latest.text
      .split('\n')
      .map((each) => each.trim())
      .findLast((each) => each.startsWith('DONE:'));

    if (line === undefined) return;

    this.ledger.doneDelivered = answers.length;
    await this.env.THREAD.getByName(parent).receive(
      `done-${this.ledger.name ?? 'child'}-${answers.length}`,
      this.ledger.name ?? 'child',
      line,
    );
  }

  async receive(requestId: string, from: string, text: string): Promise<{ queued: boolean }> {
    const message = `[message from thread ${from}]\n${text}`;

    if (this.ledger.busy || this.pausing !== undefined) {
      this.ledger.inbox = [...this.ledger.inbox, { requestId, message }];
      return { queued: true };
    }

    await this.start(requestId, message);

    return { queued: false };
  }

  private async drainInbox() {
    const [next, ...rest] = this.ledger.inbox;

    if (next === undefined || this.ledger.busy) return;

    this.ledger.inbox = rest;
    await this.start(next.requestId, next.message);
  }

  private async recordLostComputer(from: Snapshot | undefined) {
    const restored =
      from === undefined
        ? 'an empty disk'
        : `the disk saved at ${new Date(this.ledger.latest()?.at ?? 0).toISOString()}`;
    const record = await this.ledger.logExec(
      ['coil', 'computer-lost'],
      1,
      `The computer stopped without being paused. It was restarted from ${restored}; changes made after that are gone.`,
      'agent',
    );

    this.emit({ type: 'exec', record });
  }

  override async alarm(): Promise<void> {
    if (this.ledger.loop?.enabled && !this.ledger.busy) {
      await this.loopStep();

      if (this.ledger.loop?.enabled) return;
    }

    if (this.ledger.busy) {
      const agent = await this.open();
      const finished = await Promise.race([
        agent.idle().then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 20_000)),
      ]);

      if (!finished) {
        await this.ctx.storage.setAlarm(Date.now() + IDLE_CHECK_MS);

        return;
      }

      await this.settle();
      await this.touch();

      if (this.ledger.loop?.enabled) await this.ctx.storage.setAlarm(Date.now() + IDLE_CHECK_MS);

      return;
    }

    const idleFor = Date.now() - this.ledger.lastActivity;

    if (idleFor < AUTO_PAUSE_AFTER_MS || this.viewers > 0 || this.inFlight > 0) {
      await this.ctx.storage.setAlarm(
        Date.now() + Math.max(IDLE_CHECK_MS, AUTO_PAUSE_AFTER_MS - idleFor),
      );

      return;
    }

    if (!this.computer().running()) return;

    try {
      await this.pause();
    } catch (cause) {
      if (!(cause instanceof ThreadBusy)) throw cause;

      await this.ctx.storage.setAlarm(Date.now() + AUTO_PAUSE_AFTER_MS);
    }
  }

  exec(argv: string[]): Promise<ExecResult & { seq: number }> {
    return this.using(() => this.execNow(argv));
  }

  private async execNow(argv: string[]): Promise<ExecResult & { seq: number }> {
    const box = await this.awake();
    const result = await box.exec(bounded(argv, HUMAN_LIMIT_SECONDS));
    const record = await this.ledger.logExec(
      argv,
      result.exitCode,
      `${result.stdout}${result.stderr}`,
    );

    this.emit({ type: 'exec', record });

    return { ...result, seq: record.seq };
  }

  upload(path: string, bytes: ArrayBuffer): Promise<string> {
    return this.using(async () => {
      await (await this.awake()).writeFile(path, bytes);
      this.ledger.lastActivity = Date.now();

      return `${WORKSPACE}/${path}`;
    });
  }

  readFile(path: string): Promise<string> {
    return this.using(async () => (await this.awake()).readFile(path));
  }

  writeFile(path: string, content: string): Promise<{ path: string; bytes: number }> {
    return this.using(async () => {
      const target = workspaceTarget(path);

      await (await this.awake()).writeFile(target, content);

      return { path: target, bytes: new TextEncoder().encode(content).byteLength };
    });
  }

  list(path: string): Promise<Entry[]> {
    return this.using(async () => (await this.awake()).list(path));
  }

  compact(instructions?: string): Promise<Pair> {
    if (this.ledger.busy)
      return Promise.reject(new ThreadBusy('The agent is working. Compact after the turn ends.'));

    return this.using(() => this.serialized(() => this.compactNow(instructions)));
  }

  private async compactNow(instructions?: string): Promise<Pair> {
    const agent = await this.open();

    this.ledger.compacting = true;

    const summaryEntry = await agent.compact(instructions).finally(() => {
      this.ledger.compacting = false;
    });
    const box = await this.awakeInsideLifecycle();
    const pair: Pair = {
      at: Date.now(),
      reason: 'compaction',
      snapshot: await box.snapshot(`coil-${this.ledger.name ?? 'thread'}-c-${Date.now()}`),
      summaryEntry,
    };

    this.ledger.record(pair);
    await this.publish();

    return pair;
  }

  snapshot(): Promise<Snapshot> {
    return this.serialized(async () => {
      const box = await this.awakeInsideLifecycle();

      return box.snapshot(`coil-${this.ledger.name ?? 'thread'}-s-${Date.now()}`);
    });
  }

  pause(): Promise<Pair | null> {
    const run = this.serialized(() => this.pauseNow());
    const settled = run.finally(() => {
      if (this.pausing === settled) this.pausing = undefined;
    });

    this.pausing = settled;

    return settled;
  }

  private async pauseNow(): Promise<Pair | null> {
    if (this.booting !== undefined) await this.booting.catch(() => undefined);

    if (this.ledger.busy) throw new ThreadBusy('The agent is working. Pause after the turn ends.');

    if (this.inFlight > 0) throw new ThreadBusy('A command is running. Pause after it ends.');

    const box = this.computer();

    if (!box.running()) {
      this.ledger.phase = 'paused';
      await this.publish();
      this.state();

      return null;
    }

    const pair: Pair = {
      at: Date.now(),
      reason: 'pause',
      snapshot: await box.snapshot(`coil-${this.ledger.name ?? 'thread'}-p-${Date.now()}`),
      summaryEntry: null,
    };

    this.ledger.record(pair);
    await this.saveCookieJar();
    void this.browser?.then((b) => b.close()).catch(() => undefined);
    this.browser = undefined;
    await box.destroy();
    await this.ctx.storage.deleteAlarm();
    this.ledger.phase = 'paused';
    await this.publish();
    this.state();

    return pair;
  }

  private async ownerEmail(): Promise<string> {
    if (this.ledger.owner !== '') return this.ledger.owner;

    const listed = (await this.directory.get(this.ledger.name ?? ''))?.owner ?? '';

    if (listed !== '') this.ledger.owner = listed;

    return listed;
  }

  async resize(next: Size): Promise<{ size: Size; restarted: boolean }> {
    if (next === this.ledger.size) return { size: next, restarted: false };

    if (this.ledger.busy) throw new ThreadBusy('The agent is working. Resize after the turn ends.');

    const wasRunning = this.computer().running();

    if (wasRunning) await this.pause();

    this.ledger.size = next;
    await this.publish();

    if (wasRunning) await this.awake();

    return { size: next, restarted: wasRunning };
  }

  async forkContext(): Promise<string> {
    const messages = await (await this.open()).messages();
    const compaction = messages.filter((m) => m.kind === 'pi.compaction').at(-1);
    const recent = messages
      .filter((m) => m.text !== '' && (m.role === 'user' || m.role === 'assistant'))
      .slice(-12)
      .map((m) => `${m.role}: ${m.text.slice(0, 600)}`)
      .join('\n');

    return [
      `This thread is a fork of "${this.ledger.name}". Its computer starts from that thread's disk.`,
      compaction === undefined ? '' : `Summary of the earlier work:\n${compaction.text}`,
      recent === '' ? '' : `Most recent messages there:\n${recent}`,
    ]
      .filter((part) => part !== '')
      .join('\n\n');
  }

  private modelInfo(id: string): ModelInfo | undefined {
    const saved = this.ledger.modelDetails;

    return pinnedModelInfo(id) ?? (saved?.id === id ? saved : undefined);
  }

  private currentModel(): string {
    return this.ledger.model ?? this.env.MODEL;
  }

  setContextBudget(tokens: number | null): Promise<Usage> {
    return this.using(async () => {
      this.ledger.contextBudget = tokens === null || tokens <= 0 ? null : Math.max(1000, tokens);

      return this.usage();
    });
  }

  async usage(): Promise<Usage> {
    const agent = await this.open();
    const totals = await agent.usage();
    const contextTokens = await agent.contextTokens();
    const model = this.currentModel();

    return {
      ...totals,
      contextTokens,
      contextWindow: Math.min(
        this.ledger.contextBudget ?? Number.POSITIVE_INFINITY,
        this.modelInfo(model)?.context ?? 0,
      ),
    };
  }

  async probe(): Promise<string> {
    const container = this.ctx.container;

    if (container === undefined) return 'no container binding';

    try {
      const process = await container.exec(['/sandbox/bin/echo', 'up'], {});
      const output = await process.output();

      return `exit ${output.exitCode}`;
    } catch (cause) {
      return String(cause).slice(0, 300);
    }
  }

  async wake(): Promise<{ phase: Phase; running: boolean; detail: string }> {
    if (this.ledger.phase !== 'awake' && this.booting === undefined)
      this.ctx.waitUntil(
        this.awake()
          .then(() => {
            this.ledger.wakeError = '';
          })
          .catch((cause: unknown) => {
            this.ledger.wakeError = String(cause).slice(0, 500);
          }),
      );

    return {
      phase: this.ledger.phase,
      running: this.computer().running(),
      detail: JSON.stringify({
        booting: this.booting !== undefined,
        lastError: this.ledger.wakeError,
        images: this.ctx.container?.images ?? null,
      }),
    };
  }

  async startLoop(spec: LoopSpec): Promise<LoopState> {
    const problem = validSpec(spec);

    if (problem !== null) throw new Error(`Invalid loop: ${problem}`);

    const loop: LoopState = {
      ...spec,
      enabled: true,
      runs: [],
      startedCost: (await this.usage()).cost,
      nextAt: Date.now(),
      stoppedBecause: null,
      loopId: crypto.randomUUID(),
    };

    this.ledger.loop = loop;
    await this.publish({ looping: true });
    await this.ctx.storage.setAlarm(Date.now() + IDLE_CHECK_MS);

    return loop;
  }

  async stopLoop(reason = 'stopped by the owner'): Promise<LoopState | null> {
    const loop = this.ledger.loop;

    if (loop === null) return null;
    if (!loop.enabled) return loop;

    await this.finishLoop(loop, reason);

    return this.ledger.loop;
  }

  private loopStillCurrent(snapshot: LoopState): boolean {
    const current = this.ledger.loop;

    return (
      current !== null &&
      current.enabled &&
      current.runs.length === snapshot.runs.length &&
      current.startedCost === snapshot.startedCost &&
      current.loopId === snapshot.loopId
    );
  }

  loopState(): LoopState | null {
    return this.ledger.loop;
  }

  private async finishLoop(loop: LoopState, reason: string) {
    const stopped = { ...loop, enabled: false, stoppedBecause: reason };

    this.ledger.loop = stopped;
    const cost = (await this.usage()).cost;
    await this.publish({ looping: false, spend: cost });
    await this.ledger.logExec(['coil', 'loop-digest'], 0, digest(stopped, cost), 'agent');
  }

  private async loopStep() {
    const loop = this.ledger.loop;

    if (loop === null || !loop.enabled) return;

    const cost = (await this.usage()).cost;
    const owner = await this.ownerEmail();
    const ownerSpend = await this.directory.spendFor(owner);
    const ownerLimit = await this.directory.limitFor(owner);

    if (!this.loopStillCurrent(loop)) return;

    const decision = decide(loop, Date.now(), cost, this.ledger.busy, ownerSpend, ownerLimit);

    if (decision.kind === 'wait') {
      await this.ctx.storage.setAlarm(Math.min(decision.at, Date.now() + AUTO_PAUSE_AFTER_MS));
      return;
    }

    if (decision.kind === 'stop') {
      await this.finishLoop(loop, decision.reason);
      return;
    }

    if (decision.kind === 'check-gate') {
      const gate = await this.execNow(['bash', '-lc', loop.gate ?? 'false']).catch(() => ({
        exitCode: 1,
      }));

      if (!this.loopStillCurrent(loop)) return;
      const runs = loop.runs.map((run, index) =>
        index === loop.runs.length - 1 ? { ...run, gateExit: gate.exitCode } : run,
      );
      const checked = { ...loop, runs };

      if (gate.exitCode === 0) {
        await this.finishLoop(
          checked,
          `gate passed after ${runs.length} run${runs.length === 1 ? '' : 's'}`,
        );
        return;
      }

      this.ledger.loop = checked;
      await this.ctx.storage.setAlarm(Date.now() + IDLE_CHECK_MS);
      return;
    }

    const run = { at: Date.now(), costBefore: cost, gateExit: null };
    const next = {
      ...loop,
      runs: [...loop.runs, run],
      nextAt: Date.now() + loop.everySeconds * 1000,
    };

    this.ledger.loop = next;
    await this.start(
      `loop-${next.runs.length}-${crypto.randomUUID().slice(0, 6)}`,
      `[loop run ${next.runs.length} of at most ${loop.maxRuns}]\n${loop.prompt}`,
    );
  }

  async stop(): Promise<null> {
    if (this.ledger.loop?.enabled === true) await this.stopLoop('stopped by the owner');

    const aborting = this.open().then(async (agent) => {
      await agent.stop();
      await this.settle();
    });

    if (this.computer().running())
      this.ctx.waitUntil(
        this.computer()
          .exec(['bash', '-c', 'pkill -TERM -f "^timeout --kill-after=5" || true'], '/')
          .catch(() => undefined),
      );

    const stopped = await Promise.race([
      aborting.then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), STOP_WAIT_MS)),
    ]);

    if (!stopped) await this.forceSettle();
    this.ctx.waitUntil(aborting.catch(() => undefined));

    return null;
  }

  private async forceSettle() {
    const open = this.ledger.openTurn();

    if (open !== null) this.ledger.finishTurn(open.seq, '', '', 0);

    if (!this.ledger.busy) return;

    this.ledger.busy = false;
    await this.publish({});
    this.state();
  }

  async setModel(id: string, details: ModelInfo | null = null): Promise<Usage> {
    const known = pinnedModelInfo(id) ?? (details?.id === id ? details : undefined);

    if (known === undefined) throw new Error(`Invalid model ${id}`);

    if (this.ledger.busy)
      throw new ThreadBusy('The agent is working. Change the model after the turn ends.');

    const agent = await this.open();

    this.ledger.modelDetails = known;
    await agent.setModel(id);
    this.ledger.model = id;
    await this.publish({ model: id });

    return this.usage();
  }

  async destroyAll(): Promise<null> {
    await this.ctx.storage.deleteAlarm();
    void this.browser?.then((b) => b.close()).catch(() => undefined);
    this.browser = undefined;
    if (this.ctx.container?.running) await this.computer().destroy();
    await this.agent?.then((a) => a.close()).catch(() => undefined);
    this.agent = undefined;
    await this.ctx.storage.deleteAll();

    return null;
  }

  async view(): Promise<ThreadView> {
    const agent = await this.open();

    return {
      name: this.ledger.name ?? '',
      title: (await this.directory.get(this.ledger.name ?? ''))?.title ?? this.ledger.name ?? '',
      phase: this.ledger.phase,
      busy: this.ledger.busy,
      repo: this.ledger.repo,
      running: this.ctx.container?.running ?? false,
      origin: this.ledger.origin,
      owner: await this.ownerEmail(),
      size: this.ledger.size,
      messages: await agent.messages(),
      pairs: this.ledger.pairs(),
      execs: this.ledger.execs(),
      surfaces: this.ledger.surfaces,
      model: this.currentModel(),
      usage: await this.usage(),
      turns: this.ledger.turns(),
    };
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/terminal')) return this.terminalSocket(url);

    if (url.pathname.endsWith('/browser')) return this.browserSocket();

    if (url.pathname.endsWith('/vnc')) return this.vncSocket();

    if (!url.pathname.endsWith('/events')) return new Response('not found', { status: 404 });

    await this.open();

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const send = (event: LiveEvent | { type: 'hello' }) =>
      writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)).catch(() => close());
    const listener = (event: LiveEvent) => void send(event);
    const heartbeat = setInterval(
      () => void writer.write(encoder.encode(': ping\n\n')).catch(() => close()),
      15_000,
    );
    const close = () => {
      clearInterval(heartbeat);
      this.listeners.delete(listener);
      void writer.close().catch(() => undefined);
    };

    this.listeners.add(listener);
    request.signal.addEventListener('abort', close);
    void send({ type: 'hello' });
    this.state();

    return new Response(readable, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      },
    });
  }

  private plugins(): Extension[] {
    return [...this.extensionPlugins(), ...this.connectorPlugins()];
  }

  private extensionPlugins(): Extension[] {
    const saved = this.ledger.extensions;

    if (saved === null) return [];

    const report: unknown = JSON.parse(saved.report);

    return isExtensionReport(report) && report.tools.length > 0
      ? [extensionTools(() => this.awake(), saved.paths, report)]
      : [];
  }

  private connectorPlugins(): Extension[] {
    const namespace = this.env.CONNECTORS;
    const connectors = connectorsOf(this.env);
    const owner = this.ledger.owner;

    if (namespace === undefined || connectors.length === 0 || owner === '') return [];

    const store = () => namespace.getByName(owner);

    return [
      connectorTools(connectors, {
        accessToken: (id) => store().accessToken(id),
        rejected: (id) => store().rejected(id),
      }),
    ];
  }

  async setExtensions(sources: string[]): Promise<string> {
    return this.using(async () => {
      if (this.ledger.busy)
        throw new Error('wait for the agent to finish before changing extensions');

      if (sources.length === 0) {
        this.ledger.extensions = null;
        await this.reopenAgent();

        return JSON.stringify({ tools: [], errors: [], unsupported: [] });
      }

      const computer = await this.awake();
      const paths = await preparePaths(computer, sources);
      const report = await describeExtensions(computer, paths);

      this.ledger.extensions = { paths, report: JSON.stringify(report) };
      await this.reopenAgent();

      return JSON.stringify(report);
    });
  }

  private async reopenAgent() {
    const current = this.agent;

    this.agent = undefined;
    this.unwatch?.();
    this.unwatch = undefined;
    await current?.then((agent) => agent.close()).catch(() => undefined);
  }

  browserOpen(url: string): Promise<string> {
    return this.using(() => this.browserTools().open(url));
  }

  browserSnapshot(): Promise<string> {
    return this.using(() => this.browserTools().snapshot());
  }

  browserClick(ref: string): Promise<string> {
    return this.using(() => this.browserTools().click(ref));
  }

  browserType(text: string, ref?: string): Promise<string> {
    return this.using(() => this.browserTools().type(text, ref));
  }

  browserEval(expression: string): Promise<string> {
    return this.using(() => this.browserTools().evaluate(expression));
  }

  browserScreenshot(): Promise<string> {
    return this.using(async () => (await this.openBrowser()).screenshot());
  }

  browserNewTab(url: string): Promise<string> {
    return this.using(async () => {
      const page = await (await this.openBrowser()).newTab(url);

      return `${page.title === '' ? '(no title)' : page.title}\n${page.url}`;
    });
  }

  browserSwitchTab(index: number): Promise<string> {
    return this.using(async () => {
      const page = await (await this.openBrowser()).switchTab(index);

      return `${page.title === '' ? '(no title)' : page.title}\n${page.url}`;
    });
  }

  browserListTabs(): Promise<string> {
    return this.using(async () => JSON.stringify(await (await this.openBrowser()).tabs()));
  }

  browserGetCookies(): Promise<string> {
    return this.using(async () => JSON.stringify(await (await this.openBrowser()).cookies()));
  }

  browserSetCookies(cookies: readonly import('./browser').BrowserCookie[]): Promise<string> {
    return this.using(async () => {
      await (await this.openBrowser()).setCookies(cookies);

      return `set ${cookies.length} cookies`;
    });
  }

  async addTerminal(): Promise<Surface[]> {
    const current = this.ledger.surfaces;
    let n = 1;

    while (current.some((s) => s.id === `t${n}`)) n += 1;

    this.surfacesChanged([...current, { id: `t${n}`, kind: 'terminal', title: `shell ${n}` }]);

    return this.ledger.surfaces;
  }

  async addBrowser(): Promise<Surface[]> {
    const hadBrowser = this.ledger.surfaces.some((s) => s.kind === 'browser');

    this.ensureBrowserSurface();

    if (hadBrowser) await (await this.openBrowser()).newTab();

    return this.ledger.surfaces;
  }

  async closeSurface(id: string): Promise<Surface[]> {
    const surface = this.ledger.surfaces.find((s) => s.id === id);

    if (surface === undefined) return this.ledger.surfaces;

    if (surface.kind === 'terminal' && this.ctx.container?.running && this.pausing === undefined)
      await this.using(() =>
        this.computer()
          .exec(['tmux', 'kill-session', '-t', `=${id}`])
          .catch(() => undefined),
      );

    if (surface.kind === 'browser') {
      void this.browser?.then((b) => b.close()).catch(() => undefined);
      this.browser = undefined;
    }

    this.surfacesChanged(this.ledger.surfaces.filter((s) => s.id !== id));

    return this.ledger.surfaces;
  }

  private async terminalSocket(url: URL): Promise<Response> {
    const id = url.searchParams.get('id') ?? 't1';
    const size = parseSize(url.searchParams.get('cols') ?? 100, url.searchParams.get('rows') ?? 30);

    if (!SESSION.test(id) || size === null) return new Response('bad terminal', { status: 400 });

    if (!this.ledger.surfaces.some((s) => s.id === id && s.kind === 'terminal'))
      return new Response('unknown terminal', { status: 404 });

    const container = this.ctx.container;

    if (container === undefined) return new Response('no container', { status: 500 });

    const abort = new AbortController();
    const process = await this.using(async () => {
      await this.awake();

      return container.exec(tmuxArgs(id), {
        pty: size,
        env: terminalEnv(),
        cwd: WORKSPACE,
        signal: abort.signal,
      });
    });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];

    server.binaryType = 'arraybuffer';
    server.accept();
    this.watched(server);
    bridge(server, process, abort);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async vncSocket(): Promise<Response> {
    await this.awake();

    const container = this.ctx.container;

    if (container === undefined) return new Response('no container', { status: 500 });

    await this.startDisplay(container);
    this.ctx.waitUntil(
      this.openBrowser().then(
        () => undefined,
        () => undefined,
      ),
    );

    const tcp = await this.untilPort(container, VNC_PORT);
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];

    server.binaryType = 'arraybuffer';
    server.accept();
    this.watched(server);
    pipeSocket(server, tcp);

    return new Response(null, { status: 101, webSocket: client });
  }

  private warmBrowser() {
    if (this.browser !== undefined || this.ctx.container === undefined) return;

    const container = this.ctx.container;

    this.ctx.waitUntil(
      this.startDisplay(container)
        .then(async () => {
          const browser = await this.openBrowser();
          await browser.open('https://example.com').catch(() => undefined);
        })
        .catch(() => undefined),
    );
  }

  private async startDisplay(container: Container) {
    const process = await container.exec(displayArgs(), {
      env: browserEnv(),
      cwd: '/root',
      stdout: 'ignore',
      stderr: 'ignore',
    });

    await process.exitCode;
  }

  private async untilPort(container: Container, port: number): Promise<Socket> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const socket = container.getTcpPort(port).connect(`localhost:${port}`);

        await socket.opened;

        return socket;
      } catch (cause) {
        lastError = cause;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    throw new Error(`port ${port} did not start: ${String(lastError)}`);
  }

  private async browserSocket(): Promise<Response> {
    const browser = await this.openBrowser();
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const page = (p: PageState) => {
      try {
        server.send(JSON.stringify({ page: p }));
      } catch {
        stop();
      }
    };
    const stop = () => browser.pages.delete(page);

    server.accept();
    this.watched(server);
    server.send(JSON.stringify({ page: browser.page }));
    browser.pages.add(page);

    server.addEventListener('message', (event) => {
      void (async () => {
        const input = JSON.parse(String(event.data)) as {
          open?: string;
          back?: true;
          forward?: true;
          reload?: true;
          tab?: true;
        };

        if (input.open) await browser.open(input.open);
        else if (input.back) await browser.back();
        else if (input.forward) await browser.forward();
        else if (input.reload) await browser.reload();
        else if (input.tab) await browser.newTab();
      })().catch((cause) => {
        try {
          server.send(
            JSON.stringify({ error: String(cause instanceof Error ? cause.message : cause) }),
          );
        } catch {
          stop();
        }
      });
    });
    server.addEventListener('close', stop);
    server.addEventListener('error', stop);

    return new Response(null, { status: 101, webSocket: client });
  }

  async kill(reason: string): Promise<void> {
    this.ctx.abort(reason);
  }
}
