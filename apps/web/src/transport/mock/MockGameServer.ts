import { GameServerError } from '@deep-reef/contract/errors';
import type { AbortSignalLike, GameServer, RequestOptions } from '@deep-reef/contract/GameServer';
import type { Session, SpinRequest, SpinResponse } from '@deep-reef/contract/schemas';
import { sleep, throwIfAborted, waitForAbort } from '../abort';

/**
 * Failures the mock can inject, each at a different point of a request's life:
 * - 'network':       the request never reaches the server (nothing happens);
 * - 'server':        the server fails before committing (HTTP 500, nothing happens);
 * - 'lost-response': the server commits, but the response never arrives. The client
 *                    sees a timeout, and only an idempotent retry recovers the result.
 */
export type MockFault = 'network' | 'server' | 'lost-response';

export interface MockFaultRates {
  readonly network?: number;
  readonly server?: number;
  readonly lostResponse?: number;
}

export interface MockOptions {
  /** Round-trip latency drawn uniformly from this range (ms), split between request and response. */
  readonly latencyMs?: readonly [min: number, max: number];
  /** Probabilities per request (0..1). Default: no faults. */
  readonly faults?: MockFaultRates;
  /** Overrides the random fault choice (tests and demos). */
  readonly chooseFault?: (operation: keyof GameServer) => MockFault | null;
  readonly random?: () => number;
}

export const DEFAULT_MOCK_LATENCY: readonly [number, number] = [150, 400];

/**
 * A GameServer that behaves like a remote one but runs in the page. It wraps a backend
 * (normally GameService) with network latency, injected failures, abort handling and
 * serialisation, so the static demo exercises the same client code paths as a real server.
 */
export class MockGameServer implements GameServer {
  private readonly backend: GameServer;
  private readonly latencyMs: readonly [number, number];
  private readonly chooseFault: (operation: keyof GameServer) => MockFault | null;
  private readonly random: () => number;

  constructor(backend: GameServer, options: MockOptions = {}) {
    this.backend = backend;
    this.latencyMs = options.latencyMs ?? DEFAULT_MOCK_LATENCY;
    this.random = options.random ?? Math.random;
    const rates = options.faults ?? {};
    this.chooseFault = options.chooseFault ?? ((): MockFault | null => this.randomFault(rates));
  }

  createSession(options?: RequestOptions): Promise<Session> {
    return this.call('createSession', options?.signal, () => this.backend.createSession());
  }

  getSession(sessionId: string, options?: RequestOptions): Promise<Session> {
    return this.call('getSession', options?.signal, () => this.backend.getSession(sessionId));
  }

  spin(sessionId: string, request: SpinRequest, options?: RequestOptions): Promise<SpinResponse> {
    return this.call('spin', options?.signal, () => this.backend.spin(sessionId, request));
  }

  private async call<T>(
    operation: keyof GameServer,
    signal: AbortSignalLike | undefined,
    handle: () => Promise<T>,
  ): Promise<T> {
    throwIfAborted(signal);
    const [min, max] = this.latencyMs;
    const roundTrip = Math.round(min + this.random() * (max - min));
    const requestLeg = Math.floor(roundTrip / 2);
    const fault = this.chooseFault(operation);

    await sleep(requestLeg, signal); // request travels to the server
    if (fault === 'network') throw new GameServerError('NETWORK_ERROR', 'mock: connection failed');
    if (fault === 'server') throw new GameServerError('INTERNAL_ERROR', 'mock: server error before commit');

    // The server handles the request. Once it is here, an abort no longer undoes it,
    // exactly like a real server that has already received the request.
    const result = await handle();

    if (fault === 'lost-response') {
      if (signal) await waitForAbort(signal); // hangs until the client gives up
      throw new GameServerError('NETWORK_ERROR', 'mock: response lost after commit');
    }
    await sleep(roundTrip - requestLeg, signal); // response travels back
    return structuredClone(result); // plain data, as if parsed from JSON
  }

  private randomFault(rates: MockFaultRates): MockFault | null {
    const roll = this.random();
    let threshold = rates.network ?? 0;
    if (roll < threshold) return 'network';
    threshold += rates.server ?? 0;
    if (roll < threshold) return 'server';
    threshold += rates.lostResponse ?? 0;
    if (roll < threshold) return 'lost-response';
    return null;
  }
}
