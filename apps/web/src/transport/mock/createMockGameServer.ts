import { CryptoRng } from '@deep-reef/game-service/CryptoRng';
import { GameService } from '@deep-reef/game-service/GameService';
import { InMemorySessionStore } from '@deep-reef/game-service/InMemorySessionStore';
import { DEEP_REEF } from '@deep-reef/math/config/deepReef';
import { MockGameServer, type MockOptions } from './MockGameServer';

/**
 * The in-browser "server" for the static demo: the real game core (the same GameService
 * the Node server will use) with in-memory storage and Web Crypto randomness, behind a
 * simulated network. This module is loaded with a dynamic import(), so builds that use
 * the HTTP transport do not ship the math engine.
 */
export function createMockGameServer(options: MockOptions = {}): MockGameServer {
  const service = new GameService({
    definition: DEEP_REEF,
    store: new InMemorySessionStore(),
    rng: new CryptoRng((array) => crypto.getRandomValues(array)),
    newId: () => crypto.randomUUID(),
  });
  return new MockGameServer(service, options);
}
