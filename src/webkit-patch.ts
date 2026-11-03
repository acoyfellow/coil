import { SHELL_ENV } from './env';

export const WEBKIT_PATCH_PATH = '/webkit-patch';

export const WEBKIT_PATCH_MARKER = '/opt/coil/webkit-host.py';

export const WEBKIT_PATCH_STAGING = '/tmp/coil-webkit-patch';

type PatchContainer = Pick<Container, 'exec'>;

type PatchAssets = Pick<Fetcher, 'fetch'>;

const assetUrl = (name: string) => `https://assets.invalid${WEBKIT_PATCH_PATH}/${name}`;

const fetchText = async (assets: PatchAssets, name: string) => {
  const response = await assets.fetch(assetUrl(name));

  if (!response.ok)
    throw new Error(`The WebKit patch file ${name} is missing (${response.status}).`);

  return (await response.text()).trim();
};

const run = async (container: PatchContainer, script: string, ...args: string[]) => {
  const process = await container.exec(['bash', '-c', script, 'webkit-patch', ...args], {
    cwd: '/',
    env: SHELL_ENV,
  });
  const output = await process.output();
  const text = new TextDecoder();

  return {
    exitCode: output.exitCode,
    stderr: typeof output.stderr === 'string' ? output.stderr : text.decode(output.stderr),
  };
};

export const hasWebkit = async (container: PatchContainer) =>
  (
    await run(
      container,
      'test -f "$1" && test -x /usr/libexec/webkitgtk-6.0/WebKitWebProcess',
      WEBKIT_PATCH_MARKER,
    )
  ).exitCode === 0;

const writePart = async (container: PatchContainer, path: string, body: ReadableStream) => {
  const process = await container.exec(['bash', '-c', 'cat > "$1"', 'webkit-part', path], {
    cwd: '/',
    env: SHELL_ENV,
    stdin: body,
  });

  return process.exitCode;
};

export const installWebkit = async (container: PatchContainer, assets: PatchAssets) => {
  const parts = (await fetchText(assets, 'parts.txt'))
    .split('\n')
    .filter((part) => part.length > 0);
  const sha256 = await fetchText(assets, 'sha256.txt');

  await run(container, 'rm -rf "$1" && mkdir -p "$1"', WEBKIT_PATCH_STAGING);

  for (const part of parts) {
    const response = await assets.fetch(assetUrl(part));

    if (!response.ok || response.body === null)
      throw new Error(`The WebKit patch part ${part} is missing (${response.status}).`);

    const code = await writePart(container, `${WEBKIT_PATCH_STAGING}/${part}`, response.body);

    if (code !== 0) throw new Error(`Could not copy the WebKit patch part ${part} (exit ${code}).`);
  }

  const installed = await run(
    container,
    [
      'set -e',
      'cd "$1"',
      'cat $3 > patch.tgz',
      'echo "$2  patch.tgz" | sha256sum -c - >/dev/null',
      'cd / && tar -xzf "$1/patch.tgz"',
      'rm -rf "$1"',
    ].join('\n'),
    WEBKIT_PATCH_STAGING,
    sha256,
    parts.join(' '),
  );

  if (installed.exitCode !== 0)
    throw new Error(`Could not install WebKit: ${installed.stderr.trim().slice(-300)}`);
};

export const ensureWebkit = async (container: PatchContainer, assets: PatchAssets) => {
  if (await hasWebkit(container)) return false;

  await installWebkit(container, assets);

  if (!(await hasWebkit(container))) throw new Error('WebKit is still missing after the patch.');

  return true;
};
