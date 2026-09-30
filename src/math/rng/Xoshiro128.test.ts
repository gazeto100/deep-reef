import { describe, expect, it } from 'vitest';
import { Xoshiro128 } from './Xoshiro128';

describe('Xoshiro128', () => {
  it('is deterministic for the same seed', () => {
    const a = new Xoshiro128(42);
    const b = new Xoshiro128(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.nextUint32()).toBe(b.nextUint32());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = new Xoshiro128(1);
    const b = new Xoshiro128(2);
    const seqA = Array.from({ length: 8 }, () => a.nextUint32());
    const seqB = Array.from({ length: 8 }, () => b.nextUint32());
    expect(seqA).not.toEqual(seqB);
  });

  it('returns unsigned 32-bit integers', () => {
    const rng = new Xoshiro128(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.nextUint32();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });

  it('nextInt stays in range and covers every value', () => {
    const rng = new Xoshiro128(123);
    const n = 37;
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const v = rng.nextInt(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
      seen.add(v);
    }
    expect(seen.size).toBe(n);
  });

  it('nextInt is approximately uniform (chi-square)', () => {
    const rng = new Xoshiro128(2024);
    const n = 10;
    const samples = 200_000;
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < samples; i++) {
      const v = rng.nextInt(n);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    const expected = samples / n;
    const chiSquare = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    // 9 degrees of freedom: the critical value at p = 0.001 is 27.88.
    expect(chiSquare).toBeLessThan(27.88);
  });

  it('rejects invalid ranges', () => {
    const rng = new Xoshiro128(1);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(-3)).toThrow(RangeError);
    expect(() => rng.nextInt(2.5)).toThrow(RangeError);
  });
});
