import type { CompiledGame } from '../engine/compile';
import { evaluateLine, linePayOf, readLine, unpackCount, unpackSymbol } from '../engine/evaluate';

/**
 * Exact analysis by full-cycle enumeration: every combination of reel stops is
 * evaluated once, so the results are exact rather than estimates.
 *
 * All win figures are multiples of total bet, before any free-spin multiplier.
 */
export interface ReelSetAnalysis {
  readonly combinations: number;
  readonly rtpLines: number;
  readonly rtpScatter: number;
  readonly rtp: number;
  /** Share of rtpLines that comes from line wins with at least one wild. */
  readonly rtpLinesWithWild: number;
  /** P(spin win > 0). */
  readonly hitRate: number;
  /** P(scatter count >= trigger count). */
  readonly triggerProbability: number;
  /** scatterCountProbability[n] = P(exactly n scatters visible). */
  readonly scatterCountProbability: readonly number[];
  readonly meanWin: number;
  readonly winVariance: number;
  readonly maxWin: number;
  /** E[(multiplier × spin win − cap)+]: how far a single spin exceeds the round cap on average. */
  readonly meanExcessOverCap: number;
  /** P(multiplier × spin win >= cap): a single spin alone reaches the cap. */
  readonly capReachProbability: number;
  /** P(multiplier × spin win >= threshold) for SPIN_TAIL_THRESHOLDS (x bet). */
  readonly tail: readonly { readonly threshold: number; readonly probability: number }[];
  readonly lineStats: readonly LineStat[];
  readonly scatterStats: readonly ScatterStat[];
}

export interface LineStat {
  readonly symbol: string;
  readonly count: number;
  /** Pay as a multiple of line bet. */
  readonly pay: number;
  /** Probability that a given payline shows this win. */
  readonly probabilityPerLine: number;
  /** Expected hits per spin across all paylines. */
  readonly hitsPerSpin: number;
  readonly rtp: number;
}

export interface ScatterStat {
  readonly count: number;
  /** Pay as a multiple of total bet. */
  readonly pay: number;
  readonly probability: number;
  readonly rtp: number;
}

/** Single-spin win thresholds (x bet, multiplier included) whose exact probability is reported. */
export const SPIN_TAIL_THRESHOLDS = [100, 500, 1000, 2000] as const;

/**
 * @param capMultiplier multiplier applied before comparing a spin with the round cap
 *   (the free-spin multiplier for free-spin reels). Only affects the cap fields.
 */
