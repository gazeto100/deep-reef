import type { GameConfig, SpinResponse } from '@deep-reef/contract/schemas';
import { createSlice } from '@reduxjs/toolkit';
import {
  balanceSynced,
  connectionRetrying,
  freeSpinProgress,
  hurryRequested,
  presentationFinished,
  sessionConnecting,
  sessionFailed,
  sessionReady,
  spinFailed,
  spinResolved,
  spinStarted,
  type StateError,
} from './actions';

// ---------------------------------------------------------------- session

export interface SessionState {
  readonly status: 'idle' | 'connecting' | 'ready' | 'failed';
  readonly sessionId: string | null;
  readonly config: GameConfig | null;
  readonly error: StateError | null;
}

const initialSession: SessionState = { status: 'idle', sessionId: null, config: null, error: null };

export const sessionSlice = createSlice({
  name: 'session',
  initialState: initialSession,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(sessionConnecting, (state) => ({ ...state, status: 'connecting', error: null }))
      .addCase(sessionReady, (_state, { payload }) => ({
        status: 'ready',
        sessionId: payload.sessionId,
        config: payload.config,
        error: null,
      }))
      .addCase(sessionFailed, (state, { payload }) => ({ ...state, status: 'failed', error: payload }));
  },
});

// ---------------------------------------------------------------- wallet

export interface WalletState {
  /** The balance shown to the player. */
  readonly balance: number;
  /** Balance after the round being presented; shown once the presentation ends. */
  readonly pending: number | null;
}

const initialWallet: WalletState = { balance: 0, pending: null };

export const walletSlice = createSlice({
  name: 'wallet',
  initialState: initialWallet,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(sessionReady, (_state, { payload }) => ({ balance: payload.balance, pending: null }))
      // The bet leaves the balance the moment the player spins...
      .addCase(spinStarted, (state, { payload }) => ({ ...state, balance: state.balance - payload.bet }))
      // ...the result is held back while the reels are presenting it...
      .addCase(spinResolved, (_state, { payload }) => ({
        balance: payload.balanceBefore - payload.bet,
        pending: payload.balanceAfter,
      }))
      // ...and the win is added only when the presentation has finished.
      .addCase(presentationFinished, (state) => ({ balance: state.pending ?? state.balance, pending: null }))
      .addCase(balanceSynced, (_state, { payload }) => ({ balance: payload, pending: null }));
  },
});

// ---------------------------------------------------------------- bet

export const betSlice = createSlice({
  name: 'bet',
  initialState: { levelIndex: 0 },
  reducers: {
    betIncreased: (state, { payload: levelCount }: { payload: number }) => ({
      levelIndex: Math.min(state.levelIndex + 1, levelCount - 1),
    }),
    betDecreased: (state) => ({ levelIndex: Math.max(state.levelIndex - 1, 0) }),
  },
  extraReducers: (builder) => {
    builder.addCase(sessionReady, (state, { payload }) => ({
      levelIndex: Math.min(state.levelIndex, payload.config.betLevels.length - 1),
    }));
  },
});

// ---------------------------------------------------------------- round

export type RoundPhase = 'idle' | 'requesting' | 'presenting';

export interface RoundState {
  readonly phase: RoundPhase;
  readonly requestId: string | null;
  readonly result: SpinResponse | null;
  readonly error: StateError | null;
  /** Presses of the main button during the current round (slam, then skip). */
  readonly hurryCount: number;
  readonly retrying: { readonly attempt: number } | null;
  readonly freeSpins: { readonly index: number; readonly total: number; readonly win: number } | null;
  /** Win of the last finished round, for the HUD. */
  readonly lastWin: number;
}

const initialRound: RoundState = {
  phase: 'idle',
  requestId: null,
  result: null,
  error: null,
  hurryCount: 0,
  retrying: null,
  freeSpins: null,
  lastWin: 0,
};

export const roundSlice = createSlice({
  name: 'round',
  initialState: initialRound,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(spinStarted, (state, { payload }) => ({
        ...initialRound,
        phase: 'requesting',
        requestId: payload.requestId,
        lastWin: state.lastWin,
      }))
      .addCase(spinResolved, (state, { payload }) => ({
        ...state,
        phase: 'presenting',
        result: payload,
        retrying: null,
      }))
      .addCase(spinFailed, (state, { payload }) => ({ ...state, phase: 'idle', error: payload, retrying: null }))
      .addCase(connectionRetrying, (state, { payload }) =>
        state.phase === 'requesting' ? { ...state, retrying: { attempt: payload.attempt } } : state,
      )
      .addCase(hurryRequested, (state) =>
        state.phase === 'idle' ? state : { ...state, hurryCount: state.hurryCount + 1 },
      )
      .addCase(freeSpinProgress, (state, { payload }) => ({ ...state, freeSpins: payload }))
      .addCase(presentationFinished, (state) => ({
        ...state,
        phase: 'idle',
        freeSpins: null,
        lastWin: state.result?.win ?? 0,
      }));
  },
});

// ---------------------------------------------------------------- settings

export const settingsSlice = createSlice({
  name: 'settings',
  initialState: { turbo: false, faultsActive: false },
  reducers: {
    turboToggled: (state) => ({ ...state, turbo: !state.turbo }),
    faultModeSet: (state, { payload }: { payload: boolean }) => ({ ...state, faultsActive: payload }),
  },
});

export const { betIncreased, betDecreased } = betSlice.actions;
export const { turboToggled, faultModeSet } = settingsSlice.actions;
