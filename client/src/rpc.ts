import { Context, Data, Effect, Layer, Schema } from 'effect';
import type { Rpc, RpcGroup } from 'effect/rpc';
import { type CoilError, CoilRpcs, RPC_PATH } from '../../shared/protocol';

export class RpcClientError extends Data.TaggedError('RpcClientError')<{
  readonly message: string;
}> {}

type Rpcs = RpcGroup.Rpcs<typeof CoilRpcs>;

type Call<R> =
  R extends Rpc.Rpc<infer _Tag, infer Payload, infer Success, infer _Error>
    ? (
        ...payload: Payload['Type'] extends null | undefined | void ? [] : [Payload['Type']]
      ) => Effect.Effect<Success['Type'], CoilError | RpcClientError>
    : never;

export type CoilRpcClient = { readonly [R in Rpcs as R['_tag']]: Call<R> };

export class CoilClient extends Context.Service<CoilClient, CoilRpcClient>()('coil/CoilClient') {}

const Reply = Schema.Array(
  Schema.Struct({
    _tag: Schema.Literal('Exit'),
    exit: Schema.Union([
      Schema.Struct({ _tag: Schema.Literal('Success'), value: Schema.Unknown }),
      Schema.Struct({
        _tag: Schema.Literal('Failure'),
        cause: Schema.Array(
          Schema.Struct({ _tag: Schema.String, error: Schema.optional(Schema.Unknown) }),
        ),
      }),
    ]),
  }),
);

const broken = (message: string) => () => new RpcClientError({ message });

let nextId = 0;

const SIGNED_OUT = 401;

const returnPath = () => {
  const path = globalThis.location?.pathname ?? '/';

  return /^\/t\/[a-z0-9-]{1,80}$/.test(path) ? path : '/';
};

const sendToSignIn = () => {
  const back = returnPath();

  globalThis.location.assign(
    back === '/' ? '/oauth/login' : `/oauth/login?return=${encodeURIComponent(back)}`,
  );
};

const post = (body: string) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(RPC_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal,
      });

      if (response.status === SIGNED_OUT) sendToSignIn();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      return response.json() as Promise<unknown>;
    },
    catch: (cause) =>
      new RpcClientError({ message: cause instanceof Error ? cause.message : 'network error' }),
  });

const call = (tag: string, payload: unknown) =>
  Effect.gen(function* () {
    const rpc = CoilRpcs.requests.get(tag);

    if (rpc === undefined)
      return yield* Effect.fail(new RpcClientError({ message: `unknown call ${tag}` }));

    const encoded = yield* Schema.encodeUnknownEffect(rpc.payloadSchema)(payload ?? null).pipe(
      Effect.mapError(broken('could not encode the request')),
    );

    nextId += 1;

    const raw = yield* post(
      JSON.stringify({
        _tag: 'Request',
        id: String(nextId),
        tag,
        payload: encoded ?? null,
        headers: [],
      }),
    );
    const [reply] = yield* Schema.decodeUnknownEffect(Reply)(raw).pipe(
      Effect.mapError(broken('unexpected reply')),
    );

    if (reply === undefined)
      return yield* Effect.fail(new RpcClientError({ message: 'empty reply' }));

    if (reply.exit._tag === 'Success')
      return yield* Schema.decodeUnknownEffect(rpc.successSchema)(reply.exit.value).pipe(
        Effect.mapError(broken('unexpected value')),
      );

    const failure = reply.exit.cause.find((part) => part._tag === 'Fail');

    if (failure === undefined)
      return yield* Effect.fail(new RpcClientError({ message: 'the server failed' }));

    const error = yield* Schema.decodeUnknownEffect(rpc.errorSchema)(failure.error).pipe(
      Effect.mapError(broken('unexpected error')),
    );

    return yield* Effect.fail(error as CoilError);
  });

export const client = new Proxy(
  {},
  { get: (_target, tag) => (payload?: unknown) => call(String(tag), payload) },
) as CoilRpcClient;

export const CoilClientLive = Layer.succeed(CoilClient, client);
