import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureWebkit } from '../src/webkit-patch';

const realShell = (root: string) => ({
  exec: async (argv: string[], options?: { stdin?: ReadableStream }) => {
    const rewritten = argv.map((arg) =>
      arg
        .split('cd / &&')
        .join(`cd ${root} &&`)
        .split('/opt/coil/')
        .join(`${root}/opt/coil/`)
        .split('/usr/libexec/')
        .join(`${root}/usr/libexec/`)
        .split('/tmp/coil-webkit-patch')
        .join(`${root}/staging`),
    );
    const [command = 'false', ...rest] = rewritten;
    const child = spawn(command, rest, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

    if (options?.stdin !== undefined) {
      for await (const chunk of options.stdin as unknown as AsyncIterable<Uint8Array>)
        child.stdin.write(chunk);
    }
    child.stdin.end();

    const exitCode = new Promise<number>((resolve) =>
      child.on('close', (code: number | null) => resolve(code ?? 1)),
    );

    return {
      exitCode,
      output: async () => ({
        exitCode: await exitCode,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      }),
    } as unknown as ExecProcess;
  },
});

const assetsFrom = (dir: string) => ({
  fetch: async (input: RequestInfo | URL) => {
    const name = String(input).split('/').at(-1) ?? '';
    const path = join(dir, name);

    return existsSync(path)
      ? new Response(readFileSync(path))
      : new Response('missing', { status: 404 });
  },
});

const buildPatch = (dir: string) => {
  const source = mkdtempSync(join(tmpdir(), 'patch-src-'));

  mkdirSync(join(source, 'opt/coil'), { recursive: true });
  mkdirSync(join(source, 'usr/libexec/webkitgtk-6.0'), { recursive: true });
  writeFileSync(join(source, 'opt/coil/webkit-host.py'), 'print("host newTab")\n');
  writeFileSync(join(source, 'usr/libexec/webkitgtk-6.0/WebKitWebProcess'), '#!/bin/sh\n', {
    mode: 0o755,
  });
  execFileSync('tar', ['-czf', join(dir, 'patch.tgz'), '-C', source, 'opt', 'usr']);

  const bytes = readFileSync(join(dir, 'patch.tgz'));
  const half = Math.ceil(bytes.length / 2);

  writeFileSync(join(dir, 'part-00.bin'), bytes.subarray(0, half));
  writeFileSync(join(dir, 'part-01.bin'), bytes.subarray(half));
  writeFileSync(join(dir, 'parts.txt'), 'part-00.bin\npart-01.bin\n');
  writeFileSync(join(dir, 'sha256.txt'), `${createHash('sha256').update(bytes).digest('hex')}\n`);
};

describe('ensureWebkit', () => {
  it('installs WebKit on a disk that lacks it, then leaves it alone', async () => {
    const assets = mkdtempSync(join(tmpdir(), 'patch-assets-'));
    const disk = mkdtempSync(join(tmpdir(), 'old-disk-'));

    buildPatch(assets);

    expect(await ensureWebkit(realShell(disk) as never, assetsFrom(assets))).toBe(true);
    expect(readFileSync(join(disk, 'opt/coil/webkit-host.py'), 'utf8')).toContain('host');
    expect(existsSync(join(disk, 'staging'))).toBe(false);
    expect(await ensureWebkit(realShell(disk) as never, assetsFrom(assets))).toBe(false);
  });

  it('reinstalls when the host on disk is older than the patch', async () => {
    const assets = mkdtempSync(join(tmpdir(), 'patch-assets-'));
    const disk = mkdtempSync(join(tmpdir(), 'old-disk-'));

    buildPatch(assets);
    mkdirSync(join(disk, 'opt/coil'), { recursive: true });
    mkdirSync(join(disk, 'usr/libexec/webkitgtk-6.0'), { recursive: true });
    writeFileSync(join(disk, 'opt/coil/webkit-host.py'), 'print("old host")\n');
    writeFileSync(join(disk, 'usr/libexec/webkitgtk-6.0/WebKitWebProcess'), '#!/bin/sh\n', {
      mode: 0o755,
    });

    expect(await ensureWebkit(realShell(disk) as never, assetsFrom(assets))).toBe(true);
    expect(readFileSync(join(disk, 'opt/coil/webkit-host.py'), 'utf8')).toContain('newTab');
    expect(await ensureWebkit(realShell(disk) as never, assetsFrom(assets))).toBe(false);
  });

  it('refuses a patch whose checksum does not match', async () => {
    const assets = mkdtempSync(join(tmpdir(), 'patch-assets-'));
    const disk = mkdtempSync(join(tmpdir(), 'old-disk-'));

    buildPatch(assets);
    writeFileSync(join(assets, 'sha256.txt'), `${'0'.repeat(64)}\n`);

    await expect(ensureWebkit(realShell(disk) as never, assetsFrom(assets))).rejects.toThrow(
      'Could not install WebKit',
    );
    expect(existsSync(join(disk, 'opt/coil/webkit-host.py'))).toBe(false);
  });
});
