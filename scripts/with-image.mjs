import { readFileSync, writeFileSync } from 'node:fs';

const image = process.env.NIX_IMAGE;

if (!image) {
  console.error('Set NIX_IMAGE to your nix-cf-proof image reference in your account registry.');
  process.exit(2);
}

const source = readFileSync('wrangler.jsonc', 'utf8');
const withImage = source.replace(
  '"dockerfile": "./computer/Dockerfile" }',
  `"dockerfile": "./computer/Dockerfile", "build_vars": { "NIX_IMAGE": ${JSON.stringify(image)}, "APK_PLAIN_HTTP": ${JSON.stringify(process.env.APK_PLAIN_HTTP ?? '0')} } }`,
);

if (withImage === source) {
  console.error('wrangler.jsonc has no computer image to configure');
  process.exit(2);
}

const workerName = process.env.COIL_WORKER_NAME ?? '';
const named =
  workerName === ''
    ? withImage
    : withImage.replace('"name": "coil",', `"name": ${JSON.stringify(workerName)},`);

if (workerName !== '' && named === withImage) {
  console.error(
    `COIL_WORKER_NAME=${workerName} was set but wrangler.jsonc has no "name": "coil", line to replace; refusing to deploy over the default worker.`,
  );
  process.exit(2);
}

const workersDev = process.env.COIL_WORKERS_DEV === '1';
const routed = workersDev
  ? named.replace('"compatibility_flags"', '"workers_dev": true,\n  "compatibility_flags"')
  : named;

if (workersDev && routed === named) {
  console.error(
    'COIL_WORKERS_DEV=1 but wrangler.jsonc has no compatibility_flags line to anchor on.',
  );
  process.exit(2);
}

writeFileSync(process.env.COIL_WRANGLER_CONFIG ?? 'wrangler.local.jsonc', routed);
