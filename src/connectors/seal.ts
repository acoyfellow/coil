const VERSION = 'v1';
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MIN_KEY_BYTES = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  return bytes;
};

export class SealKeyMissing extends Error {}

const masterKey = (secret: string | undefined): Promise<CryptoKey> => {
  if (secret === undefined || encoder.encode(secret).length < MIN_KEY_BYTES)
    throw new SealKeyMissing(
      'CONNECTOR_SEAL_KEY is not set: connectors cannot store sign-in tokens on this instance',
    );

  return crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
};

const ownerKey = async (secret: string | undefined, owner: string, salt: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(`coil-connector|${owner}`) },
    await masterKey(secret),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

const randomBytes = (length: number): Uint8Array<ArrayBuffer> =>
  crypto.getRandomValues(new Uint8Array(new ArrayBuffer(length)));

export const seal = async (
  secret: string | undefined,
  owner: string,
  plaintext: string,
): Promise<string> => {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`${VERSION}|${owner}`) },
    await ownerKey(secret, owner, salt),
    encoder.encode(plaintext),
  );

  return [VERSION, toBase64Url(salt), toBase64Url(iv), toBase64Url(new Uint8Array(sealed))].join(
    '.',
  );
};

export const unseal = async (
  secret: string | undefined,
  owner: string,
  blob: string,
): Promise<string> => {
  const [version, salt, iv, body, ...rest] = blob.split('.');

  if (
    version !== VERSION ||
    salt === undefined ||
    iv === undefined ||
    body === undefined ||
    rest.length > 0
  )
    throw new Error('sealed token has the wrong shape');

  const opened = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(iv),
      additionalData: encoder.encode(`${VERSION}|${owner}`),
    },
    await ownerKey(secret, owner, fromBase64Url(salt)),
    fromBase64Url(body),
  );

  return decoder.decode(opened);
};
