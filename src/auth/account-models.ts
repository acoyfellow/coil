import type { Model, Provider } from '@earendil-works/pi-ai';
import { cloudflareAIGatewayProvider } from '@earendil-works/pi-ai/providers/cloudflare-ai-gateway';
import { cloudflareWorkersAIProvider } from '@earendil-works/pi-ai/providers/cloudflare-workers-ai';
import type { ModelInfo } from '../../shared/models';
import type { ModelChoice } from '../agent';
import { isGatewayModel, rewriteBody, upstreamId } from '../gateway';

const WORKERS_AI_CHAT_URL =
  'https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1';

export const liveWorkersAIModel = (details: ModelInfo): Model<'openai-completions'> => ({
  id: details.id,
  name: details.label,
  api: 'openai-completions',
  provider: 'cloudflare-workers-ai',
  baseUrl: WORKERS_AI_CHAT_URL,
  reasoning: false,
  input: details.vision ? ['text', 'image'] : ['text'],
  cost: {
    input: details.inputPerMtok,
    output: details.outputPerMtok,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: details.context,
  maxTokens: Math.min(details.context, 32_768),
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    sendSessionAffinityHeaders: true,
  },
});

export type AccountRoute = {
  readonly accountId: string;
  readonly gateway: string;
  readonly token: string;
};

export type AccountCredentials = {
  readonly route: () => Promise<AccountRoute>;
  readonly rejected?: (token: string) => Promise<AccountRoute>;
};

const TOKEN_REJECTED = 401;

const STRIPPED = ['cf-aig-authorization', 'authorization', 'x-api-key'];

const ACCOUNT_SLOT = '{CLOUDFLARE_ACCOUNT_ID}';

const GATEWAY_SLOT = '{CLOUDFLARE_GATEWAY_ID}';

const filled = (url: string, route: Pick<AccountRoute, 'accountId' | 'gateway'>) =>
  url
    .replaceAll(encodeURIComponent(ACCOUNT_SLOT), encodeURIComponent(route.accountId))
    .replaceAll(encodeURIComponent(GATEWAY_SLOT), encodeURIComponent(route.gateway))
    .replaceAll(ACCOUNT_SLOT, encodeURIComponent(route.accountId))
    .replaceAll(GATEWAY_SLOT, encodeURIComponent(route.gateway));

const withToken =
  (
    credentials: AccountCredentials,
    header: 'authorization' | 'cf-aig-authorization',
    send: typeof fetch,
  ): typeof fetch =>
  async (input, init) => {
    const request = new Request(input, init);
    const body = await rewriteBody(request);
    const attempt = (route: AccountRoute) => {
      const headers = new Headers(request.headers);

      for (const name of STRIPPED) headers.delete(name);
      headers.set(header, `Bearer ${route.token}`);

      return send(
        new Request(filled(request.url, route), {
          method: request.method,
          headers,
          body,
          signal: request.signal,
        }),
      );
    };
    const route = await credentials.route();
    const first = await attempt(route);

    if (first.status !== TOKEN_REJECTED || credentials.rejected === undefined) return first;

    return attempt(await credentials.rejected(route.token));
  };

const accountProvider = (
  stock: Provider,
  credentials: AccountCredentials,
  header: 'authorization' | 'cf-aig-authorization',
  send: typeof fetch,
  extra: readonly Model<'openai-completions'>[] = [],
): Provider => {
  const builtin = stock.getModels();
  const models = [...builtin, ...extra.filter((each) => !builtin.some((m) => m.id === each.id))];
  const routed = withToken(credentials, header, send);

  return {
    ...stock,
    auth: {
      apiKey: {
        name: 'signed-in Cloudflare account',
        resolve: async () => {
          const route = await credentials.route();

          return {
            auth: {
              apiKey: route.token,
              headers: { [header]: 'set-per-request', Authorization: null, 'x-api-key': null },
            },
            source: 'signed-in Cloudflare account',
          };
        },
      },
    },
    getModels: () => models,
    getAllModels: () => models,
    stream: (model, context, options) =>
      stock.stream(model as never, context, { ...options, fetch: routed } as never),
    streamSimple: (model, context, options) =>
      stock.streamSimple(model, context, { ...options, fetch: routed }),
  };
};

export const accountModel = (
  credentials: AccountCredentials,
  id: string,
  send: typeof fetch = (input, init) => globalThis.fetch(input, init),
  live: ModelInfo | null = null,
): ModelChoice =>
  isGatewayModel(id)
    ? {
        provider: accountProvider(
          cloudflareAIGatewayProvider(),
          credentials,
          'cf-aig-authorization',
          send,
        ),
        modelId: upstreamId(id),
        options: {},
      }
    : {
        provider: accountProvider(
          cloudflareWorkersAIProvider(),
          credentials,
          'authorization',
          send,
          live?.id === id ? [liveWorkersAIModel(live)] : [],
        ),
        modelId: id,
        options: {},
      };
