import type { SlotState } from './store';

export const selectConfig = (state: SlotState) => state.session.config;

export const selectBet = (state: SlotState): number => {
  const levels = state.session.config?.betLevels ?? [];
  return levels[state.bet.levelIndex] ?? levels[0] ?? 0;
};

export const selectIsIdle = (state: SlotState): boolean =>
  state.session.status === 'ready' && state.round.phase === 'idle';

export const selectCanSpin = (state: SlotState): boolean =>
  selectIsIdle(state) && state.wallet.balance >= selectBet(state) && selectBet(state) > 0;

/** What the main button does right now. */
export type PrimaryAction = 'spin' | 'hurry' | 'disabled';

export const selectPrimaryAction = (state: SlotState): PrimaryAction => {
  if (state.round.phase !== 'idle') return 'hurry';
  return selectCanSpin(state) ? 'spin' : 'disabled';
};

/** Win shown in the HUD: the running free-spin total during the feature, else the last round's win. */
export const selectDisplayedWin = (state: SlotState): number => state.round.freeSpins?.win ?? state.round.lastWin;
