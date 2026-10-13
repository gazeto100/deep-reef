import { describe, expect, it } from 'vitest';
import { TEST_GAME } from '../engine/testGame.fixture';
import { bucketIndex, simulate, WIN_BUCKET_LABELS } from './simulator';

describe('bucketIndex', () => {
  it('puts zero wins in their own bucket and uses inclusive lower edges', () => {
    const label = (w: number): string => WIN_BUCKET_LABELS[bucketIndex(w)] ?? '?';
    expect(label(0)).toBe('0');
    expect(label(0.05)).toBe('<1x');
    expect(label(1)).toBe('1-2x');
    expect(label(4.99)).toBe('2-5x');
    expect(label(20)).toBe('20-100x');
    expect(label(499)).toBe('100-500x');
    expect(label(500)).toBe('>=500x');
    expect(label(5000)).toBe('>=500x');
  });
});

describe('simulate', () => {
  const result = simulate(TEST_GAME, { rounds: 20_000, seed: 7, totalBet: 3 });

  it('is reproducible for the same seed', () => {
    const again = simulate(TEST_GAME, { rounds: 20_000, seed: 7, totalBet: 3 });
    expect({ ...again, seconds: 0 }).toEqual({ ...result, seconds: 0 });
  });

  it('keeps its bookkeeping consistent', () => {
    const bucketTotal = result.buckets.reduce((sum, b) => sum + b.count, 0);
    expect(bucketTotal).toBe(result.rounds);

    const bucketRtp = result.buckets.reduce((sum, b) => sum + b.rtp, 0);
    expect(bucketRtp).toBeCloseTo(result.roundWin.mean, 10);

    // Wild-assisted wins are a subset of line wins, so they are excluded from the sum.
    const contributionRtp = result.contributions
      .filter((c) => c.kind !== 'wild-assisted')
      .reduce((sum, c) => sum + c.base + c.freeSpins, 0);
    expect(contributionRtp).toBeCloseTo(result.roundWin.mean, 10);

    expect(result.baseWin.mean + result.featureWinPerRound.mean).toBeCloseTo(result.roundWin.mean, 10);
  });
});
