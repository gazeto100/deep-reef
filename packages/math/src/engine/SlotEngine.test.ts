import { describe, expect, it } from 'vitest';
import { ScriptedRng } from '../rng/ScriptedRng';
import { Xoshiro128 } from '../rng/Xoshiro128';
import { InvalidBetError, SlotEngine } from './SlotEngine';
import { TEST_GAME } from './testGame.fixture';

// Strip stops (see testGame.fixture): 0 = S on top row, 3 = A on top, 4 = B on bottom,
// 1 = A on bottom. Alternating 4/1 gives B A B A B on the bottom row: nothing pays.
const BLANK = [4, 1, 4, 1, 4];
const FIVE_A_TOP = [3, 3, 3, 3, 3];
const THREE_SCATTERS = [0, 0, 0, 4, 4];

const engine = new SlotEngine(TEST_GAME);

describe('SlotEngine.playRound', () => {
  it('builds the grid from stops with wrap-around', () => {
    // Stop 11 on a 12-symbol strip shows W, S, X.
    const result = engine.playRound(3, new ScriptedRng([11, 4, 4, 4, 4]));
    expect(result.base.grid[0]).toEqual(['W', 'S', 'X']);
    expect(result.base.stops).toEqual([11, 4, 4, 4, 4]);
  });

  it('pays line wins in credits using the line bet', () => {
    // Total bet 30 over 3 lines = line bet 10. AÃ—5 pays 100 Ã— line bet.
    const result = engine.playRound(30, new ScriptedRng(FIVE_A_TOP));
    expect(result.base.lineWins).toEqual([
      {
        lineIndex: 1,
        symbol: 'A',
        count: 5,
        positions: [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
          [4, 0],
        ],
        win: 1000,
      },
    ]);
    expect(result.totalWin).toBe(1000);
    expect(result.freeSpins).toBeNull();
    expect(result.maxWinReached).toBe(false);
  });

  it('returns a zero-win round when nothing lines up', () => {
    const result = engine.playRound(3, new ScriptedRng(BLANK));
    expect(result.base.lineWins).toEqual([]);
    expect(result.base.scatter).toBeNull();
    expect(result.totalWin).toBe(0);
  });

  it('pays scatters on the total bet and plays the awarded free spins with the multiplier', () => {
    const rng = new ScriptedRng([...THREE_SCATTERS, ...FIVE_A_TOP, ...BLANK, ...BLANK]);
    const result = engine.playRound(3, rng);

    expect(result.base.scatter).toEqual({
      count: 3,
      positions: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      win: 6, // 2 Ã— total bet
      freeSpinsAwarded: 3,
    });

    const fs = result.freeSpins;
    expect(fs).not.toBeNull();
    expect(fs?.spins).toHaveLength(3);
    expect(fs?.spins[0]?.multiplier).toBe(2);
    expect(fs?.spins[0]?.win).toBe(200); // 100 Ã— line bet 1 Ã— 2
    expect(fs?.totalWin).toBe(200);
    expect(result.totalWin).toBe(206);
    expect(rng.remaining).toBe(0);
  });

  it('retriggers free spins and clamps the award to maxTotal', () => {
    // Awarded 3, retrigger +2 (total 5 = maxTotal), second retrigger gives 0 but still pays.
    const rng = new ScriptedRng([
      ...THREE_SCATTERS,
      ...THREE_SCATTERS, // FS 1: +2
      ...THREE_SCATTERS, // FS 2: +0 (already at maxTotal)
      ...BLANK,
      ...BLANK,
      ...BLANK,
    ]);
    const result = engine.playRound(3, rng);
    const fs = result.freeSpins;

    expect(fs?.awarded).toBe(5);
    expect(fs?.retriggers).toBe(1);
    expect(fs?.spins).toHaveLength(5);
    expect(fs?.spins[0]?.scatter?.freeSpinsAwarded).toBe(2);
    expect(fs?.spins[1]?.scatter?.freeSpinsAwarded).toBe(0);
    expect(fs?.spins[1]?.scatter?.win).toBe(12); // scatter pays are multiplied too
    expect(rng.remaining).toBe(0);
  });

  it('caps the round at maxWinMultiplier and ends the feature early', () => {
    const capped = new SlotEngine({ ...TEST_GAME, maxWinMultiplier: 50 }); // bet 3 -> max 150
    const rng = new ScriptedRng([...THREE_SCATTERS, ...FIVE_A_TOP, ...BLANK, ...BLANK]);
    const result = capped.playRound(3, rng);

    expect(result.base.win).toBe(6);
    const spin = result.freeSpins?.spins[0];
    expect(spin?.rawWin).toBe(200);
    expect(spin?.win).toBe(144);
    expect(spin?.capped).toBe(true);
    expect(result.freeSpins?.spins).toHaveLength(1); // remaining spins are forfeited
    expect(result.totalWin).toBe(150);
    expect(result.maxWinReached).toBe(true);
    expect(rng.remaining).toBe(10);
  });

  it('rejects bets that are not configured', () => {
    expect(() => engine.playRound(5, new ScriptedRng(BLANK))).toThrow(InvalidBetError);
  });

  it('is reproducible for the same seed', () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    const rngA = new Xoshiro128(99);
    const rngB = new Xoshiro128(99);
    const runA = a.map(() => engine.playRound(3, rngA));
    const runB = a.map(() => engine.playRound(3, rngB));
    expect(runA).toEqual(runB);
  });
});
