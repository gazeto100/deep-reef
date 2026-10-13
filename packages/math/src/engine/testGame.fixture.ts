import type { GameDefinition } from './types';

/**
 * Small, hand-checkable game used by the engine tests. Unlike Deep Reef it allows
 * wilds on reel 1 and gives the wild its own pays, to cover every evaluator branch.
 *
 * Every reel uses the same 12-symbol strip. Stops 0/3/6 show S/A/B on the top row
 * with X below them, and stop 9 shows W W W.
 */
export type TestSymbol = 'W' | 'S' | 'A' | 'B' | 'X';

const STRIP: readonly TestSymbol[] = ['S', 'X', 'X', 'A', 'X', 'X', 'B', 'X', 'X', 'W', 'W', 'W'];

export const TEST_GAME: GameDefinition<TestSymbol> = {
  id: 'test-game',
  reelCount: 5,
  rowCount: 3,
  symbols: ['W', 'S', 'A', 'B', 'X'],
  wild: 'W',
  scatter: 'S',
  paylines: [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
  ],
  linePays: {
    W: { 3: 50, 4: 200, 5: 1000 },
    A: { 3: 5, 4: 20, 5: 100 },
    B: { 3: 2, 4: 5, 5: 10 },
  },
  scatterPays: { 3: 2, 4: 10, 5: 50 },
  baseReels: [STRIP, STRIP, STRIP, STRIP, STRIP],
  freeSpinReels: [STRIP, STRIP, STRIP, STRIP, STRIP],
  freeSpins: { triggerCount: 3, awarded: 3, retriggerAwarded: 2, maxTotal: 5, winMultiplier: 2 },
  maxWinMultiplier: 1000,
  declaredRtp: 0.5,
  betLevels: [3, 30],
  constraints: {
    wildReels: [0, 1, 2, 3, 4],
    stackable: ['W', 'X'],
    maxStack: 3,
    payRank: ['A', 'B'],
    targetRtp: [0, 1],
  },
};
