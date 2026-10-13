import { GameServerError } from '@deep-reef/contract/errors';
import type { SpinResponse } from '@deep-reef/contract/schemas';
import { describe, expect, it } from 'vitest';
import { InMemorySessionStore } from './InMemorySessionStore';
import { KeyedMutex } from './KeyedMutex';

const fakeResponse = (requestId: string): SpinResponse => ({ requestId }) as unknown as SpinResponse;

describe('InMemorySessionStore', () => {
  it('commits a staged spin and balance together', async () => {
    const store = new InMemorySessionStore();
    await store.create({ id: 's1', balance: 100 });

    await store.transaction('s1', (tx) => {
      tx.recordSpin({ requestId: 'r1', bet: 20, response: fakeResponse('r1') }, 130);
      return Promise.resolve();
    });

    expect(await store.find('s1')).toEqual({ id: 's1', balance: 130 });
    await store.transaction('s1', async (tx) => {
      expect((await tx.findSpin('r1'))?.bet).toBe(20);
    });
  });

  it('rolls back everything when the transaction callback throws', async () => {
    const store = new InMemorySessionStore();
    await store.create({ id: 's1', balance: 100 });

    await expect(
      store.transaction('s1', (tx) => {
        tx.recordSpin({ requestId: 'r1', bet: 20, response: fakeResponse('r1') }, 80);
        throw new Error('boom after staging');
      }),
    ).rejects.toThrow('boom');

    expect((await store.find('s1'))?.balance).toBe(100);
    await store.transaction('s1', async (tx) => {
      expect(await tx.findSpin('r1')).toBeNull();
    });
  });

  it('rejects unknown sessions with SESSION_NOT_FOUND', async () => {
    const store = new InMemorySessionStore();
    await expect(store.transaction('missing', () => Promise.resolve())).rejects.toBeInstanceOf(GameServerError);
  });

  it('evicts the oldest idempotency records beyond the per-session limit', async () => {
    const store = new InMemorySessionStore({ maxSpinsPerSession: 2 });
    await store.create({ id: 's1', balance: 0 });
    for (const id of ['r1', 'r2', 'r3']) {
      await store.transaction('s1', (tx) => {
        tx.recordSpin({ requestId: id, bet: 1, response: fakeResponse(id) }, 0);
        return Promise.resolve();
      });
    }
    await store.transaction('s1', async (tx) => {
      expect(await tx.findSpin('r1')).toBeNull();
      expect(await tx.findSpin('r3')).not.toBeNull();
    });
  });
});

describe('KeyedMutex', () => {
  const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1));

  it('runs tasks for one key strictly one after another', async () => {
    const mutex = new KeyedMutex();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`${name}:start`);
      await tick();
      log.push(`${name}:end`);
    };
    await Promise.all([mutex.run('k', task('a')), mutex.run('k', task('b')), mutex.run('k', task('c'))]);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
    expect(mutex.activeKeys).toBe(0);
  });

  it('lets different keys run concurrently and keeps going after a failure', async () => {
    const mutex = new KeyedMutex();
    const log: string[] = [];
    const slow = (name: string) => async () => {
      log.push(`${name}:start`);
      await tick();
      log.push(`${name}:end`);
    };
    await Promise.all([mutex.run('x', slow('x')), mutex.run('y', slow('y'))]);
    expect(log.slice(0, 2)).toEqual(['x:start', 'y:start']);

    await expect(mutex.run('k', () => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    await expect(mutex.run('k', () => Promise.resolve('next'))).resolves.toBe('next');
  });
});
