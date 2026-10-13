import { connectionRetrying } from '@framework/state/actions';
import { faultModeSet } from '@framework/state/slices';
import { createSlotStore, type SlotStore } from '@framework/state/store';
import { startSession } from '@framework/state/thunks';
import { applyUrlOverrides, faultsActive, readTransportConfig } from '@transport/config';
import { createGameServer } from '@transport/createGameServer';
import type { RetryEvent } from '@transport/ResilientGameServer';
import { randomId } from '@transport/randomId';
import { browserStorage } from '@transport/storage';
import { GameScreen } from '@ui/GameScreen';
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';

/**
 * Composition root: the only place that knows every layer. It reads the transport
 * configuration (environment + ?faults= in the URL), builds the GameServer and the store,
 * and wires the server's retry notifications into state.
 */
async function bootstrap(): Promise<SlotStore> {
  const config = applyUrlOverrides(readTransportConfig(import.meta.env), window.location.search);
  const storage = browserStorage();

  // The server reports retries to the store, but the store needs the server first.
  let reportRetry: (event: RetryEvent) => void = () => undefined;
  const server = await createGameServer(config, {
    storage,
    resilience: { onRetry: (event) => reportRetry(event) },
  });
  const store = createSlotStore({ server, storage, newRequestId: randomId });
  reportRetry = (event) => store.dispatch(connectionRetrying({ attempt: event.attempt, code: event.error.code }));

  store.dispatch(faultModeSet(faultsActive(config)));
  void store.dispatch(startSession());
  return store;
}

// One bootstrap per page, even though StrictMode runs effects twice in development.
let booting: Promise<SlotStore> | null = null;

type Boot = { status: 'loading' } | { status: 'ready'; store: SlotStore } | { status: 'failed'; message: string };

export function App() {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    booting ??= bootstrap();
    booting.then(
      (store) => active && setBoot({ status: 'ready', store }),
      (error: unknown) => active && setBoot({ status: 'failed', message: String(error) }),
    );
    return () => {
      active = false;
    };
  }, []);

  if (boot.status === 'ready') {
    return (
      <Provider store={boot.store}>
        <GameScreen />
      </Provider>
    );
  }
  return (
    <div className="boot" role="status">
      {boot.status === 'failed' ? `Неуспешно стартиране: ${boot.message}` : 'Зареждане…'}
    </div>
  );
}
