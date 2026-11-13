import { WorkerEntrypoint } from 'cloudflare:workers';
import {
  type BrokerEnv,
  type BrokerReply,
  type BrokerRequest,
  brokerFetch,
  parseCredentials,
  relay,
} from './git-broker';

export class GitBroker extends WorkerEntrypoint<BrokerEnv> {
  protected send: typeof fetch = (input, init) => fetch(input, init);

  override async fetch(request: Request): Promise<Response> {
    return brokerFetch(request, parseCredentials(this.env.GIT_TOKENS), this.send);
  }

  async relay(request: BrokerRequest): Promise<BrokerReply> {
    return relay(request, parseCredentials(this.env.GIT_TOKENS), this.send);
  }

  async hosts(): Promise<string[]> {
    return parseCredentials(this.env.GIT_TOKENS).map((credential) => credential.host);
  }
}
