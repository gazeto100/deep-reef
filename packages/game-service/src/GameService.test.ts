import { GameServerError } from '@deep-reef/contract/errors';
import { CreateSessionResponse, SpinResponse } from '@deep-reef/contract/schemas';
import { DEEP_REEF } from '@deep-reef/math/config/deepReef';
import { TEST_GAME } from '@deep-reef/math/engine/testGame.fixture';
import { ScriptedRng } from '@deep-reef/math/rng/ScriptedRng';
import { Xoshiro128 } from '@deep-reef/math/rng/Xoshiro128';
import Value from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { GameService, type GameServiceOptions } from './GameService';
import { InMemorySessionStore } from './InMemorySessionStore';
import { sequentialIds } from './testing';

const requestIds = sequentialIds(7);

function makeService(overrides: Partial<GameServiceOptions<string>> = {}): GameService<string> {
  return new GameService<string>({
    definition: DEEP_REEF,
    store: new InMemorySessionStore(),
    rng: new Xoshiro128(42),
    newId: sequentialIds(),
    ...overrides,
  });
}

async function expectError(promise: Promise<unknown>, code: string, status: number): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(GameServerError);
  expect((error as GameServerError).code).toBe(code);
  expect((error as GameServerError).status).toBe(status);
}

describe('GameService', () => {
  it('creates an anonymous session with 10,000 credits and the game config', async () => {
    const service = makeService();
    const session = await service.createSession();

    expect(Value.Check(CreateSessionResponse, session)).toBe(true);
    expect(session.balance).toBe(10_000);
    expect(session.config.betLevels).toEqual([...DEEP_REEF.betLevels]);
    await expect(service.getSession(session.sessionId)).resolves.toEqual({
      sessionId: session.sessionId,
      balance: 10_000,
    });
  });

  it('plays a spin: debits the bet, credits the win, returns a contract-valid response', async () => {
    const service = makeService();
    const { sessionId } = await service.createSession();

    const response = await service.spin(sessionId, { requestId: requestIds(), bet: 100 });

    expect(Value.Check(SpinResponse, response)).toBe(true);
    expect(response.replayed).toBe(false);
    expect(response.balanceBefore).toBe(10_000);
    expect(response.balanceAfter).toBe(10_000 - 100 + response.win);
    expect(response.win).toBe(response.round.totalWin);
    expect((await service.getSession(sessionId)).balance).toBe(response.balanceAfter);
  });

  it('rejects a bet larger than the balance with INSUFFICIENT_FUNDS (422) and changes nothing', async () => {
    const service = makeService({ startingBalance: 30 });
    const { sessionId } = await service.createSession();

    await expectError(service.spin(sessionId, { requestId: requestIds(), bet: 40 }), 'INSUFFICIENT_FUNDS', 422);
    expect((await service.getSession(sessionId)).balance).toBe(30);
  });

  it('replays a repeated requestId: same result, replayed: true, charged once', async () => {
    const service = makeService();
    const { sessionId } = await service.createSession();
    const request = { requestId: requestIds(), bet: 200 };

    const first = await service.spin(sessionId, request);
    const again = await service.spin(sessionId, request);

    expect(again).toEqual({ ...first, replayed: true });
    expect((await service.getSession(sessionId)).balance).toBe(first.balanceAfter);
  });

  it('rejects a reused requestId with a different bet as IDEMPOTENCY_CONFLICT (409)', async () => {
    const service = makeService();
    const { sessionId } = await service.createSession();
    const requestId = requestIds();
    const first = await service.spin(sessionId, { requestId, bet: 20 });

    await expectError(service.spin(sessionId, { requestId, bet: 40 }), 'IDEMPOTENCY_CONFLICT', 409);
    expect((await service.getSession(sessionId)).balance).toBe(first.balanceAfter);
  });

  it.each([
    ['a bet that is not a bet level', 25, 'INVALID_BET', 422],
    ['a zero bet', 0, 'VALIDATION_ERROR', 400],
    ['a negative bet', -20, 'VALIDATION_ERROR', 400],
    ['a fractional bet', 20.5, 'VALIDATION_ERROR', 400],
  ])('rejects %s', async (_label, bet, code, status) => {
    const service = makeService();
    const { sessionId } = await service.createSession();
    await expectError(service.spin(sessionId, { requestId: requestIds(), bet }), code, status);
    expect((await service.getSession(sessionId)).balance).toBe(10_000);
  });

  it('rejects an empty requestId and unknown sessions', async () => {
    const service = makeService();
    const { sessionId } = await service.createSession();
    await expectError(service.spin(sessionId, { requestId: '', bet: 20 }), 'VALIDATION_ERROR', 400);
    await expectError(service.spin('no-such-session', { requestId: requestIds(), bet: 20 }), 'SESSION_NOT_FOUND', 404);
    await expectError(service.getSession('no-such-session'), 'SESSION_NOT_FOUND', 404);
  });

  it('charges once when the same request arrives many times concurrently', async () => {
    const service = makeService();
    const { sessionId } = await service.createSession();
    const request = { requestId: requestIds(), bet: 100 };

    const responses = await Promise.all(Array.from({ length: 10 }, () => service.spin(sessionId, request)));

    expect(new Set(responses.map((r) => r.roundId)).size).toBe(1);
    expect(responses.filter((r) => !r.replayed)).toHaveLength(1);
    expect((await service.getSession(sessionId)).balance).toBe(responses[0]?.balanceAfter);
  });

  it('serialises concurrent spins on one session into a consistent balance chain', async () => {
    const service = makeService();
    const { sessionId } = await service.createSession();

    const responses = await Promise.all(
      Array.from({ length: 25 }, () => service.spin(sessionId, { requestId: requestIds(), bet: 40 })),
    );

    // Each spin starts from the balance the previous one ended with.
    const chain = [...responses].sort((a, b) => a.roundId.localeCompare(b.roundId));
    chain.forEach((r, i) => {
      if (i > 0) expect(r.balanceBefore).toBe(chain[i - 1]?.balanceAfter);
    });
    const totalWin = responses.reduce((sum, r) => sum + r.win, 0);
    expect((await service.getSession(sessionId)).balance).toBe(10_000 - 25 * 40 + totalWin);
  });

  it('maps a full round (free spins, retrigger, cap) to the contract', async () => {
    // TEST_GAME stops: 0,0,0 = three scatters; 3 x5 = A on the top line (see the fixture).
    const service = new GameService({
      definition: { ...TEST_GAME, maxWinMultiplier: 50 },
      store: new InMemorySessionStore(),
      rng: new ScriptedRng([0, 0, 0, 4, 4, 3, 3, 3, 3, 3]),
      newId: sequentialIds(),
    });
    const { sessionId } = await service.createSession();
    const response = await service.spin(sessionId, { requestId: requestIds(), bet: 3 });

    expect(Value.Check(SpinResponse, response)).toBe(true);
    expect(response.round.base.scatter?.positions[0]).toEqual({ reel: 0, row: 0 });
    expect(response.round.freeSpins?.spins[0]?.capped).toBe(true);
    expect(response.round.maxWinReached).toBe(true);
    expect(response.win).toBe(150);
  });

  it('returns frozen stored data, so a caller cannot corrupt a later replay', async () => {
    const service = makeService();
    const { sessionId } = await service.createSession();
    const request = { requestId: requestIds(), bet: 20 };
    const first = await service.spin(sessionId, request);
    expect(() => {
      (first.round.base.grid[0] as string[])[0] = 'HACKED';
    }).toThrow(TypeError);
    const again = await service.spin(sessionId, request);
    expect(again.round.base.grid[0]?.[0]).not.toBe('HACKED');
  });
});