export function analyzeReelSet(game: CompiledGame, reels: readonly Uint8Array[], capMultiplier = 1): ReelSetAnalysis {
  const { reelCount, rowCount, paylines, scatter, symbolCount } = game;
  const cap = game.def.maxWinMultiplier;
  const lineCount = paylines.length;
  const stride = reelCount + 1;
  const triggerCount = game.def.freeSpins.triggerCount;

  // Scatters visible in each column for each stop, precomputed once.
  const scattersAt = reels.map((strip) => {
    const counts = new Uint8Array(strip.length);
    for (let stop = 0; stop < strip.length; stop++) {
      for (let row = 0; row < rowCount; row++) {
        if (strip[(stop + row) % strip.length] === scatter) counts[stop] = (counts[stop] ?? 0) + 1;
      }
    }
    return counts;
  });

  const window = new Uint8Array(reelCount * rowCount);
  const lineBuffer = new Uint8Array(reelCount);
  const lineHits = new Float64Array(symbolCount * stride);
  const scatterHits = new Float64Array(reelCount * rowCount + 1);

  let combinations = 0;
  let sumLineUnits = 0; // in line-bet units
  let sumLineUnitsWithWild = 0;
  let sumScatterUnits = 0; // in total-bet units
  let sumWin = 0;
  let sumWinSquared = 0;
  let hits = 0;
  let maxWin = 0;
  let sumExcess = 0;
  let capReaches = 0;
  const tailCounts = new Float64Array(SPIN_TAIL_THRESHOLDS.length);

  const evaluateCombination = (scatters: number): void => {
    combinations++;
    let lineUnits = 0;
    for (let li = 0; li < lineCount; li++) {
      readLine(game, window, li, lineBuffer);
      const packed = evaluateLine(game, lineBuffer);
      if (packed === 0) continue;
      const symbol = unpackSymbol(packed);
      const count = unpackCount(packed);
      const pay = linePayOf(game, symbol, count);
      lineUnits += pay;
      lineHits[symbol * stride + count] = (lineHits[symbol * stride + count] ?? 0) + 1;
      if (symbol !== game.wild && usesWild(lineBuffer, count, game.wild)) sumLineUnitsWithWild += pay;
    }

    const scatterUnits = game.scatterPay[scatters] ?? 0;
    scatterHits[scatters] = (scatterHits[scatters] ?? 0) + 1;

    const win = lineUnits / lineCount + scatterUnits;
    sumLineUnits += lineUnits;
    sumScatterUnits += scatterUnits;
    sumWin += win;
    sumWinSquared += win * win;
    if (win > 0) hits++;
    if (win > maxWin) maxWin = win;
    const scaled = win * capMultiplier;
    if (scaled >= cap) {
      capReaches++;
      sumExcess += scaled - cap;
    }
    for (let k = 0; k < SPIN_TAIL_THRESHOLDS.length; k++) {
      if (scaled >= (SPIN_TAIL_THRESHOLDS[k] ?? Infinity)) tailCounts[k] = (tailCounts[k] ?? 0) + 1;
    }
  };

  // Depth-first walk over reels: column r is rewritten only when its stop changes.
  const walk = (reel: number, scatters: number): void => {
    const strip = reels[reel];
    const scatterCounts = scattersAt[reel];
    if (strip === undefined || scatterCounts === undefined) throw new RangeError(`missing reel ${reel}`);
    const base = reel * rowCount;
    for (let stop = 0; stop < strip.length; stop++) {
      for (let row = 0; row < rowCount; row++) {
        window[base + row] = strip[(stop + row) % strip.length] ?? 0;
      }
      const total = scatters + (scatterCounts[stop] ?? 0);
      if (reel === reelCount - 1) evaluateCombination(total);
      else walk(reel + 1, total);
    }
  };
  walk(0, 0);

  const lineStats: LineStat[] = [];
  for (let symbol = 0; symbol < symbolCount; symbol++) {
    for (let count = 1; count <= reelCount; count++) {
      const pay = linePayOf(game, symbol, count);
      if (pay === 0) continue;
      const hitCount = lineHits[symbol * stride + count] ?? 0;
      lineStats.push({
        symbol: game.def.symbols[symbol] ?? `#${symbol}`,
        count,
        pay,
        probabilityPerLine: hitCount / combinations / lineCount,
        hitsPerSpin: hitCount / combinations,
        rtp: (hitCount * pay) / combinations / lineCount,
      });
    }
  }

  const scatterCountProbability = Array.from(scatterHits, (n) => n / combinations);
  const scatterStats: ScatterStat[] = [];
  scatterCountProbability.forEach((probability, count) => {
    const pay = game.scatterPay[count] ?? 0;
    if (pay > 0) scatterStats.push({ count, pay, probability, rtp: probability * pay });
  });

  const meanWin = sumWin / combinations;
  return {
    combinations,
    rtpLines: sumLineUnits / lineCount / combinations,
    rtpScatter: sumScatterUnits / combinations,
    rtp: meanWin,
    rtpLinesWithWild: sumLineUnitsWithWild / lineCount / combinations,
    hitRate: hits / combinations,
    triggerProbability: scatterCountProbability.slice(triggerCount).reduce((a, b) => a + b, 0),
    scatterCountProbability,
    meanWin,
    winVariance: sumWinSquared / combinations - meanWin * meanWin,
    maxWin,
    meanExcessOverCap: sumExcess / combinations,
    capReachProbability: capReaches / combinations,
    tail: SPIN_TAIL_THRESHOLDS.map((threshold, k) => ({ threshold, probability: (tailCounts[k] ?? 0) / combinations })),
    lineStats,
    scatterStats,
  };
}

/**
 * Line RTP by an independent method that uses only symbol frequencies per reel, not
 * the strip layout. Each line sees one row per reel, and every row of a reel is
 * uniformly distributed with the reel's symbol frequencies, so per-line EV depends
 * only on the counts. It must equal the full-cycle rtpLines. Verify uses it to
 * cross-check the calculator.
 */
export function lineRtpFromFrequencies(game: CompiledGame, reels: readonly Uint8Array[]): number {
  const freq = reels.map((strip) => {
    const f = new Float64Array(game.symbolCount);
    for (const s of strip) f[s] = (f[s] ?? 0) + 1 / strip.length;
    return f;
  });
  const line = new Uint8Array(game.reelCount);
  let ev = 0;
  const walk = (reel: number, probability: number): void => {
    if (reel === game.reelCount) {
      const packed = evaluateLine(game, line);
      if (packed !== 0) ev += probability * linePayOf(game, unpackSymbol(packed), unpackCount(packed));
      return;
    }
    const f = freq[reel];
    for (let s = 0; s < game.symbolCount; s++) {
      const q = f?.[s] ?? 0;
      if (q === 0) continue;
      line[reel] = s;
      walk(reel + 1, probability * q);
    }
  };
  walk(0, 1);
  // Per-line EV in line bets = line RTP, since all lines share it and total bet = lines × line bet.
  return ev;
}

