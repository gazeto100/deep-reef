import { isGameServerError } from '@deep-reef/contract/errors';
import type { Session } from '@deep-reef/contract/schemas';
import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit';
import {
  balanceSynced,
  hurryRequested,
  sessionConnecting,
  sessionFailed,
  sessionReady,
  spinFailed,
  spinResolved,
  spinStarted,
  type StateError,
} from './actions';
import { selectBet, selectCanSpin } from './selectors';
import type { SlotDependencies, SlotState } from './store';

export type SlotThunk<R = void> = ThunkAction<R, SlotState, SlotDependencies, UnknownAction>;

export const SESSION_ID_KEY = 'deep-reef:sessionId';

export function toStateError(error: unknown): StateError {
  if (isGameServerError(error)) return { code: error.code, message: error.message };
  return { code: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) };
}

/** Resumes the stored session, or opens a new one if there is none (or it expired). */
export function startSession(): SlotThunk<Promise<void>> {
  return async (dispatch, _getState, { server, storage }) => {
    dispatch(sessionConnecting());
    try {
      const storedId = storage?.getItem(SESSION_ID_KEY) ?? null;
      let session: Session | null = null;
      if (storedId) {
        try {
          session = await server.getSession(storedId);
        } catch (error) {
          if (!isGameServerError(error) || error.code !== 'SESSION_NOT_FOUND') throw error;
        }
      }
      session ??= await server.createSession();
      storage?.setItem(SESSION_ID_KEY, session.sessionId);
      dispatch(sessionReady(session));
    } catch (error) {
      dispatch(sessionFailed(toStateError(error)));
    }
  };
}

/** Demo reset: a fresh session with the starting balance. Only between rounds. */
export function resetSession(): SlotThunk<Promise<void>> {
  return async (dispatch, getState, { server, storage }) => {
    if (getState().round.phase !== 'idle') return;
    dispatch(sessionConnecting());
    try {
      const session = await server.createSession();
      storage?.setItem(SESSION_ID_KEY, session.sessionId);
      dispatch(sessionReady(session));
    } catch (error) {
      dispatch(sessionFailed(toStateError(error)));
    }
  };
}

/**
 * Plays one round. The bet leaves the displayed balance immediately; the result is then
 * presented by the Pixi layer, which dispatches presentationFinished to credit the win.
 *
 * On failure the outcome may be unknown: after a timeout the server may or may not have
 * committed the round. So the balance is re-read from the server instead of guessed.
 */
export function requestSpin(): SlotThunk<Promise<void>> {
  return async (dispatch, getState, { server, newRequestId }) => {
    const state = getState();
    const sessionId = state.session.sessionId;
    if (!selectCanSpin(state) || !sessionId) return;

    const bet = selectBet(state);
    const requestId = newRequestId();
    dispatch(spinStarted({ requestId, bet }));
    try {
      dispatch(spinResolved(await server.spin(sessionId, { requestId, bet })));
    } catch (error) {
      dispatch(spinFailed(toStateError(error)));
      try {
        dispatch(balanceSynced((await server.getSession(sessionId)).balance));
      } catch {
        // Still offline: keep the error on screen; the next successful call resyncs.
      }
    }
  };
}

/** The main button: spin when idle; during a round, slam the reels or skip the wins. */
export function primaryAction(): SlotThunk<Promise<void>> {
  return async (dispatch, getState) => {
    if (getState().round.phase === 'idle') {
      await dispatch(requestSpin());
    } else {
      dispatch(hurryRequested());
    }
  };
}
