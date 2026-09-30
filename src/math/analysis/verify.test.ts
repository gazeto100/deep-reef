import { describe, expect, it } from 'vitest';
import type { GameDefinition } from '../engine/types';
import { TEST_GAME, type TestSymbol } from '../engine/testGame.fixture';
import { verifyGame } from './verify';

const failedChecks = (def: GameDefinition<TestSymbol>): string[] =>
  verifyGame(def)
    .checks.filter((c) => !c.ok)
    .map((c) => c.name);

describe('verifyGame', () => {
  it('flags a wild on a reel where it is not allowed', () => {
    const def = { ...TEST_GAME, constraints: { ...TEST_GAME.constraints, wildReels: [1, 2, 3] } };
    expect(failedChecks(def)).toContain('base reels: wild only on reels 2,3,4');
  });

  it('flags two scatters in the same reel window', () => {
    const strip: TestSymbol[] = ['S', 'S', 'X', 'A', 'X', 'X', 'B', 'X', 'X', 'W', 'W', 'W'];
    const def = { ...TEST_GAME, baseReels: [strip, ...TEST_GAME.baseReels.slice(1)] };
    expect(failedChecks(def)).toContain('base reels: at most one scatter per reel window');
  });

  it('flags a line pay that can never be hit', () => {
    // B and W (which substitutes for B) removed from reel 5, so B x5 is impossible.
    const noB: TestSymbol[] = ['S', 'X', 'X', 'A', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'];
    const def = { ...TEST_GAME, baseReels: [...TEST_GAME.baseReels.slice(0, 4), noB] };
    expect(failedChecks(def)).toContain('every line pay is reachable in the base game');
  });

  it('flags non-increasing pays', () => {
    const def = { ...TEST_GAME, linePays: { ...TEST_GAME.linePays, B: { 3: 5, 4: 5, 5: 10 } } };
    expect(failedChecks(def)).toContain('line pays increase with count');
  });

  it('flags a lower-ranked symbol that pays as much as a higher-ranked one', () => {
    // Rank A > B; B x3 raised to A x3.
    const def = { ...TEST_GAME, linePays: { ...TEST_GAME.linePays, B: { 3: 5, 4: 6, 5: 10 } } };
    expect(failedChecks(def)).toContain('higher-ranked symbols pay strictly more for every count');
    expect(failedChecks(TEST_GAME)).not.toContain('higher-ranked symbols pay strictly more for every count');
  });

  it('flags a trigger count that does not pay', () => {
    const def = { ...TEST_GAME, scatterPays: { 4: 10, 5: 50 } };
    expect(failedChecks(def)).toContain('every reachable trigger also pays (round hit rate = base hit rate)');
  });
});
