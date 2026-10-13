import type { ErrorCode } from '@deep-reef/contract/errors';
import type { Session, SpinResponse } from '@deep-reef/contract/schemas';
import { createAction } from '@reduxjs/toolkit';

/**
 * Domain events shared by several slices. Each slice reacts to the events it cares about
 * (e.g. spinStarted both takes the bet from the wallet and moves the round to
 * "requesting"), so no slice reaches into another.
 */

export interface StateError {
  readonly code: ErrorCode | 'UNKNOWN';
  readonly message: string;
}

export const sessionConnecting = createAction('session/connecting');
export const sessionReady = createAction<Session>('session/ready');
export const sessionFailed = createAction<StateError>('session/failed');

export const spinStarted = createAction<{ requestId: string; bet: number }>('round/spinStarted');
export const spinResolved = createAction<SpinResponse>('round/spinResolved');
export const spinFailed = createAction<StateError>('round/spinFailed');
/** The authoritative balance from the server, e.g. after a spin with an unknown outcome. */
export const balanceSynced = createAction<number>('wallet/balanceSynced');

/** Dispatched by the Pixi presentation when the whole round has been shown. */
export const presentationFinished = createAction('round/presentationFinished');
/** Free-spin progress for the HUD while the feature is being presented. */
export const freeSpinProgress = createAction<{ index: number; total: number; win: number } | null>(
  'round/freeSpinProgress',
);
/** One press of the main button during a presentation: slam the reels, or skip the wins. */
export const hurryRequested = createAction('round/hurryRequested');
export const connectionRetrying = createAction<{ attempt: number; code: ErrorCode }>('round/connectionRetrying');