function usesWild(lineSymbols: Uint8Array, count: number, wild: number): boolean {
  for (let r = 0; r < count; r++) {
    if (lineSymbols[r] === wild) return true;
  }
  return false;
}

/**
 * Expected number of free spins played per feature, exactly, given the retrigger
 * probability of a single free spin. It follows the engine's award rules, including
 * the maxTotal clamp. The win cap is ignored here because it depends on the win
 * distribution, not on scatter counts.
 */
export function expectedFreeSpins(game: CompiledGame, retriggerProbability: number): number {
  const { awarded, retriggerAwarded, maxTotal } = game.def.freeSpins;
  const initial = Math.min(awarded, maxTotal);
  const memo = new Map<string, number>();

  // f(remaining, total awarded) = expected spins still to play.
  const f = (remaining: number, total: number): number => {
    if (remaining === 0) return 0;
    const key = `${remaining}:${total}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const add = Math.min(retriggerAwarded, maxTotal - total);
    const value =
      1 +
      retriggerProbability * f(remaining - 1 + add, total + add) +
      (1 - retriggerProbability) * f(remaining - 1, total);
    memo.set(key, value);
    return value;
  };

  return f(initial, initial);
}

export interface RoundAnalysis {
  readonly base: ReelSetAnalysis;
  readonly freeSpins: ReelSetAnalysis;
  readonly expectedFreeSpinsPerFeature: number;
  /** Mean total win of one feature, multiplier included, without the round cap. */
  readonly featureMeanUncapped: number;
  readonly rtpBase: number;
  readonly rtpFeatureUncapped: number;
  /** Exact RTP without the cap. */
  readonly rtpUncapped: number;
  /**
   * Exact lower bound on the RTP removed by the cap: E[N] × E[(single free spin − cap)+]
   * per trigger (+ the base-game term). It holds because a round's uncapped win is at
   * least the sum of its spins' excesses over the cap, and Wald applies to that sum.
   */
  readonly capLossLowerBound: number;
  /** Exact upper bound on the capped RTP: rtpUncapped − capLossLowerBound. */
  readonly rtpCappedUpperBound: number;
  /** P(a single free spin alone reaches the cap), per round. */
  readonly singleSpinCapProbabilityPerRound: number;
  /** Exact; equals the round hit rate because every trigger also pays scatters. */
  readonly hitRate: number;
  readonly triggerProbability: number;
  /** Largest single base spin, in total bets. If below the cap, the cap never binds in the base game. */
  readonly baseMaxWin: number;
  readonly freeSpinMaxWin: number;
  readonly maxWinMultiplier: number;
}

export function analyzeRound(game: CompiledGame): RoundAnalysis {
  const { winMultiplier } = game.def.freeSpins;
  const base = analyzeReelSet(game, game.baseReels);
  const freeSpins = analyzeReelSet(game, game.freeSpinReels, winMultiplier);

  const expectedSpins = expectedFreeSpins(game, freeSpins.triggerProbability);
  // Wald's identity: E[sum of N spin wins] = E[N] * E[spin win]. It holds because the
  // decision to play spin i depends only on spins 1..i-1.
  const featureMeanUncapped = expectedSpins * freeSpins.meanWin * winMultiplier;
  const rtpFeatureUncapped = base.triggerProbability * featureMeanUncapped;
  const rtpUncapped = base.rtp + rtpFeatureUncapped;
  const freeSpinsPerRound = base.triggerProbability * expectedSpins;
  const capLossLowerBound = base.meanExcessOverCap + freeSpinsPerRound * freeSpins.meanExcessOverCap;

  return {
    base,
    freeSpins,
    expectedFreeSpinsPerFeature: expectedSpins,
    featureMeanUncapped,
    rtpBase: base.rtp,
    rtpFeatureUncapped,
    rtpUncapped,
    capLossLowerBound,
    rtpCappedUpperBound: rtpUncapped - capLossLowerBound,
    singleSpinCapProbabilityPerRound: base.capReachProbability + freeSpinsPerRound * freeSpins.capReachProbability,
    hitRate: base.hitRate,
    triggerProbability: base.triggerProbability,
    baseMaxWin: base.maxWin,
    freeSpinMaxWin: freeSpins.maxWin * winMultiplier,
    maxWinMultiplier: game.def.maxWinMultiplier,
  };
}
