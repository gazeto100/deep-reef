import { GameServerError, isGameServerError } from '@deep-reef/contract/errors';
import type { AbortSignalLike, GameServer, RequestOptions } from '@deep-reef/contract/GameServer';
import type { Session, SpinRequest, SpinResponse } from '@deep-reef/contract/schemas';
import { raceAbort, sleep, throwIfAborted } from './abort';

export interface ResilienceOptions {
  /** Per-attempt timeout. */
  readonly timeoutMs?: number;
  /** Total attempts, including the first one. */
  readonly maxAttempts?: number;
  /** Delay before retry n (1-based). The last entry repeats. */
  readonly backoffMs?: readonly number[];
  /** Called before each retry, e.g. to show "reconnecting…" or to log. */
  readonly onRetry?: (event: RetryEvent) => void;
}

export interface RetryEvent {
  readonly operation: 'createSession' | 'getSession' | 'spin';
  /** The attempt that just failed (1-based). */
  readonly attempt: number;
  readonly error: GameServerError;
  readonly delayMs: number;
}

export const DEFAULT_RESILIENCE = { timeoutMs: 3000, maxAttempts: 3, backoffMs: [250, 750] } as const;

/**
 * Decorator that adds timeouts and retries to any GameServer (mock or HTTP).
 *
 * Retries are safe because spins are idempotent: every attempt sends the *same*
 * SpinRequest, so the same requestId. If the server committed the round but the response
 * was lost, the retry returns that round (replayed: true) instead of charging again.
 * Only failures marked retryable (TIMEOUT, NETWORK_ERROR, 5xx, 429) are retried.
 * Business errors such as INSUFFICIENT_FUNDS fail immediately, and so does an abort by
 * the caller.
 */
export class ResilientGameServer implements GameServer {
  private readonly inner: GameServer;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: readonly number[];
  private readonly onRetry: ((event: RetryEvent) => void) | undefined;

  constructor(inner: GameServer, options: ResilienceOptions = {}) {
    this.inner = inner;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RESILIENCE.timeoutMs;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_RESILIENCE.maxAttempts);
    this.backoffMs = options.backoffMs ?? DEFAULT_RESILIENCE.backoffMs;
    this.onRetry = options.onRetry;
  }

  createSession(options?: RequestOptions): Promise<Session> {
    return this.withRetry('createSession', options?.signal, (signal) => this.inner.createSession({ signal }));
  }

  getSession(sessionId: string, options?: RequestOptions): Promise<Session> {
    return this.withRetry('getSession', options?.signal, (signal) => this.inner.getSession(sessionId, { signal }));
  }

  spin(sessionId: string, request: SpinRequest, options?: RequestOptions): Promise<SpinResponse> {
    // The same request object, hence the same requestId, on every attempt.
    return this.withRetry('spin', options?.signal, (signal) => this.inner.spin(sessionId, request, { signal }));
  }

  private async withRetry<T>(
    operation: RetryEvent['operation'],
    callerSignal: AbortSignalLike | undefined,
    attempt: (signal: AbortSignalLike) => Promise<T>,
  ): Promise<T> {
    for (let n = 1; ; n++) {
      throwIfAborted(callerSignal);
      let error: GameServerError;
      try {
        return await this.attemptOnce(callerSignal, attempt);
      } catch (e) {
        if (!isGameServerError(e)) throw e; // unknown failures are bugs, not network weather
        error = e;
      }
      if (!error.retryable || n >= this.maxAttempts) throw error;

      const delayMs = this.backoffMs[Math.min(n, this.backoffMs.length) - 1] ?? 0;
      this.onRetry?.({ operation, attempt: n, error, delayMs });
      await sleep(delayMs, callerSignal);
    }
  }

  /** One attempt with its own timeout; the caller's signal also cancels it. */
  private async attemptOnce<T>(
    callerSignal: AbortSignalLike | undefined,
    attempt: (signal: AbortSignalLike) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const onCallerAbort = (): void => controller.abort();
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

    const reason = (): GameServerError =>
      timedOut
        ? new GameServerError('TIMEOUT', `no response within ${this.timeoutMs} ms`)
        : new GameServerError('ABORTED');
    try {
      return await raceAbort(attempt(controller.signal), controller.signal, reason);
    } catch (e) {
      // An inner ABORTED caused by our own timeout is reported as TIMEOUT.
      if (isGameServerError(e) && e.code === 'ABORTED' && timedOut) throw reason();
      throw e;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }
}
