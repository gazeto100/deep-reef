import type { GameServer } from '@deep-reef/contract/GameServer';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { betSlice, roundSlice, sessionSlice, settingsSlice, walletSlice } from './slices';

/** Remembers the session between page loads (window.localStorage in the browser). */
export interface SessionIdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Dependencies injected into thunks: the store never imports a concrete transport. */
export interface SlotDependencies {
  readonly server: GameServer;
  readonly storage: SessionIdStorage | null;
  readonly newRequestId: () => string;
}

const rootReducer = combineReducers({
  session: sessionSlice.reducer,
  wallet: walletSlice.reducer,
  bet: betSlice.reducer,
  round: roundSlice.reducer,
  settings: settingsSlice.reducer,
});

export type SlotState = ReturnType<typeof rootReducer>;

export function createSlotStore(dependencies: SlotDependencies, preloadedState?: Partial<SlotState>) {
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault({ thunk: { extraArgument: dependencies } }),
    ...(preloadedState ? { preloadedState } : {}),
  });
}

export type SlotStore = ReturnType<typeof createSlotStore>;
export type SlotDispatch = SlotStore['dispatch'];
