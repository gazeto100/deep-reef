import { GameServerError } from '@deep-reef/contract/errors';
import type { GameServer } from '@deep-reef/contract/GameServer';
import { GameService } from '@deep-reef/game-service/GameService';
import { InMemorySessionStore } from '@deep-reef/game-service/InMemorySessionStore';
import { sequentialIds } from '@deep-reef/game-service/testing';
import { DEEP_REEF } from '@deep-reef/math/config/deepReef';
import { Xoshiro128 } from '@deep-reef/math/rng/Xoshiro128';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResilientGameServer } from '../ResilientGameServer';
import { MockGameServer, type MockFault } from './MockGameServer';

function makeBackend(): GameService<string> {
  return new GameService<string>({
    definition: DEEP_REEF,
    store: new InMemorySessionStore(),
    rng: new Xoshiro128(7),
    newId: sequentialIds(),
  });
}

/** Faults chosen per spin call, in order; other operations never fail. */
function faultsForSpins(...faults: (MockFault | null)[]): (operation: keyof GameServer) => MockFault | null {
  return (operation) => (operation === 'spin' ? (faults.shift() ?? null) : null);
}

const REQUEST = { requestId: '00000000-0000-4000-8000-0000000000aa', bet: 100 };

async function settle<T>(promise: Promise<T>, ms: number): Promise<T> {
  const result = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(ms);
  await vi.runAllTimersAsync(); // chained zero-delay legs schedule new timers
  const outcome = await result;
  if ('error' in outcome) throw outcome.error;
  return outcome.value;
}

describe('MockGameServer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('answers after a latency drawn from 150-400 ms', async () => {
    const mock = new MockGameServer(makeBackend(), { random: () => 0.5 }); // 275 ms round trip
    let done = false;
    const session = mock.createSession().then((s) => {
      done = true;
      return s;
    });

    await vi.advanceTimersByTimeAsync(274);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await session).balance).toBe(10_000);
  });

  it('returns plain, independent data, as if parsed from JSON', async () => {
    const backend = makeBackend();
    const mock = new MockGameServer(backend, { latencyMs: [0, 0] });
    const { sessionId } = await settle(mock.createSession(), 0);
    const response = await settle(mock.spin(sessionId, REQUEST), 0);

    expect(Object.isFrozen(response)).toBe(false); // the service's stored copy is frozen
    response.round.base.grid[0] = ['MUTATED'];
    const replay = await backend.spin(sessionId, REQUEST);
    expect(replay.round.base.grid[0]).not.toEqual(['MUTATED']);
  });

  it('a network fault never reaches the server; a server fault never commits', async () => {
    const backend = makeBackend();
    const mock = new MockGameServer(backend, { latencyMs: [0, 0], chooseFault: faultsForSpins('network', 'server') });
    const { sessionId } = await settle(mock.createSession(), 0);

    await expect(settle(mock.spin(sessionId, REQUEST), 0)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await expect(settle(mock.spin(sessionId, REQUEST), 0)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect((await backend.getSession(sessionId)).balance).toBe(10_000);
  });

  it('a lost response commits on the server but never reaches the client', async () => {
    const backend = makeBackend();
    const mock = new MockGameServer(backend, { latencyMs: [0, 0], chooseFault: faultsForSpins('lost-response') });
    const { sessionId } = await settle(mock.createSession(), 0);

    await expect(settle(mock.spin(sessionId, REQUEST), 0)).rejects.toBeInstanceOf(GameServerError);
    expect((await backend.getSession(sessionId)).balance).not.toBe(10_000); // charged, result unseen
  });

  it('an abort before the request arrives leaves the server untouched', async () => {
    const backend = makeBackend();
    const mock = new MockGameServer(backend, { latencyMs: [400, 400] });
    const { sessionId } = await settle(mock.createSession(), 400);
    const controller = new AbortController();

    const outcome = mock.spin(sessionId, REQUEST, { signal: controller.signal });
    controller.abort();
    await expect(settle(outcome, 400)).rejects.toMatchObject({ code: 'ABORTED' });
    expect((await backend.getSession(sessionId)).balance).toBe(10_000);
  });
});

describe('lost response + idempotent retry (mock, resilient client, game core)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('recovers the committed round on retry and charges exactly once', async () => {
    const backend = makeBackend();
    const backendSpin = vi.spyOn(backend, 'spin');
    const mock = new MockGameServer(backend, {
      latencyMs: [200, 200],
      chooseFault: faultsForSpins('lost-response', null),
    });
    const client = new ResilientGameServer(mock, { timeoutMs: 1000, maxAttempts: 3, backoffMs: [250] });
    const { sessionId } = await settle(client.createSession(), 200);

    // Attempt 1: committed, response lost, times out at 1000 ms. Backoff 250 ms.
    // Attempt 2: same requestId, the server replays the stored round.
    const response = await settle(client.spin(sessionId, REQUEST), 1000 + 250 + 200);

    expect(backendSpin).toHaveBeenCalledTimes(2);
    expect(response.replayed).toBe(true);
    expect(response.balanceBefore).toBe(10_000);
    expect((await backend.getSession(sessionId)).balance).toBe(10_000 - REQUEST.bet + response.win);
  });
});
