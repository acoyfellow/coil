import type { coil } from '../../src/service';

type Api = ReturnType<typeof coil>;

type Probe = (api: Api, run: string) => Promise<Response>;

const lazy: Probe = async (api, run) => {
  const name = `lazy-${run}`;

  await api.create({ name, createdBy: 'test' });

  const afterCreate = await api.computerUsage(name);
  const answered = await api.send(name, 'r1', 'hi');
  const afterChat = await api.computerUsage(name);
  const view = await api.view(name);

  await api.exec(name, ['bash', '-lc', 'true']);

  const afterExec = await api.computerUsage(name);

  return Response.json({
    answer: answered.answer,
    bootsAfterCreate: afterCreate.boots,
    bootsAfterChat: afterChat.boots,
    runningAfterChat: view.running,
    bootsAfterExec: afterExec.boots,
  });
};

const usage: Probe = async (api, run) => {
  const name = `usage-${run}`;

  await api.create({ name, createdBy: 'test' });
  await api.exec(name, ['bash', '-lc', 'true']);
  await api.pause(name);

  const paused = await api.computerUsage(name);

  return Response.json({
    boots: paused.boots,
    awakeMs: paused.awakeMs,
    toolMs: paused.toolMs,
    awakeSince: paused.awakeSince,
  });
};

const workspace: Probe = async (api, run) => {
  const name = `ws-${run}`;

  await api.create({ name, createdBy: 'test' });
  await api.write(name, 'notes/plan.md', '# plan');
  await api.write(name, 'a.txt', 'alpha');

  const read = await api.read(name, 'notes/plan.md');
  const root = await api.list_dir(name, '.');
  const asleep = await api.computerUsage(name);
  const held = await api.workspaceManifest(name);

  await api.exec(name, ['bash', '-lc', 'true']);

  const onDisk = await api.read(name, 'a.txt');
  const after = await api.workspaceManifest(name);

  return Response.json({
    read,
    root,
    bootsWhileAsleep: asleep.boots,
    heldBeforeBoot: held.files.map((file) => file.path),
    onDisk,
    heldAfterBoot: after.files.length,
    sealed: after.sealed,
  });
};

const runjs: Probe = async (api, run) => {
  const name = `js-${run}`;

  await api.create({ name, createdBy: 'test' });
  await api.write(name, 'data.json', JSON.stringify([3, 4, 5]));

  const summed = await api.runJs(
    name,
    "const xs = JSON.parse(fs.read('data.json')); const total = xs.reduce((a, b) => a + b, 0); fs.write('total.txt', String(total)); console.log('sum', total); return total;",
  );
  const sealedNet = await api.runJs(name, "await fetch('https://example.com'); return 'reached';");
  const thrown = await api.runJs(name, "throw new Error('boom');");
  const total = await api.read(name, 'total.txt');
  const usage = await api.computerUsage(name);

  return Response.json({ summed, sealedNet, thrown, total, boots: usage.boots });
};

const forkdebug: Probe = async (api, run) => {
  const name = `fd-${run}`;

  await api.create({ name, createdBy: 'mcp', title: 'parent' });
  await api.send(name, 'r1', 'write plan.txt containing the plan');

  const parentHeld = await api.workspaceManifest(name);
  const parentRead = await api.read(name, 'plan.txt').catch((e: Error) => `ERR ${e.message}`);
  const forked = await api.fork(name, `${name}-f`, 'web');
  const forkHeld = await api.workspaceManifest(forked.name);
  const forkSees = await api.read(forked.name, 'plan.txt').catch((e: Error) => `ERR ${e.message}`);

  return Response.json({ parentHeld, parentRead, forkHeld, forkSees });
};

const folders: Probe = async (api, run) => {
  const a = `fa-${run}`;
  const b = `fb-${run}`;

  await api.create({ name: a, createdBy: 'test' });
  await api.create({ name: b, createdBy: 'test' });

  const coil = await api.createFolder('  Coil   work ');
  const other = await api.createFolder('Customer0');
  const renamed = await api.renameFolder(coil.id, 'Coil');
  const filed = await api.fileThread(a, coil.id);
  const byAgent = await api.moveThreadTo(b, 'personal');
  const reused = await api.moveThreadTo(b, 'PERSONAL');
  const moved = await api.moveFolder(other.id, 0);
  const order = (await api.folders()).map((folder) => folder.name);
  const badFolder = await api.fileThread(a, 'f-nope').then(
    () => 'accepted',
    (error: Error) => error.message,
  );
  const emptyName = await api.createFolder('   ').then(
    () => 'accepted',
    (error: Error) => error.message,
  );

  await api.deleteFolder(coil.id);

  const afterDelete = (await api.list()).find((thread) => thread.name === a);
  const unfiled = await api.moveThreadTo(b, null);

  return Response.json({
    firstName: coil.name,
    renamed: renamed.name,
    filedFolder: filed.folder,
    coilId: coil.id,
    agentFolderName: (await api.folders()).find((folder) => folder.id === byAgent.folder)?.name,
    reusedSame: reused.folder === byAgent.folder,
    movedOrder: moved.order,
    order,
    badFolder,
    emptyName,
    afterDeleteFolder: afterDelete?.folder ?? null,
    threadStillThere: afterDelete !== undefined,
    unfiled: unfiled.folder,
  });
};

export const cloud5Probes: Readonly<Record<string, Probe>> = {
  '/cloud5-lazy': lazy,
  '/cloud5-usage': usage,
  '/cloud5-workspace': workspace,
  '/cloud5-runjs': runjs,
  '/folders': folders,
  '/cloud5-forkdebug': forkdebug,
};
