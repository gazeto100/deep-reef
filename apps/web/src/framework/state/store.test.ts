import { GameServerError } from '@deep-reef/contract/errors';
import type { GameServer } from '@deep-reef/contract/GameServer';
import type { SpinRequest, SpinResponse } from '@deep-reef/contract/schemas';
import { GameService } from '@deep-reef/game-service/GameService';
import { InMemorySessionStore } from '@deep-reef/game-service/InMemorySessionStore';
import { sequentialIds } from '@deep-reef/game-service/testing';
import { DEEP_REEF } from '@deep-reef/math/config/deepReef';
import { Xoshiro128 } from '@deep-reef/math/rng/Xoshiro128';
import { describe, expect, it } from 'vitest';
import { presentationFinished } from './actions';
import { selectBet, selectPrimaryAction } from './selectors';
import { betDecreased, betIncreased } from './slices';
import { createSlotStore, type SessionIdStorage } from './store';
import { primaryAction, requestSpin, SESSION_ID_KEY, startSession } from './thunks';

class MemoryStorage implements SessionIdStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

/** A real game service whose spin() can be held open, to observe the in-between state. */
class GatedServer implements GameServer {
  readonly service = new GameService<string>({
    definition: DEEP_REEF,
    store: new InMemorySessionStore(),
    rng: new Xoshiro128(3),
    newId: sequentialIds(),
  });
  private release: (() => void) | null = null;
  failNext: GameServerError | null = null;

  createSession = () => this.service.createSession();
  getSession = (id: string) => this.service.getSession(id);

  async spin(sessionId: string, request: SpinRequest): Promise<SpinResponse> {
    await new Promise<void>((resolve) => {
      this.release = resolve;
    });
    if (this.failNext) throw this.failNext;
    return this.service.spin(sessionId, request);
  }

  open(): void {
    this.release?.();
  }
}

async function readyStore(server: GameServer = new GatedServer(), storage = new MemoryStorage()) {
  const store = createSlotStore({ server, storage, newRequestId: sequentialIds(9) });
  await store.dispatch(startSession());
  return store;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('slot state', () => {
  it('opens a session and resumes it after a reload', async () => {
    const storage = new MemoryStorage();
    const server = new GatedServer();
    const first = await readyStore(server, storage);
    const sessionId = first.getState().session.sessionId;
    expect(first.getState().wallet.balance).toBe(10_000);
    expect(storage.getItem(SESSION_ID_KEY)).toBe(sessionId);

    const reloaded = await readyStore(server, storage);
    expect(reloaded.getState().session.sessionId).toBe(sessionId);
  });

  it('opens a new session when the stored one is unknown', async () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_ID_KEY, 'expired-session');
    const store = await readyStore(new GatedServer(), storage);
    expect(store.getState().session.status).toBe('ready');
    expect(store.getState().session.sessionId).not.toBe('expired-session');
  });

  it('takes the bet at once and adds the win only after the presentation', async () => {
    const server = new GatedServer();
    const store = await readyStore(server);
    const bet = selectBet(store.getState());

    const spinning = store.dispatch(requestSpin());
    expect(store.getState().round.phase).toBe('requesting');
    expect(store.getState().wallet.balance).toBe(10_000 - bet); // before any answer
    expect(selectPrimaryAction(store.getState())).toBe('hurry');

    server.open();
    await spinning;
    const result = store.getState().round.result;
    expect(store.getState().round.phase).toBe('presenting');
    expect(store.getState().wallet.balance).toBe(10_000 - bet); // win still hidden
    expect(store.getState().wallet.pending).toBe(result?.balanceAfter);

    store.dispatch(presentationFinished());
    expect(store.getState().round.phase).toBe('idle');
    expect(store.getState().wallet.balance).toBe(result?.balanceAfter);
    expect(store.getState().round.lastWin).toBe(result?.win);
  });

  it('re-reads the balance from the server when a spin fails', async () => {
    const server = new GatedServer();
    const store = await readyStore(server);
    server.failNext = new GameServerError('TIMEOUT');

    const spinning = store.dispatch(requestSpin());
    server.open();
    await spinning;
    await flush();

    expect(store.getState().round.phase).toBe('idle');
    expect(store.getState().round.error?.code).toBe('TIMEOUT');
    expect(store.getState().wallet.balance).toBe(10_000); // the server never committed
  });

  it('turns the main button into slam/skip during a round', async () => {
    const server = new GatedServer();
    const store = await readyStore(server);

    const spinning = store.dispatch(primaryAction());
    await store.dispatch(primaryAction());
    await store.dispatch(primaryAction());
    expect(store.getState().round.hurryCount).toBe(2);

    server.open();
    await spinning;
  });

  it('keeps the bet within the configured levels', async () => {
    const store = await readyStore();
    const levels = store.getState().session.config?.betLevels ?? [];
    store.dispatch(betDecreased());
    expect(selectBet(store.getState())).toBe(levels[0]);
    for (let i = 0; i < 20; i++) store.dispatch(betIncreased(levels.length));
    expect(selectBet(store.getState())).toBe(levels[levels.length - 1]);
  });
});
