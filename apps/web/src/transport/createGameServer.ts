import type { GameServer } from '@deep-reef/contract/GameServer';
import type { TransportConfig } from './config';
import type { MockOptions } from './mock/MockGameServer';
import type { KeyValueStorage } from './storage';
import { ResilientGameServer, type ResilienceOptions } from './ResilientGameServer';

export interface GameServerOverrides {
  readonly mock?: MockOptions;
  /** Where the mock keeps balances; null keeps them in memory only. */
  readonly storage?: KeyValueStorage | null;
  readonly resilience?: ResilienceOptions;
}

/**
 * Builds the GameServer the client uses, chosen by configuration and always wrapped in
 * ResilientGameServer. The UI only ever sees the GameServer interface, so switching
 * between the in-browser mock and a real server is a configuration change.
 */
export async function createGameServer(
  config: TransportConfig,
  overrides: GameServerOverrides = {},
): Promise<GameServer> {
  let inner: GameServer;
  switch (config.kind) {
    case 'mock': {
      // Dynamic import: HTTP builds do not ship the game engine.
      const { createMockGameServer } = await import('./mock/createMockGameServer');
      inner = await createMockGameServer({
        faults: config.mockFaults,
        storage: overrides.storage ?? null,
        ...overrides.mock,
      });
      break;
    }
    case 'http':
      throw new Error('The HTTP transport arrives in phase 3b; use VITE_GAME_SERVER=mock for now.');
  }
  return new ResilientGameServer(inner, { timeoutMs: config.timeoutMs, ...overrides.resilience });
}
