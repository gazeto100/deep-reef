import { SlotEngine } from '../engine/SlotEngine';
import type { GameDefinition, SpinResult } from '../engine/types';
import { Xoshiro128 } from '../rng/Xoshiro128';
import { SPIN_TAIL_THRESHOLDS } from './exact';

/**
 * Monte Carlo simulation of complete rounds through the same SlotEngine.playRound the
 * server uses. The exact calculator checks the evaluator, and the simulator checks
 * everything around it: the feature loop, retriggers, the cap and bookkeeping.
 *
 * All win figures are multiples of total bet.
 */
export interface SimulationOptions {
  readonly rounds: number;
  readonly seed: number;
  readonly totalBet: number;
  readonly onProgress?: (roundsDone: number) => void;
}

/** Upper edges of the win buckets (x bet). Zero wins get their own bucket. */
export const WIN_BUCKET_EDGES = [1, 2, 5, 20, 100, 500] as const;
export const WIN_BUCKET_LABELS = ['0', '<1x', '1-2x', '2-5x', '5-20x', '20-100x', '100-500x', '>=500x'] as const;

/** Index into WIN_BUCKET_LABELS for a round win (x bet). Lower edges are inclusive. */
export function bucketIndex(win: number): number {
  if (win === 0) return 0;
  const k = WIN_BUCKET_EDGES.findIndex((edge) => win < edge);
  return k === -1 ? WIN_BUCKET_LABELS.length - 1 : k + 1;
}

export interface Moments {
  readonly n: number;
  readonly mean: number;
  readonly sd: number;
  /** Standard error of the mean. */
  readonly seMean: number;
  /** Standard error of the SD (delta method, uses the 4th central moment). */
  readonly seSd: number;
}

export interface Percentiles {
  readonly median: number;
  readonly p90: number;
  readonly p99: number;
  readonly max: number;
}

export interface Contribution {
  readonly source: string;
  /**
   * 'line' and 'scatter' add up to the total, and 'cap' is negative. 'wild-assisted' is
   * the subset of line wins that used a wild, so it overlaps with 'line'.
   */
  readonly kind: 'line' | 'scatter' | 'cap' | 'wild-assisted';
  readonly base: number;
  readonly freeSpins: number;
}

export interface SimulationResult {
  readonly seed: number;
  readonly rounds: number;
  readonly seconds: number;
  /** Win per round, capped: mean = RTP, sd = volatility. */
  readonly roundWin: Moments;
  /** Base spin win per round (line + scatter). */
  readonly baseWin: Moments;
  /** Free-spin feature win per round (0 when not triggered). */
  readonly featureWinPerRound: Moments;
  readonly hitRate: number;
  readonly triggerRate: number;
  readonly features: number;
  readonly featureWin: Moments & Percentiles;
  readonly featureSpins: Moments;
  /** Raw (uncapped) win of a single free spin, multiplier included. */
  readonly freeSpinWin: Moments;
  readonly retriggerRate: number;
  readonly maxRound: { readonly win: number; readonly roundIndex: number; readonly freeSpins: number };
  readonly capHits: number;
  /** Credits (x bet) removed by the cap. It is a lower bound of the cap effect, since forfeited spins are never played. */
  readonly capLost: number;
  readonly buckets: readonly { readonly label: string; readonly count: number; readonly rtp: number }[];
  /** RTP by source (x bet per round). */
  readonly contributions: readonly Contribution[];
  readonly roundsAtLeast: readonly { readonly threshold: number; readonly count: number }[];
  /**
   * What-if caps: rounds that would reach each cap and the RTP it would remove,
   * E[(W - cap)+]. Exact for the simulated rounds as long as the real cap never bound.
   */
  readonly capScenarios: readonly { readonly cap: number; readonly rounds: number; readonly rtpLoss: number }[];
  /** Free spins whose raw win (x bet, multiplier included) reached each threshold. */
  readonly freeSpinTail: readonly { readonly threshold: number; readonly count: number }[];
}

class MomentAccumulator {
  private n = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;
  private s4 = 0;

  add(x: number): void {
    const x2 = x * x;
    this.n++;
    this.s1 += x;
    this.s2 += x2;
    this.s3 += x2 * x;
    this.s4 += x2 * x2;
  }

  /** Adds `count` zero observations at once (rounds without a feature, etc.). */
  addZeros(count: number): void {
    this.n += count;
  }

  result(): Moments {
    const { n } = this;
    if (n === 0) return { n, mean: 0, sd: 0, seMean: 0, seSd: 0 };
    const m = this.s1 / n;
    const e2 = this.s2 / n;
    const e3 = this.s3 / n;
    const e4 = this.s4 / n;
    const variance = Math.max(0, e2 - m * m);
    const mu4 = e4 - 4 * m * e3 + 6 * m * m * e2 - 3 * m ** 4;
    const sd = Math.sqrt(variance);
    // Var(s^2) ~ (mu4 - sigma^4) / n, then SE(s) ~ SE(s^2) / (2s).
    const seVar = Math.sqrt(Math.max(0, mu4 - variance * variance) / n);
    return { n, mean: m, sd, seMean: sd / Math.sqrt(n), seSd: sd > 0 ? seVar / (2 * sd) : 0 };
  }
}

