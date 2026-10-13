import type { SpinResponse } from '@deep-reef/contract/schemas';
import { describe, expect, it } from 'vitest';
import { MOCK_STORAGE_KEY, PersistentSessionStore, type KeyValueStorage } from './PersistentSessionStore';

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const spin = (requestId: string) => ({ requestId, bet: 20, response: { requestId } as unknown as SpinResponse });

describe('PersistentSessionStore', () => {
  it('keeps balances across a reload', async () => {
    const storage = new MemoryStorage();
    const first = await PersistentSessionStore.open(storage);
    await first.create({ id: 's1', balance: 10_000 });
    await first.transaction('s1', (tx) => {
      tx.recordSpin(spin('r1'), 9_980);
      return Promise.resolve();
    });

    const reloaded = await PersistentSessionStore.open(storage);
    expect(await reloaded.find('s1')).toEqual({ id: 's1', balance: 9_980 });
  });

  it('starts empty on corrupt data instead of failing', async () => {
    const storage = new MemoryStorage();
    storage.setItem(MOCK_STORAGE_KEY, '{not json');
    expect(await (await PersistentSessionStore.open(storage)).find('s1')).toBeNull();

    storage.setItem(MOCK_STORAGE_KEY, JSON.stringify({ version: 1, sessions: { s1: -5 } }));
    expect(await (await PersistentSessionStore.open(storage)).find('s1')).toBeNull();
  });

  it('keeps working in memory when storage is unavailable or full', async () => {
    const full: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    for (const storage of [null, full]) {
      const store = await PersistentSessionStore.open(storage);
      await store.create({ id: 's1', balance: 100 });
      expect((await store.find('s1'))?.balance).toBe(100);
    }
  });

  it('keeps only the five most recently used sessions', async () => {
    const storage = new MemoryStorage();
    const store = await PersistentSessionStore.open(storage);
    for (let i = 1; i <= 7; i++) await store.create({ id: `s${i}`, balance: i });

    const saved = JSON.parse(storage.getItem(MOCK_STORAGE_KEY) ?? '{}') as { sessions: Record<string, number> };
    expect(Object.keys(saved.sessions)).toEqual(['s3', 's4', 's5', 's6', 's7']);
  });
});
