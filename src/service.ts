import { GATEWAY_MODELS, MODELS, type ModelInfo } from '../shared/models';
import { credentialsOf } from './auth/refresh';
import { isCloudflareOwner } from './auth/types';
import { type CatalogEntry, fetchCatalog, loadCatalog, mergeCatalog } from './catalog';
import { DIRECTORY_NAME } from './directory-name';
import type { LoopSpec } from './loop';
import { DEFAULT_SIZE, type Size } from './size';
import type { Env } from './thread';

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type CreateInput = {
  readonly owner: string;
  readonly size?: Size;
  readonly name?: string;
  readonly repo?: string | null;
  readonly title?: string;
  readonly createdBy: string;
  readonly warm?: boolean;
};

const fresh = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 6)}`;

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'thread';

export const coil = (env: Env, owner: string) => {
  const directory = env.DIRECTORY.getByName(DIRECTORY_NAME);

  const thread = (name: string) => {
    if (!NAME.test(name)) throw new Error('Thread names are lowercase letters, digits, and dashes');

    return env.THREAD.getByName(name);
  };

  const known = async (name: string) => {
    const summary = await directory.get(name);

    if (summary === null || summary.owner !== owner) throw new Error(`unknown thread ${name}`);

    return thread(name);
  };

  const claimed = async (name: string) => {
    const summary = await directory.get(name);

    if (summary !== null && summary.owner !== owner) throw new Error(`The name ${name} is taken`);

    return thread(name);
  };

  const create = async (input: Omit<CreateInput, 'owner'>) => {
    const name = input.name ?? fresh(slug(input.title ?? input.repo?.split('/').pop() ?? 'thread'));
    const base = input.repo && input.warm !== false ? await directory.base(input.repo) : null;

    return (await claimed(name)).create(name, {
      repo: input.repo ?? null,
      title: input.title,
      createdBy: input.createdBy,
      base: base?.snapshotId,
      owner,
      size: input.size ?? DEFAULT_SIZE,
    });
  };

  const accountRoute = async () => {
    const outcome = await directory.freshToken(owner, credentialsOf(env));

    return outcome._tag === 'Ready' ? { accountId: outcome.accountId, token: outcome.token } : null;
  };

  const liveCatalog = async (): Promise<readonly CatalogEntry[]> => {
    const route = isCloudflareOwner(owner) ? await accountRoute() : null;

    if (route === null) return [];

    const catalog = await loadCatalog({
      stored: () => directory.catalogFor(route.accountId),
      save: (fresh) => directory.saveCatalog(route.accountId, fresh),
      fetchLive: () => fetchCatalog(route.accountId, route.token),
      now: () => Date.now(),
    });

    return catalog.entries;
  };

  const models = async (): Promise<readonly ModelInfo[]> => {
    const live = await liveCatalog().catch((cause: unknown) => {
      console.warn('model catalog unavailable', {
        reason: cause instanceof Error ? cause.message : String(cause),
      });

      return [];
    });

    return live.length === 0 ? MODELS : mergeCatalog(GATEWAY_MODELS, live);
  };

  return {
    models,
    list: () => directory.list(owner),
    create,
    view: async (name: string) => (await known(name)).view(),
    events: async (name: string, request: Request) =>
      (await known(name)).fetch(new Request('https://thread/events', { signal: request.signal })),
    socket: async (name: string, kind: 'terminal' | 'browser' | 'vnc', request: Request) => {
      const url = new URL(request.url);

      return (await known(name)).fetch(new Request(`https://thread/${kind}${url.search}`, request));
    },
    setExtensions: async (name: string, sources: readonly string[]): Promise<unknown> =>
      JSON.parse(await (await known(name)).setExtensions([...sources])),
    browserOpen: async (name: string, url: string) => (await known(name)).browserOpen(url),
    browserSnapshot: async (name: string) => (await known(name)).browserSnapshot(),
    browserClick: async (name: string, ref: string) => (await known(name)).browserClick(ref),
    browserType: async (name: string, text: string, ref?: string) =>
      (await known(name)).browserType(text, ref),
    browserEval: async (name: string, expression: string) =>
      (await known(name)).browserEval(expression),
    browserScreenshot: async (name: string) => (await known(name)).browserScreenshot(),
    browserNewTab: async (name: string, url: string) => (await known(name)).browserNewTab(url),
    browserSwitchTab: async (name: string, index: number) =>
      (await known(name)).browserSwitchTab(index),
    browserListTabs: async (name: string) => (await known(name)).browserListTabs(),
    browserGetCookies: async (name: string) => (await known(name)).browserGetCookies(),
    browserSetCookies: async (name: string, cookies: string) =>
      (await known(name)).browserSetCookies(JSON.parse(cookies) as never),
    attachRepo: async (name: string, repo: string) => (await known(name)).attachRepo(repo),
    computerUsage: async (name: string) => (await known(name)).computerUsage(),
    workspaceManifest: async (name: string) => (await known(name)).workspaceManifest(),
    runJs: async (name: string, code: string, paths: readonly string[] = []) =>
      (await known(name)).runJs(code, paths),
    resetBrowser: async (name: string) => (await known(name)).resetBrowser(),
    recordStep: async (name: string, step: string) =>
      (await known(name)).recordStep(JSON.parse(step) as never),
    goalSave: async (name: string, goal: string, steps: string) =>
      (await known(name)).goalSave(goal, JSON.parse(steps) as never),
    goalRun: async (name: string, goal: string) => (await known(name)).goalRun(goal),
    goalList: async (name: string) => (await known(name)).goalList(),
    sheetSave: async (name: string, sheet: string, goal: string, expectText: string) =>
      (await known(name)).sheetSave(sheet, goal, expectText),
    sheetList: async (name: string) => (await known(name)).sheetList(),
    sheetRun: async (name: string, sheet: string) => (await known(name)).sheetRun(sheet),
    goalClear: async (name: string, goal: string) => (await known(name)).goalClear(goal),
    addTerminal: async (name: string) => (await known(name)).addTerminal(),
    addBrowser: async (name: string) => (await known(name)).addBrowser(),
    closeSurface: async (name: string, id: string) => (await known(name)).closeSurface(id),
    start: async (name: string, requestId: string, text: string) =>
      (await known(name)).start(requestId, text),
    send: async (name: string, requestId: string, text: string) =>
      (await known(name)).send(requestId, text),
    exec: async (name: string, argv: string[]) => (await known(name)).exec(argv),
    setContextBudget: async (name: string, tokens: number | null) =>
      (await known(name)).setContextBudget(tokens),
    wait: async (name: string, seconds: number) => {
      const target = await known(name);
      const answer = await Promise.race([
        target.waitForAnswer(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), seconds * 1000)),
      ]);

      return answer === null ? { done: false, answer: null } : { done: true, answer };
    },
    message: async (from: string, to: string, text: string) => {
      await known(from);
      return (await known(to)).receive(`api-${crypto.randomUUID()}`, from, text);
    },
    read: async (name: string, path: string) => (await known(name)).readFile(path),
    write: async (name: string, path: string, content: string) =>
      (await known(name)).writeFile(path, content),
    list_dir: async (name: string, path: string) => (await known(name)).list(path),
    compact: async (name: string) => (await known(name)).compact(),
    pause: async (name: string) => (await known(name)).pause(),
    resize: async (name: string, size: Size) => (await known(name)).resize(size),
    answer: async (name: string) => (await known(name)).waitForAnswer(),
    fork: async (name: string, forkName: string | undefined, createdBy: string) => {
      const source = await known(name);
      const summary = await directory.get(name);
      const snapshot = await source.snapshot();
      const seed = await source.forkContext();
      const target = forkName ?? fresh(`${name.slice(0, 40)}-fork`);
      const view = await source.view();

      return (await claimed(target)).create(target, {
        repo: summary?.repo ?? null,
        title: `Fork of ${summary?.title ?? name}`,
        createdBy,
        forkedFrom: name,
        base: snapshot.id,
        seed,
        owner,
        size: view.size,
      });
    },
    upload: async (name: string, path: string, bytes: ArrayBuffer) =>
      (await known(name)).upload(path, bytes),
    wake: async (name: string) => (await known(name)).wake(),
    startLoop: async (name: string, spec: LoopSpec) => (await known(name)).startLoop(spec),
    stopLoop: async (name: string) => (await known(name)).stopLoop(),
    getLoop: async (name: string) => (await known(name)).loopState(),
    stopAllLoops: async () => {
      const names = await directory.loopingFor(owner);

      await Promise.all(names.map((name) => thread(name).stopLoop('kill switch')));

      return names;
    },
    share: async (name: string) => {
      await known(name);

      return { path: `/s/${await directory.share(name, owner)}` };
    },
    unshare: async (name: string) => {
      await known(name);
      await directory.unshare(name, owner);

      return null;
    },
    stop: async (name: string) => (await known(name)).stop(),
    setModel: async (name: string, model: string) => {
      const details = (await models()).find((each) => each.id === model);

      if (details === undefined) throw new Error(`Invalid model ${model}`);

      return (await known(name)).setModel(model, { ...details });
    },
    rename: async (name: string, title: string) => {
      await known(name);
      const clean = title.trim().slice(0, 120);

      if (clean === '') throw new Error('Invalid title');

      await directory.upsert({ name, title: clean });

      return (await directory.get(name)) ?? Promise.reject(new Error(`unknown thread ${name}`));
    },
    archive: async (name: string, archived: boolean) => {
      await known(name);
      await directory.upsert({ name, archived });

      return (await directory.get(name)) ?? Promise.reject(new Error(`unknown thread ${name}`));
    },
    folders: () => directory.folders(owner),
    createFolder: (name: string, order?: number) => directory.createFolder(owner, name, order),
    renameFolder: (id: string, name: string) => directory.renameFolder(owner, id, name),
    moveFolder: (id: string, order: number) => directory.moveFolder(owner, id, order),
    deleteFolder: (id: string) => directory.deleteFolder(owner, id),
    fileThread: (name: string, folder: string | null) => directory.fileThread(owner, name, folder),
    moveThreadTo: async (name: string, folderName: string | null) => {
      if (folderName === null || folderName.trim() === '')
        return directory.fileThread(owner, name, null);

      const wanted = folderName.trim().toLowerCase();
      const known = (await directory.folders(owner)).find(
        (folder) => folder.name.toLowerCase() === wanted || folder.id === folderName,
      );
      const folder = known ?? (await directory.createFolder(owner, folderName));

      return directory.fileThread(owner, name, folder.id);
    },
    pin: async (name: string, pinned: boolean) => {
      await known(name);
      await directory.upsert({ name, pinned });

      return (await directory.get(name)) ?? Promise.reject(new Error(`unknown thread ${name}`));
    },
    remove: async (name: string) => {
      const box = await known(name);

      await box.destroyAll();
      await directory.remove(name);

      return null;
    },
    bases: () => directory.bases(),
    prepare: async (repo: string, setup: string) => {
      const name = fresh(`base-${slug(repo.split('/').pop() ?? 'repo')}`);
      const box = thread(name);

      await box.create(name, { repo, title: `Warm base for ${repo}`, createdBy: 'base', owner });

      const ran =
        setup.trim() === ''
          ? { exitCode: 0, stdout: '', stderr: '' }
          : await box.exec(['bash', '-lc', setup]);

      if (ran.exitCode !== 0)
        throw new Error(`setup failed (exit ${ran.exitCode}): ${ran.stderr.slice(0, 400)}`);

      const snapshot = await box.snapshot();

      await directory.setBase(repo, snapshot.id, name, setup);
      await box.pause();

      return { repo, thread: name, snapshot };
    },
  };
};

export type Coil = ReturnType<typeof coil>;

export const sharedView = async (env: Env, token: string) => {
  const directory = env.DIRECTORY.getByName(DIRECTORY_NAME);
  const share = await directory.shared(token);

  if (share === null) return null;

  const summary = await directory.get(share.name);

  if (summary === null || summary.owner !== share.owner) return null;

  return env.THREAD.getByName(share.name).view();
};
