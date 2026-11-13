import type { GitBroker } from './git-broker-entry';
import type { CoilBridge } from './run';

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: { CoilBridge: typeof CoilBridge; GitBroker: typeof GitBroker };
    }
  }
}
