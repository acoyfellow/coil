import { createModels } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';
import { GATEWAY_MODELS } from '../shared/models';
import {
  adaptiveThinking,
  bindingBaseUrl,
  externalBaseUrl,
  gatewayModel,
  isGatewayModel,
  rewriteBody,
  upstreamId,
} from '../src/gateway';

type Seen = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

const fakeAi = (seen: Seen[]) =>
  ({
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);

      seen.push({
        url: request.url,
        headers: Object.fromEntries(request.headers),
        body: (await request.json()) as Record<string, unknown>,
      });

      return new Response('upstream says no', { status: 402 });
    },
  }) as unknown as Ai;

const runOnce = async (id: string) => {
  const seen: Seen[] = [];
  const choice = gatewayModel(fakeAi(seen), 'my-gw', id);
  const models = createModels(choice.options);

  models.setProvider(choice.provider);

  const model = models.getModel(choice.provider.id, choice.modelId);

  if (model === undefined) throw new Error(`no model ${choice.modelId}`);

  await models.complete(model, { messages: [{ role: 'user', content: 'hi', timestamp: 0 }] });

  return seen;
};

describe('AI Gateway models', () => {
  it('names gateway models with a prefix and strips it for the upstream id', () => {
    expect(isGatewayModel('gateway/claude-opus-5-5')).toBe(true);
    expect(isGatewayModel('@cf/zai-org/glm-5.3')).toBe(false);
    expect(upstreamId('gateway/gpt-6.1-sol')).toBe('gpt-6.1-sol');
  });

  it('routes each provider API to its gateway path on the binding', () => {
    expect(bindingBaseUrl('jordan', 'anthropic-messages')).toBe(
      'https://workers-binding.ai/ai-gateway/gateways/jordan/anthropic',
    );
    expect(bindingBaseUrl('jordan', 'openai-responses')).toBe(
      'https://workers-binding.ai/ai-gateway/gateways/jordan/openai',
    );
  });

  it('knows every listed gateway model', async () => {
    for (const info of GATEWAY_MODELS) {
      const choice = gatewayModel(fakeAi([]), 'g', info.id);

      expect(choice.provider.getModels().some((m) => m.id === choice.modelId)).toBe(true);
    }
  });

  it('sends Claude as Anthropic messages through the binding with no API key', async () => {
    const [sent] = await runOnce('gateway/claude-opus-5-5');

    expect(sent?.url.split('?')[0]).toBe(
      'https://workers-binding.ai/ai-gateway/gateways/my-gw/anthropic/v1/messages',
    );
    expect(sent?.body.model).toBe('claude-opus-5-5');
    expect((sent?.body.thinking as { type?: string } | undefined)?.type ?? 'adaptive').toBe(
      'adaptive',
    );
    expect(sent?.headers.authorization).toBeUndefined();
    expect(sent?.headers['x-api-key']).toBeUndefined();
    expect(sent?.headers['cf-aig-authorization']).toBeUndefined();
  });

  it('sends GPT as OpenAI responses through the binding', async () => {
    const [sent] = await runOnce('gateway/gpt-6.1-sol');

    expect(sent?.url).toBe('https://workers-binding.ai/ai-gateway/gateways/my-gw/openai/responses');
    expect(sent?.body.model).toBe('gpt-6.1-sol');
    expect(sent?.headers.authorization).toBeUndefined();
  });
});

describe('Anthropic thinking', () => {
  it('turns disabled or enabled thinking into adaptive, which current Claude models require', () => {
    expect(adaptiveThinking({ thinking: { type: 'disabled' } }).thinking).toEqual({
      type: 'adaptive',
    });
    expect(
      adaptiveThinking({ thinking: { type: 'enabled', budget_tokens: 1024 } }).thinking,
    ).toEqual({
      type: 'adaptive',
    });
    expect(adaptiveThinking({ model: 'x' })).toEqual({ model: 'x' });
  });
});

describe('an external model gateway', () => {
  const gateway = { url: 'https://gw.example/openai', header: 'cf-access-token', token: 'tok' };

  it('maps each API to a sibling path on the gateway', () => {
    expect(externalBaseUrl(gateway, 'anthropic-messages')).toBe('https://gw.example/anthropic');
    expect(externalBaseUrl(gateway, 'openai-responses')).toBe('https://gw.example/openai');
    expect(externalBaseUrl({ ...gateway, url: 'https://gw.example/' }, 'openai-responses')).toBe(
      'https://gw.example/openai',
    );
  });

  it('sends the configured token header and no provider key', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const original = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);

      seen.push({ url: request.url, headers: Object.fromEntries(request.headers) });

      return new Response('no', { status: 401 });
    };

    try {
      const choice = gatewayModel({} as Ai, 'unused', 'gateway/claude-opus-5-5', gateway);
      const models = createModels(choice.options);

      models.setProvider(choice.provider);

      const model = models.getModel(choice.provider.id, choice.modelId);

      if (model === undefined) throw new Error('no model');

      await models.complete(model, { messages: [{ role: 'user', content: 'hi', timestamp: 0 }] });
    } finally {
      globalThis.fetch = original;
    }

    expect(seen[0]?.url.split('?')[0]).toBe('https://gw.example/anthropic/v1/messages');
    expect(seen[0]?.headers['cf-access-token']).toBe('tok');
    expect(seen[0]?.headers['x-api-key']).toBeUndefined();
    expect(seen[0]?.headers.authorization).toBeUndefined();
  });
});

describe('Workers AI chat bodies', () => {
  const chat = (messages: unknown[]) =>
    new Request('https://api.cloudflare.com/client/v4/accounts/a/ai/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages }),
    });

  it('text-only array content becomes a string and null assistant content becomes empty', async () => {
    const body = await rewriteBody(
      chat([
        { role: 'system', content: [{ type: 'text', text: 'be brief' }] },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'a' },
            { type: 'text', text: 'b' },
          ],
        },
        { role: 'assistant', content: null, tool_calls: [{ id: '1' }] },
      ]),
    );

    expect(JSON.parse(String(body)).messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'a\nb' },
      { role: 'assistant', content: '', tool_calls: [{ id: '1' }] },
    ]);
  });

  it('content with an image stays an array', async () => {
    const parts = [
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'data:x' } },
    ];
    const body = await rewriteBody(chat([{ role: 'user', content: parts }]));

    expect(JSON.parse(String(body)).messages[0].content).toEqual(parts);
  });
});
