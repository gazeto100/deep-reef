import { CryptoRng } from '@deep-reef/game-service/CryptoRng';
import { GameService } from '@deep-reef/game-service/GameService';
import { DEEP_REEF } from '@deep-reef/math/config/deepReef';
import { MockGameServer, type MockOptions } from './MockGameServer';
import type { KeyValueStorage } from '../storage';
import { PersistentSessionStore } from './PersistentSessionStore';

/**
 * The in-browser "server" for the static demo: the real game core (the same GameService
 * the Node server will use) with Web Crypto randomness and balances persisted in
 * localStorage, behind a simulated network. This module is loaded with a dynamic
 * import(), so builds that use the HTTP transport do not ship the math engine.
 */
export async function createMockGameServer(
  options: MockOptions & { readonly storage?: KeyValueStorage | null } = {},
): Promise<MockGameServer> {
  const service = new GameService({
    definition: DEEP_REEF,
    store: await PersistentSessionStore.open(options.storage ?? null),
    rng: new CryptoRng((array) => crypto.getRandomValues(array)),
    newId: () => crypto.randomUUID(),
  });
  return new MockGameServer(service, options);
}
