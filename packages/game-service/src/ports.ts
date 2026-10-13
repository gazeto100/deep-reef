import type { SpinResponse } from '@deep-reef/contract/schemas';

/**
 * Storage port of the game service. The in-memory adapter serves the browser mock and
 * tests; a database adapter can replace it without touching GameService.
 */

export interface SessionRecord {
  readonly id: string;
  /** Credits (integer). */
  readonly balance: number;
}

/** A completed spin, kept so that a repeated requestId returns the same result. */
export interface SpinRecord {
  readonly requestId: string;
  readonly bet: number;
  /** The response as first returned (replayed: false). */
  readonly response: SpinResponse;
}

/** Exclusive view of one session for the duration of a transaction. */
export interface SessionTransaction {
  readonly session: SessionRecord;
  findSpin(requestId: string): Promise<SpinRecord | null>;
  /**
   * Stages a completed spin and the session's new balance. Nothing is visible to others
   * until the transaction callback resolves; if it throws, nothing is applied.
   */
  recordSpin(spin: SpinRecord, balanceAfter: number): void;
}

export interface SessionStore {
  create(session: SessionRecord): Promise<void>;
  find(sessionId: string): Promise<SessionRecord | null>;
  /**
   * Runs `work` with exclusive access to one session, then commits the staged changes
   * atomically. Rejects with GameServerError('SESSION_NOT_FOUND') for an unknown id.
   *
   * Contract for implementations: concurrent transactions on the same session are
   * serialised, and a staged spin plus its balance change commit together or not at all.
   * The in-memory adapter uses a per-session lock (one process only). A SQL adapter would
   * use BEGIN; SELECT ... FOR UPDATE; ...; COMMIT with a unique (session_id, request_id)
   * index (see docs/api.md, "Concurrency and multiple instances").
   */
  transaction<T>(sessionId: string, work: (tx: SessionTransaction) => Promise<T>): Promise<T>;
}
