import { GameServerError } from '@deep-reef/contract/errors';
import { KeyedMutex } from './KeyedMutex';
import type { SessionRecord, SessionStore, SessionTransaction, SpinRecord } from './ports';

export interface InMemorySessionStoreOptions {
  /**
   * Completed spins kept per session for idempotent replays (oldest evicted first). It
   * must comfortably exceed how many spins a client can play while still retrying an
   * older one. Clients retry for seconds, so 1000 is generous.
   */
  readonly maxSpinsPerSession?: number;
}

interface SessionEntry {
  balance: number;
  readonly spins: Map<string, SpinRecord>;
}

/**
 * SessionStore in a Map. Correct for a single process only: the per-session lock is a
 * KeyedMutex in this process's memory. Used by the browser mock and by tests.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly mutex = new KeyedMutex();
  private readonly maxSpinsPerSession: number;

  constructor(options: InMemorySessionStoreOptions = {}) {
    this.maxSpinsPerSession = options.maxSpinsPerSession ?? 1000;
  }

  create(session: SessionRecord): Promise<void> {
    if (this.sessions.has(session.id)) return Promise.reject(new Error(`session ${session.id} already exists`));
    this.sessions.set(session.id, { balance: session.balance, spins: new Map() });
    return Promise.resolve();
  }

  find(sessionId: string): Promise<SessionRecord | null> {
    const entry = this.sessions.get(sessionId);
    return Promise.resolve(entry ? { id: sessionId, balance: entry.balance } : null);
  }

  transaction<T>(sessionId: string, work: (tx: SessionTransaction) => Promise<T>): Promise<T> {
    return this.mutex.run(sessionId, async () => {
      const entry = this.sessions.get(sessionId);
      if (!entry) throw new GameServerError('SESSION_NOT_FOUND', `no session ${sessionId}`);

      // A holder object, because TypeScript does not track assignments made inside closures.
      const pending: { staged: { spin: SpinRecord; balanceAfter: number } | null } = { staged: null };
      const tx: SessionTransaction = {
        session: { id: sessionId, balance: entry.balance },
        findSpin: (requestId) => Promise.resolve(entry.spins.get(requestId) ?? null),
        recordSpin: (spin, balanceAfter) => {
          if (pending.staged) throw new Error('only one spin can be recorded per transaction');
          pending.staged = { spin: deepFreeze(spin), balanceAfter };
        },
      };

      const result = await work(tx);

      // Commit: both changes or neither (a throw above skips this block).
      if (pending.staged) {
        const { spin, balanceAfter } = pending.staged;
        entry.balance = balanceAfter;
        entry.spins.set(spin.requestId, spin);
        if (entry.spins.size > this.maxSpinsPerSession) {
          const oldest = entry.spins.keys().next().value;
          if (oldest !== undefined) entry.spins.delete(oldest);
        }
      }
      return result;
    });
  }
}

/** Stored records are shared with callers, so freeze them against accidental mutation. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
