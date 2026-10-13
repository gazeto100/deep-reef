import type { CompiledGame } from './compile';

/**
 * Line and scatter evaluation on symbol indices. These are the hot paths shared by
 * the round engine, the exact calculator and the simulator, so they never allocate.
 */

const COUNT_BITS = 4;
const COUNT_MASK = (1 << COUNT_BITS) - 1;

/** Packed line result: 0 = no win, otherwise (symbol << 4) | count. */
export type PackedLineWin = number;

export const unpackSymbol = (packed: PackedLineWin): number => packed >>> COUNT_BITS;
export const unpackCount = (packed: PackedLineWin): number => packed & COUNT_MASK;

export function linePayOf(game: CompiledGame, symbol: number, count: number): number {
  return game.linePay[symbol * (game.reelCount + 1) + count] ?? 0;
}

/**
 * Evaluates one payline, left to right.
 *
 * Rules:
 * - A win is a run of the same symbol starting on reel 1. The wild substitutes for any
 *   symbol except the scatter, and the scatter breaks the run.
 * - Leading wilds are resolved as the first non-wild symbol on the line. If the wilds
 *   alone would pay more (only possible when the wild has its own pays), that win is used.
 * - Only the highest win per line is paid.
 *
 * @param lineSymbols symbol index on this payline for each reel (length = reelCount)
 */
export function evaluateLine(game: CompiledGame, lineSymbols: ArrayLike<number>): PackedLineWin {
  const { reelCount, wild, scatter } = game;

  let leadingWilds = 0;
  while (leadingWilds < reelCount && lineSymbols[leadingWilds] === wild) {
    leadingWilds++;
  }

  let bestSymbol = wild;
  let bestCount = leadingWilds;
  let bestPay = leadingWilds > 0 ? linePayOf(game, wild, leadingWilds) : 0;

  const target = lineSymbols[leadingWilds];
  if (target !== undefined && target !== scatter) {
    let count = leadingWilds + 1;
    while (count < reelCount && (lineSymbols[count] === target || lineSymbols[count] === wild)) {
      count++;
    }
    const pay = linePayOf(game, target, count);
    if (pay > bestPay) {
      bestSymbol = target;
      bestCount = count;
      bestPay = pay;
    }
  }

  return bestPay > 0 ? (bestSymbol << COUNT_BITS) | bestCount : 0;
}

/**
 * Visible window as a flat array: window[reel * rowCount + row].
 * Stops index the top visible row and wrap around the strip.
 */
export function fillWindow(
  game: CompiledGame,
  reels: readonly Uint8Array[],
  stops: ArrayLike<number>,
  out: Uint8Array,
): void {
  const { reelCount, rowCount } = game;
  for (let r = 0; r < reelCount; r++) {
    const strip = reels[r];
    const stop = stops[r];
    if (strip === undefined || stop === undefined) throw new RangeError(`missing reel ${r}`);
    for (let row = 0; row < rowCount; row++) {
      out[r * rowCount + row] = strip[(stop + row) % strip.length] ?? 0;
    }
  }
}

/** Collects the symbols under one payline into `out` (length = reelCount). */
export function readLine(game: CompiledGame, window: Uint8Array, lineIndex: number, out: Uint8Array): void {
  const line = game.paylines[lineIndex];
  if (line === undefined) throw new RangeError(`no payline ${lineIndex}`);
  for (let r = 0; r < game.reelCount; r++) {
    out[r] = window[r * game.rowCount + (line[r] ?? 0)] ?? 0;
  }
}

export function countScatters(game: CompiledGame, window: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < window.length; i++) {
    if (window[i] === game.scatter) count++;
  }
  return count;
}
