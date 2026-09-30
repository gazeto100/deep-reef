import type { GameDefinition } from '../engine/types';

/**
 * Deep Reef rules: every part of the definition except pays and reel strips, which
 * are tuned (see docs/math-tuning.md) and live in deepReef.ts.
 */
export const DEEP_REEF_SYMBOLS = [
  'WILD',
  'SCATTER',
  'SHARK',
  'OCTOPUS',
  'TURTLE',
  'SEAHORSE',
  'PUFFER',
  'A',
  'K',
  'Q',
  'J',
] as const;

export type DeepReefSymbol = (typeof DEEP_REEF_SYMBOLS)[number];

/** 20 fixed paylines, row per reel, top row = 0. */
export const DEEP_REEF_PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 2, 2, 2, 0],
];

export type DeepReefRules = Omit<
  GameDefinition<DeepReefSymbol>,
  'linePays' | 'scatterPays' | 'baseReels' | 'freeSpinReels'
>;

export const DEEP_REEF_RULES: DeepReefRules = {
  id: 'deep-reef',
  reelCount: 5,
  rowCount: 3,
  symbols: DEEP_REEF_SYMBOLS,
  wild: 'WILD',
  scatter: 'SCATTER',
  paylines: DEEP_REEF_PAYLINES,
  freeSpins: {
    triggerCount: 3,
    awarded: 10,
    retriggerAwarded: 10,
    maxTotal: 50,
    winMultiplier: 2,
  },
  // Chosen from the simulated tail (docs/math-simulation.md): reached about 1 in 4M
  // rounds, costs ~0.005% RTP, and is a max win the game really reaches.
  maxWinMultiplier: 2000,
  // Total bet in credits; line bet = total / 20.
  betLevels: [20, 40, 100, 200, 400, 1000],
  constraints: {
    wildReels: [1, 2, 3],
    // Premium stacks raise volatility without changing RTP (see docs/math-tuning.md).
    stackable: ['SHARK', 'OCTOPUS'],
    maxStack: 3,
    targetRtp: [0.953, 0.958],
  },
};
