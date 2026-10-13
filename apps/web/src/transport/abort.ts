import { GameServerError } from '@deep-reef/contract/errors';
import type { AbortSignalLike } from '@deep-reef/contract/GameServer';

/** Rejects with ABORTED if the signal has already fired. */
export function throwIfAborted(signal: AbortSignalLike | undefined): void {
  if (signal?.aborted) throw new GameServerError('ABORTED');
}

/**
 * Settles with the promise, or rejects as soon as the signal fires, whichever happens
 * first. It guarantees that a timeout fires even if the wrapped operation ignores
 * its signal.
 */
export function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignalLike | undefined,
  reason: () => GameServerError,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(reason());
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(reason());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * setTimeout as a promise that rejects with ABORTED when the signal fires. It removes its
 * listener either way, so a long-lived signal does not accumulate listeners.
 */
export function sleep(ms: number, signal?: AbortSignalLike): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GameServerError('ABORTED'));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new GameServerError('ABORTED'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Never settles on its own; rejects with ABORTED when the signal fires. */
export function waitForAbort(signal: AbortSignalLike): Promise<never> {
  return raceAbort(new Promise<never>(() => undefined), signal, () => new GameServerError('ABORTED'));
}
