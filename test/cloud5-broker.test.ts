import { describe, expect, test } from 'vitest';
import {
  BROKER_HOST,
  brokerFetch,
  brokerRemote,
  brokerTarget,
  credentialFor,
  fromBrokerUrl,
  parseCredentials,
} from '../src/git-broker';

const TOKENS = JSON.stringify([{ host: 'github.com', token: 'ghp_secret', username: 'bot' }]);

const recorder = () => {
  const seen: { url: string; auth: string | null; method: string }[] = [];
  const send = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);

    seen.push({
      url: String(input),
      auth: headers.get('authorization'),
      method: init?.method ?? 'GET',
    });

    return new Response('001e# service=git-upload-pack\n', {
      status: 200,
      headers: { 'content-type': 'application/x-git-upload-pack-advertisement' },
    });
  }) as typeof fetch;

  return { seen, send };
};

describe('git broker', () => {
  test('the box remote points at the broker host and carries no token', () => {
    const remote = brokerRemote('https://github.com/acme/app');

    expect(remote).toBe(`http://${BROKER_HOST}/github.com/acme/app.git`);
    expect(remote).not.toContain('ghp_');
  });

  test('a broker url maps back to the real remote and git service path', () => {
    expect(
      fromBrokerUrl(
        new URL(`http://${BROKER_HOST}/github.com/acme/app.git/info/refs?service=git-upload-pack`),
      ),
    ).toEqual({
      remote: 'https://github.com/acme/app.git',
      path: '/info/refs?service=git-upload-pack',
    });
    expect(fromBrokerUrl(new URL('http://evil.example/github.com/a/b.git/info/refs'))).toBeNull();
    expect(
      fromBrokerUrl(new URL(`http://${BROKER_HOST}/github.com/a/b.git/objects/pack`)),
    ).toBeNull();
  });

  test('only smart-http git paths over https are relayed', () => {
    expect(brokerTarget('https://github.com/a/b.git', '/git-upload-pack', '')?.toString()).toBe(
      'https://github.com/a/b.git/git-upload-pack',
    );
    expect(brokerTarget('http://github.com/a/b.git', '/git-upload-pack', '')).toBeNull();
    expect(brokerTarget('https://github.com/a/b.git', '/info/refs', 'service=rm-rf')).toBeNull();
    expect(brokerTarget('https://github.com/a/b.git', '/admin', '')).toBeNull();
  });

  test('credentials come from the broker env and match by host', () => {
    const credentials = parseCredentials(TOKENS);

    expect(credentialFor(credentials, 'https://github.com/a/b.git')?.token).toBe('ghp_secret');
    expect(credentialFor(credentials, 'https://gitlab.com/a/b.git')).toBeNull();
    expect(parseCredentials('not json')).toEqual([]);
    expect(parseCredentials(undefined)).toEqual([]);
  });

  test('the broker adds the token on the way out and the reply never echoes it', async () => {
    const { seen, send } = recorder();
    const response = await brokerFetch(
      new Request(
        `http://${BROKER_HOST}/github.com/acme/app.git/info/refs?service=git-upload-pack`,
      ),
      parseCredentials(TOKENS),
      send,
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(seen).toEqual([
      {
        url: 'https://github.com/acme/app.git/info/refs?service=git-upload-pack',
        auth: `Basic ${btoa('bot:ghp_secret')}`,
        method: 'GET',
      },
    ]);
    expect(body).not.toContain('ghp_secret');
    expect([...response.headers.values()].join(' ')).not.toContain('ghp_secret');
  });

  test('a host with no credential is relayed without auth, and refused paths never leave', async () => {
    const { seen, send } = recorder();

    await brokerFetch(
      new Request(`http://${BROKER_HOST}/gitlab.com/a/b.git/git-upload-pack`, {
        method: 'POST',
        body: 'x',
      }),
      parseCredentials(TOKENS),
      send,
    );
    const refused = await brokerFetch(
      new Request(`http://${BROKER_HOST}/github.com/a/b.git/settings`),
      parseCredentials(TOKENS),
      send,
    );

    expect(seen.map((call) => [call.url, call.auth])).toEqual([
      ['https://gitlab.com/a/b.git/git-upload-pack', null],
    ]);
    expect(refused.status).toBe(403);
  });
});
