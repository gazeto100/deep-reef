import type {
  FreeSpinsOutcome,
  GameConfig,
  LineWin,
  PayEntry,
  Position,
  Round,
  ScatterWin,
  SpinOutcome,
} from '@deep-reef/contract/schemas';
import type {
  GameDefinition,
  LineWin as EngineLineWin,
  PayByCount,
  Position as EnginePosition,
  RoundResult,
  ScatterWin as EngineScatterWin,
  SpinResult,
} from '@deep-reef/math/engine/types';

/**
 * Maps engine types to the wire contract. The contract is versioned and language-
 * neutral, so it does not reuse engine types directly: the engine can change internally
 * (e.g. its [reel, row] tuples or rawWin) without breaking clients. Every field is
 * typed against the contract, so drift fails to compile.
 */

export function toGameConfig<S extends string>(def: GameDefinition<S>): GameConfig {
  return {
    gameId: def.id,
    reels: def.reelCount,
    rows: def.rowCount,
    symbols: [...def.symbols],
    wild: def.wild,
    scatter: def.scatter,
    paylines: def.paylines.map((line) => [...line]),
    betLevels: [...def.betLevels],
    linePays: def.symbols.flatMap((symbol) => {
      const pays = def.linePays[symbol];
      return pays ? [{ symbol, pays: toPayEntries(pays) }] : [];
    }),
    scatterPays: toPayEntries(def.scatterPays),
    freeSpins: {
      triggerCount: def.freeSpins.triggerCount,
      awarded: def.freeSpins.awarded,
      retriggerAwarded: def.freeSpins.retriggerAwarded,
      maxTotal: def.freeSpins.maxTotal,
      winMultiplier: def.freeSpins.winMultiplier,
    },
    maxWinMultiplier: def.maxWinMultiplier,
    wildReels: [...def.constraints.wildReels],
    rtp: def.declaredRtp,
  };
}

export function toRound<S extends string>(round: RoundResult<S>): Round {
  return {
    base: toSpin(round.base),
    freeSpins: round.freeSpins ? toFreeSpins(round.freeSpins) : null,
    totalWin: round.totalWin,
    maxWinReached: round.maxWinReached,
  };
}

function toFreeSpins<S extends string>(fs: NonNullable<RoundResult<S>['freeSpins']>): FreeSpinsOutcome {
  return { awarded: fs.awarded, retriggers: fs.retriggers, spins: fs.spins.map(toSpin), totalWin: fs.totalWin };
}

function toSpin<S extends string>(spin: SpinResult<S>): SpinOutcome {
  return {
    stops: [...spin.stops],
    grid: spin.grid.map((column) => [...column]),
    lineWins: spin.lineWins.map(toLineWin),
    scatter: spin.scatter ? toScatter(spin.scatter) : null,
    multiplier: spin.multiplier,
    win: spin.win,
    capped: spin.capped,
  };
}

function toLineWin<S extends string>(lw: EngineLineWin<S>): LineWin {
  return {
    line: lw.lineIndex,
    symbol: lw.symbol,
    count: lw.count,
    positions: lw.positions.map(toPosition),
    win: lw.win,
  };
}

function toScatter(sw: EngineScatterWin): ScatterWin {
  return {
    count: sw.count,
    positions: sw.positions.map(toPosition),
    win: sw.win,
    freeSpinsAwarded: sw.freeSpinsAwarded,
  };
}

function toPosition([reel, row]: EnginePosition): Position {
  return { reel, row };
}

function toPayEntries(pays: PayByCount): PayEntry[] {
  return Object.entries(pays)
    .map(([count, multiplier]) => ({ count: Number(count), multiplier: multiplier ?? 0 }))
    .sort((a, b) => a.count - b.count);
}
