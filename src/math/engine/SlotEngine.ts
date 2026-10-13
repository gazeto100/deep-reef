import type { Rng } from '../rng/Rng';
import { compileGame, type CompiledGame } from './compile';
import { countScatters, evaluateLine, fillWindow, linePayOf, readLine, unpackCount, unpackSymbol } from './evaluate';
import type {
  FreeSpinsResult,
  GameDefinition,
  Grid,
  LineWin,
  Position,
  RoundResult,
  ScatterWin,
  SpinResult,
} from './types';

export class InvalidBetError extends Error {
  override readonly name = 'InvalidBetError';
}

type ReelSetKind = 'base' | 'freeSpins';

interface SpinContext {
  readonly totalBet: number;
  readonly lineBet: number;
  readonly multiplier: number;
  /** Free spins granted if this spin lands a trigger (already clamped to maxTotal). */
  readonly freeSpinsIfTriggered: number;
  /** Credits still payable before the round cap is hit. */
  readonly capRemaining: number;
}

/**
 * Computes complete rounds: the base spin plus every free spin it leads to.
 *
 * The engine is stateless between rounds. The caller supplies the RNG, so the same
 * engine instance serves the simulator (seeded) and the server (its own RNG).
 */
export class SlotEngine<S extends string> {
  readonly game: CompiledGame<S>;
  private readonly window: Uint8Array;
  private readonly lineBuffer: Uint8Array;

  constructor(readonly definition: GameDefinition<S>) {
    this.game = compileGame(definition);
    this.window = new Uint8Array(this.game.reelCount * this.game.rowCount);
    this.lineBuffer = new Uint8Array(this.game.reelCount);
  }

  playRound(totalBet: number, rng: Rng): RoundResult<S> {
    if (!this.definition.betLevels.includes(totalBet)) {
      throw new InvalidBetError(`bet ${totalBet} is not one of ${this.definition.betLevels.join(', ')}`);
    }

    const { freeSpins: rules, maxWinMultiplier } = this.definition;
    const lineBet = totalBet / this.game.paylines.length;
    const maxWin = totalBet * maxWinMultiplier;
    let paid = 0;

    const base = this.spin('base', rng, {
      totalBet,
      lineBet,
      multiplier: 1,
      freeSpinsIfTriggered: Math.min(rules.awarded, rules.maxTotal),
      capRemaining: maxWin,
    });
    paid += base.win;

    let freeSpins: FreeSpinsResult<S> | null = null;
    const initialAward = base.scatter?.freeSpinsAwarded ?? 0;

    // Reaching the cap ends the round: no further spins are played.
    if (initialAward > 0 && paid < maxWin) {
      let remaining = initialAward;
      let awarded = initialAward;
      let retriggers = 0;
      let featureWin = 0;
      const spins: SpinResult<S>[] = [];

      while (remaining > 0 && paid < maxWin) {
        remaining--;
        const spin = this.spin('freeSpins', rng, {
          totalBet,
          lineBet,
          multiplier: rules.winMultiplier,
          freeSpinsIfTriggered: Math.min(rules.retriggerAwarded, rules.maxTotal - awarded),
          capRemaining: maxWin - paid,
        });
        spins.push(spin);
        paid += spin.win;
        featureWin += spin.win;

        const retrigger = spin.scatter?.freeSpinsAwarded ?? 0;
        if (retrigger > 0) {
          remaining += retrigger;
          awarded += retrigger;
          retriggers++;
        }
      }

      freeSpins = { awarded, retriggers, spins, totalWin: featureWin };
    }

    return {
      totalBet,
      base,
      freeSpins,
      totalWin: paid,
      maxWinReached: paid >= maxWin,
    };
  }

  private spin(kind: ReelSetKind, rng: Rng, ctx: SpinContext): SpinResult<S> {
    const { game, window, lineBuffer } = this;
    const reels = kind === 'base' ? game.baseReels : game.freeSpinReels;

    const stops = reels.map((strip) => rng.nextInt(strip.length));
    fillWindow(game, reels, stops, window);

    const lineWins: LineWin<S>[] = [];
    let rawWin = 0;

    for (let li = 0; li < game.paylines.length; li++) {
      readLine(game, window, li, lineBuffer);
      const packed = evaluateLine(game, lineBuffer);
      if (packed === 0) continue;

      const symbol = unpackSymbol(packed);
      const count = unpackCount(packed);
      const win = linePayOf(game, symbol, count) * ctx.lineBet * ctx.multiplier;
      const line = game.paylines[li] ?? [];
      const positions: Position[] = [];
      for (let r = 0; r < count; r++) positions.push([r, line[r] ?? 0]);

      lineWins.push({ lineIndex: li, symbol: this.symbolAt(symbol), count, positions, win });
      rawWin += win;
    }

    const scatter = this.evaluateScatter(ctx);
    rawWin += scatter?.win ?? 0;

    const win = Math.min(rawWin, ctx.capRemaining);
    return {
      stops,
      grid: this.toGrid(),
      lineWins,
      scatter,
      multiplier: ctx.multiplier,
      rawWin,
      win,
      capped: win < rawWin,
    };
  }

  private evaluateScatter(ctx: SpinContext): ScatterWin | null {
    const { game, window } = this;
    const count = countScatters(game, window);
    if (count === 0) return null;

    const positions: Position[] = [];
    for (let i = 0; i < window.length; i++) {
      if (window[i] === game.scatter) positions.push([Math.floor(i / game.rowCount), i % game.rowCount]);
    }
    const win = (game.scatterPay[count] ?? 0) * ctx.totalBet * ctx.multiplier;
    const freeSpinsAwarded = count >= this.definition.freeSpins.triggerCount ? ctx.freeSpinsIfTriggered : 0;

    if (win === 0 && freeSpinsAwarded === 0) return null;
    return { count, positions, win, freeSpinsAwarded };
  }

  private toGrid(): Grid<S> {
    const { reelCount, rowCount } = this.game;
    const grid: S[][] = [];
    for (let r = 0; r < reelCount; r++) {
      const column: S[] = [];
      for (let row = 0; row < rowCount; row++) {
        column.push(this.symbolAt(this.window[r * rowCount + row] ?? 0));
      }
      grid.push(column);
    }
    return grid;
  }

  private symbolAt(index: number): S {
    const symbol = this.definition.symbols[index];
    if (symbol === undefined) throw new RangeError(`no symbol at index ${index}`);
    return symbol;
  }
}
