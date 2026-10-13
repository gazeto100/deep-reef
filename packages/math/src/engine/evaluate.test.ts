import { describe, expect, it } from 'vitest';
import { compileGame, GameDefinitionError } from './compile';
import { countScatters, evaluateLine, unpackCount, unpackSymbol } from './evaluate';
import { TEST_GAME, type TestSymbol } from './testGame.fixture';

const game = compileGame(TEST_GAME);
const idx = (s: TestSymbol): number => TEST_GAME.symbols.indexOf(s);

function evalLine(...symbols: TestSymbol[]): { symbol: TestSymbol; count: number } | null {
  const packed = evaluateLine(game, Uint8Array.from(symbols, idx));
  if (packed === 0) return null;
  const symbol = TEST_GAME.symbols[unpackSymbol(packed)];
  if (symbol === undefined) throw new Error('bad symbol index');
  return { symbol, count: unpackCount(packed) };
}

describe('evaluateLine', () => {
  it('pays 3, 4 and 5 of a kind from the left', () => {
    expect(evalLine('A', 'A', 'A', 'B', 'X')).toEqual({ symbol: 'A', count: 3 });
    expect(evalLine('A', 'A', 'A', 'A', 'X')).toEqual({ symbol: 'A', count: 4 });
    expect(evalLine('A', 'A', 'A', 'A', 'A')).toEqual({ symbol: 'A', count: 5 });
  });

  it('does not pay runs that do not start on reel 1', () => {
    expect(evalLine('X', 'A', 'A', 'A', 'A')).toBeNull();
    expect(evalLine('B', 'A', 'A', 'A', 'A')).toBeNull();
  });

  it('does not pay 2 of a kind or unpaid symbols', () => {
    expect(evalLine('A', 'A', 'B', 'B', 'B')).toBeNull();
    expect(evalLine('X', 'X', 'X', 'X', 'X')).toBeNull();
  });

  it('substitutes the wild in the middle of a run', () => {
    expect(evalLine('A', 'W', 'A', 'A', 'B')).toEqual({ symbol: 'A', count: 4 });
    expect(evalLine('B', 'W', 'W', 'W', 'W')).toEqual({ symbol: 'B', count: 5 });
  });

  it('resolves leading wilds as the first non-wild symbol', () => {
    expect(evalLine('W', 'A', 'A', 'X', 'X')).toEqual({ symbol: 'A', count: 3 });
    expect(evalLine('W', 'W', 'A', 'A', 'A')).toEqual({ symbol: 'A', count: 5 });
  });

  it('prefers the wild-only win when it pays more than the substituted win', () => {
    // W×3 pays 50, B×4 pays 5.
    expect(evalLine('W', 'W', 'W', 'B', 'X')).toEqual({ symbol: 'W', count: 3 });
    // W×3 pays 50, A×5 pays 100.
    expect(evalLine('W', 'W', 'W', 'A', 'A')).toEqual({ symbol: 'A', count: 5 });
    expect(evalLine('W', 'W', 'W', 'W', 'W')).toEqual({ symbol: 'W', count: 5 });
  });

  it('never substitutes the wild for the scatter, and the scatter breaks the run', () => {
    expect(evalLine('S', 'S', 'S', 'S', 'S')).toBeNull();
    expect(evalLine('A', 'A', 'S', 'A', 'A')).toBeNull();
    expect(evalLine('W', 'S', 'A', 'A', 'A')).toBeNull();
    expect(evalLine('A', 'A', 'A', 'S', 'A')).toEqual({ symbol: 'A', count: 3 });
  });

  it('treats the wild as a plain symbol when substitution is disabled', () => {
    const noWild = { ...game, wild: -1 };
    const packed = evaluateLine(noWild, Uint8Array.from(['A', 'W', 'A', 'A', 'A'] as const, idx));
    expect(packed).toBe(0);
  });
});

describe('countScatters', () => {
  it('counts scatters anywhere in the window', () => {
    const window = Uint8Array.from(
      ['S', 'X', 'X', 'X', 'S', 'X', 'A', 'A', 'A', 'X', 'X', 'S', 'B', 'B', 'B'] as const,
      idx,
    );
    expect(countScatters(game, window)).toBe(3);
  });
});

describe('compileGame', () => {
  it('rejects unknown symbols on the reels', () => {
    const broken = { ...TEST_GAME, baseReels: [['Z'], ...TEST_GAME.baseReels.slice(1)] };
    expect(() => compileGame(broken as unknown as typeof TEST_GAME)).toThrow(GameDefinitionError);
  });

  it('rejects bet levels that are not a multiple of the payline count', () => {
    expect(() => compileGame({ ...TEST_GAME, betLevels: [4] })).toThrow(GameDefinitionError);
  });

  it('rejects paylines with rows outside the window', () => {
    expect(() => compileGame({ ...TEST_GAME, paylines: [[0, 1, 2, 3, 0]] })).toThrow(GameDefinitionError);
  });
});
