import { InMemorySessionStore } from '@deep-reef/game-service/InMemorySessionStore';
import type { SessionRecord, SessionStore, SessionTransaction } from '@deep-reef/game-service/ports';

/** The part of window.localStorage this store uses (injectable for tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Snapshot {
  readonly version: 1;
  /** sessionId -> balance, oldest first. */
  readonly sessions: Readonly<Record<string, number>>;
}

export const MOCK_STORAGE_KEY = 'deep-reef:mock:sessions';
const MAX_SESSIONS = 5;

/**
 * SessionStore for the in-browser mock that survives page reloads: balances live in
 * localStorage, while transactions and idempotency run in the in-memory store.
 *
 * Deliberate limits (it is a demo backend, not a server):
 * - idempotency records are not persisted. A reload abandons any in-flight retry anyway;
 * - two tabs on the same session do not lock each other (last write wins);
 * - if storage is unavailable or full (private mode, quota), the game keeps working in
 *   memory and only persistence is lost.
 */
export class PersistentSessionStore implements SessionStore {
  private readonly inner = new InMemorySessionStore();
  private readonly storage: KeyValueStorage | null;
  private readonly key: string;

  private constructor(storage: KeyValueStorage | null, key: string) {
    this.storage = storage;
    this.key = key;
  }

  /** Opens the store and restores saved sessions. Corrupt data is ignored, not fatal. */
  static async open(storage: KeyValueStorage | null, key = MOCK_STORAGE_KEY): Promise<PersistentSessionStore> {
    const store = new PersistentSessionStore(storage, key);
    for (const [id, balance] of Object.entries(store.read().sessions)) {
      await store.inner.create({ id, balance });
    }
    return store;
  }

  async create(session: SessionRecord): Promise<void> {
    await this.inner.create(session);
    this.save(session.id, session.balance);
  }

  find(sessionId: string): Promise<SessionRecord | null> {
    return this.inner.find(sessionId);
  }

  async transaction<T>(sessionId: string, work: (tx: SessionTransaction) => Promise<T>): Promise<T> {
    const result = await this.inner.transaction(sessionId, work);
    const session = await this.inner.find(sessionId);
    if (session) this.save(session.id, session.balance);
    return result;
  }

  private read(): Snapshot {
    const empty: Snapshot = { version: 1, sessions: {} };
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return empty;
      const parsed: unknown = JSON.parse(raw);
      return isSnapshot(parsed) ? parsed : empty;
    } catch {
      return empty;
    }
  }

  private save(sessionId: string, balance: number): void {
    if (!this.storage) return;
    // Re-insert so the most recently used session is last, then keep the newest few.
    const entries = Object.entries(this.read().sessions).filter(([id]) => id !== sessionId);
    entries.push([sessionId, balance]);
    const snapshot: Snapshot = { version: 1, sessions: Object.fromEntries(entries.slice(-MAX_SESSIONS)) };
    try {
      this.storage.setItem(this.key, JSON.stringify(snapshot));
    } catch {
      // Quota exceeded or storage blocked: keep playing in memory.
    }
  }
}

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false;
  const { version, sessions } = value as { version?: unknown; sessions?: unknown };
  return (
    version === 1 &&
    typeof sessions === 'object' &&
    sessions !== null &&
    Object.values(sessions).every((b) => Number.isInteger(b) && (b as number) >= 0)
  );
}

/** window.localStorage if it can be used, otherwise null (blocked cookies, private mode). */
export function browserStorage(): KeyValueStorage | null {
  try {
    const storage = window.localStorage;
    const probe = '__deep_reef_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
