import { GameServerError, type ErrorCode } from '@deep-reef/contract/errors';
import type { AbortSignalLike, GameServer, RequestOptions } from '@deep-reef/contract/GameServer';
import type { Session, SpinRequest, SpinResponse } from '@deep-reef/contract/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResilientGameServer, type RetryEvent } from './ResilientGameServer';

type Behaviour = (signal: AbortSignalLike | undefined) => Promise<SpinResponse>;

const OK = { requestId: 'r', replayed: false } as unknown as SpinResponse;
const ok: Behaviour = () => Promise.resolve(OK);
const fail =
  (code: ErrorCode): Behaviour =>
  () =>
    Promise.reject(new GameServerError(code));
/** Never settles and ignores its signal: only the client-side timeout can end it. */
const hang: Behaviour = () => new Promise<never>(() => undefined);

class ScriptedServer implements GameServer {
  readonly requests: SpinRequest[] = [];
  private readonly script: Behaviour[];

  constructor(script: Behaviour[]) {
    this.script = script;
  }

  spin(_sessionId: string, request: SpinRequest, options?: RequestOptions): Promise<SpinResponse> {
    this.requests.push(request);
    return (this.script.shift() ?? ok)(options?.signal);
  }

  createSession(): Promise<Session> {
    return Promise.reject(new Error('not used'));
  }

  getSession(): Promise<Session> {
    return Promise.reject(new Error('not used'));
  }
}

const REQUEST: SpinRequest = { requestId: '00000000-0000-4000-8000-000000000001', bet: 20 };
const OPTIONS = { timeoutMs: 1000, maxAttempts: 3, backoffMs: [250, 750] };

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  return error instanceof GameServerError ? error.code : String(error);
}

describe('ResilientGameServer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('times out each attempt, retries with the same requestId, then reports TIMEOUT', async () => {
    const inner = new ScriptedServer([hang, hang, hang]);
    const retries: RetryEvent[] = [];
    const server = new ResilientGameServer(inner, { ...OPTIONS, onRetry: (e) => retries.push(e) });

    const outcome = codeOf(server.spin('s', REQUEST));
    await vi.advanceTimersByTimeAsync(1000 + 250 + 1000 + 750 + 1000);

    expect(await outcome).toBe('TIMEOUT');
    expect(inner.requests).toHaveLength(3);
    expect(new Set(inner.requests.map((r) => r.requestId))).toEqual(new Set([REQUEST.requestId]));
    expect(retries.map((r) => [r.attempt, r.error.code, r.delayMs])).toEqual([
      [1, 'TIMEOUT', 250],
      [2, 'TIMEOUT', 750],
    ]);
  });

  it('recovers from transient failures', async () => {
    const inner = new ScriptedServer([fail('NETWORK_ERROR'), fail('INTERNAL_ERROR'), ok]);
    const server = new ResilientGameServer(inner, OPTIONS);

    const result = server.spin('s', REQUEST);
    await vi.advanceTimersByTimeAsync(250 + 750);

    await expect(result).resolves.toBe(OK);
    expect(inner.requests).toHaveLength(3);
  });

  it.each<ErrorCode>(['INSUFFICIENT_FUNDS', 'INVALID_BET', 'IDEMPOTENCY_CONFLICT', 'SESSION_NOT_FOUND'])(
    'does not retry %s',
    async (code) => {
      const inner = new ScriptedServer([fail(code), ok]);
      const server = new ResilientGameServer(inner, OPTIONS);
      expect(await codeOf(server.spin('s', REQUEST))).toBe(code);
      expect(inner.requests).toHaveLength(1);
    },
  );

  it('stops at once when the caller aborts during an attempt', async () => {
    const inner = new ScriptedServer([hang, ok]);
    const server = new ResilientGameServer(inner, OPTIONS);
    const controller = new AbortController();

    const outcome = codeOf(server.spin('s', REQUEST, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();

    expect(await outcome).toBe('ABORTED');
    await vi.advanceTimersByTimeAsync(5000);
    expect(inner.requests).toHaveLength(1);
  });

  it('stops when the caller aborts during the backoff delay', async () => {
    const inner = new ScriptedServer([fail('NETWORK_ERROR'), ok]);
    const server = new ResilientGameServer(inner, OPTIONS);
    const controller = new AbortController();

    const outcome = codeOf(server.spin('s', REQUEST, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(100); // inside the 250 ms backoff
    controller.abort();

    expect(await outcome).toBe('ABORTED');
    expect(inner.requests).toHaveLength(1);
  });

  it('does not retry unexpected errors (bugs are not network weather)', async () => {
    const inner = new ScriptedServer([() => Promise.reject(new TypeError('bug')), ok]);
    const server = new ResilientGameServer(inner, OPTIONS);
    await expect(server.spin('s', REQUEST)).rejects.toThrow(TypeError);
    expect(inner.requests).toHaveLength(1);
  });
});