export function simulate<S extends string>(def: GameDefinition<S>, options: SimulationOptions): SimulationResult {
  const { rounds, seed, totalBet, onProgress } = options;
  const engine = new SlotEngine(def);
  const rng = new Xoshiro128(seed);
  const started = Date.now();
  const bet = totalBet;

  const roundWin = new MomentAccumulator();
  const baseWin = new MomentAccumulator();
  const featurePerRound = new MomentAccumulator();
  const featureWin = new MomentAccumulator();
  const featureSpins = new MomentAccumulator();
  const freeSpinWin = new MomentAccumulator();
  const featureWins: number[] = [];

  const bucketCounts = new Array<number>(WIN_BUCKET_LABELS.length).fill(0);
  const bucketWins = new Array<number>(WIN_BUCKET_LABELS.length).fill(0);
  const thresholds = [100, 200, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000];
  const capCandidates = thresholds.filter((t) => t >= 1000);
  const capExcess = new Array<number>(capCandidates.length).fill(0);
  const freeSpinTail = new Array<number>(SPIN_TAIL_THRESHOLDS.length).fill(0);
  const atLeast = new Array<number>(thresholds.length).fill(0);

  const contribution = new Map<string, { kind: Contribution['kind']; base: number; freeSpins: number }>();
  const credit = (source: string, kind: Contribution['kind'], phase: 'base' | 'freeSpins', amount: number): void => {
    const key = `${kind}:${source}`;
    const entry = contribution.get(key) ?? { kind, base: 0, freeSpins: 0 };
    entry[phase] += amount;
    contribution.set(key, entry);
  };
  const creditSpin = (spin: SpinResult<S>, phase: 'base' | 'freeSpins'): void => {
    for (const lw of spin.lineWins) {
      credit(lw.symbol, 'line', phase, lw.win / bet);
      if (lw.positions.some(([r, row]) => spin.grid[r]?.[row] === def.wild))
        credit(def.wild, 'wild-assisted', phase, lw.win / bet);
    }
    if (spin.scatter) credit(def.scatter, 'scatter', phase, spin.scatter.win / bet);
    if (spin.capped) credit('max win cap', 'cap', phase, -(spin.rawWin - spin.win) / bet);
  };

  let hits = 0;
  let triggers = 0;
  let retriggerSpins = 0;
  let freeSpinsPlayed = 0;
  let capHits = 0;
  let capLost = 0;
  let maxRound = { win: 0, roundIndex: -1, freeSpins: 0 };

  for (let i = 0; i < rounds; i++) {
    const round = engine.playRound(bet, rng);
    const win = round.totalWin / bet;

    roundWin.add(win);
    baseWin.add(round.base.win / bet);
    creditSpin(round.base, 'base');
    if (win > 0) hits++;

    const index = bucketIndex(win);
    bucketCounts[index] = (bucketCounts[index] ?? 0) + 1;
    bucketWins[index] = (bucketWins[index] ?? 0) + win;

    thresholds.forEach((t, k) => {
      if (win >= t) atLeast[k] = (atLeast[k] ?? 0) + 1;
    });
    capCandidates.forEach((cap, k) => {
      if (win > cap) capExcess[k] = (capExcess[k] ?? 0) + (win - cap);
    });

    const fs = round.freeSpins;
    if (fs) {
      triggers++;
      const fw = fs.totalWin / bet;
      featureWin.add(fw);
      featurePerRound.add(fw);
      featureWins.push(fw);
      featureSpins.add(fs.spins.length);
      freeSpinsPlayed += fs.spins.length;
      for (const spin of fs.spins) {
        freeSpinWin.add(spin.rawWin / bet);
        SPIN_TAIL_THRESHOLDS.forEach((t, k) => {
          if (spin.rawWin / bet >= t) freeSpinTail[k] = (freeSpinTail[k] ?? 0) + 1;
        });
        if ((spin.scatter?.count ?? 0) >= def.freeSpins.triggerCount) retriggerSpins++;
        creditSpin(spin, 'freeSpins');
      }
    } else {
      featurePerRound.addZeros(1);
    }

    if (round.maxWinReached) capHits++;
    for (const spin of [round.base, ...(fs?.spins ?? [])]) capLost += (spin.rawWin - spin.win) / bet;
    if (win > maxRound.win) maxRound = { win, roundIndex: i, freeSpins: fs?.spins.length ?? 0 };

    if (onProgress && (i + 1) % 1_000_000 === 0) onProgress(i + 1);
  }

  const sorted = Float64Array.from(featureWins).sort();
  const quantile = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

  return {
    seed,
    rounds,
    seconds: (Date.now() - started) / 1000,
    roundWin: roundWin.result(),
    baseWin: baseWin.result(),
    featureWinPerRound: featurePerRound.result(),
    hitRate: hits / rounds,
    triggerRate: triggers / rounds,
    features: triggers,
    featureWin: {
      ...featureWin.result(),
      median: quantile(0.5),
      p90: quantile(0.9),
      p99: quantile(0.99),
      max: sorted[sorted.length - 1] ?? 0,
    },
    featureSpins: featureSpins.result(),
    freeSpinWin: freeSpinWin.result(),
    retriggerRate: freeSpinsPlayed > 0 ? retriggerSpins / freeSpinsPlayed : 0,
    maxRound,
    capHits,
    capLost: capLost / rounds,
    buckets: WIN_BUCKET_LABELS.map((label, k) => ({
      label,
      count: bucketCounts[k] ?? 0,
      rtp: (bucketWins[k] ?? 0) / rounds,
    })),
    contributions: [...contribution].map(([key, c]) => ({
      source: key.slice(c.kind.length + 1),
      kind: c.kind,
      base: c.base / rounds,
      freeSpins: c.freeSpins / rounds,
    })),
    roundsAtLeast: thresholds.map((threshold, k) => ({ threshold, count: atLeast[k] ?? 0 })),
    freeSpinTail: SPIN_TAIL_THRESHOLDS.map((threshold, k) => ({ threshold, count: freeSpinTail[k] ?? 0 })),
    capScenarios: capCandidates.map((cap, k) => ({
      cap,
      rounds: atLeast[thresholds.indexOf(cap)] ?? 0,
      rtpLoss: (capExcess[k] ?? 0) / rounds,
    })),
  };
}
