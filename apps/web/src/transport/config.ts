import type { MockFaultRates } from './mock/MockGameServer';

export type GameServerKind = 'mock' | 'http';

export interface TransportConfig {
  readonly kind: GameServerKind;
  /** Base URL of the HTTP server (kind 'http'). */
  readonly apiUrl: string | undefined;
  /** Injected failures for the mock: none, or a "flaky network" preset for demos. */
  readonly mockFaults: MockFaultRates;
  readonly timeoutMs: number;
}

/** Light, visible failure rates for demonstrating timeouts and idempotent retries. */
export const FLAKY_NETWORK: MockFaultRates = { network: 0.05, server: 0.03, lostResponse: 0.05 };

/** Raw values, as Vite exposes them on import.meta.env (all strings, all optional). */
export interface TransportEnv {
  readonly VITE_GAME_SERVER?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_MOCK_FAULTS?: string;
  readonly VITE_SERVER_TIMEOUT_MS?: string;
}

/**
 * Reads and validates the transport settings. Invalid values fail loudly at startup
 * instead of silently falling back, so a misconfigured deploy is noticed immediately.
 */
export function readTransportConfig(env: TransportEnv): TransportConfig {
  const kind = env.VITE_GAME_SERVER ?? 'mock';
  if (kind !== 'mock' && kind !== 'http') {
    throw new Error(`VITE_GAME_SERVER must be "mock" or "http", got "${kind}"`);
  }

  const apiUrl = env.VITE_API_URL?.trim() || undefined;
  if (kind === 'http' && !apiUrl) throw new Error('VITE_API_URL is required when VITE_GAME_SERVER=http');

  const faults = env.VITE_MOCK_FAULTS ?? 'none';
  if (faults !== 'none' && faults !== 'flaky') {
    throw new Error(`VITE_MOCK_FAULTS must be "none" or "flaky", got "${faults}"`);
  }

  const timeoutMs = Number(env.VITE_SERVER_TIMEOUT_MS ?? '3000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100) {
    throw new Error(`VITE_SERVER_TIMEOUT_MS must be an integer >= 100, got "${env.VITE_SERVER_TIMEOUT_MS ?? ''}"`);
  }

  return { kind, apiUrl, mockFaults: faults === 'flaky' ? FLAKY_NETWORK : {}, timeoutMs };
}
