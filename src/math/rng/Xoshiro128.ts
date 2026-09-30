import { BaseRng } from './Rng';

/** SplitMix32 expands a single 32-bit seed into well-mixed state words. */
function splitMix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/**
 * xoshiro128** (Blackman & Vigna): fast, 128-bit state, period 2^128 - 1.
 *
 * It is not cryptographically secure. It is used where reproducibility matters: the
 * simulator, tests and the mock server in demo mode.
 */
export class Xoshiro128 extends BaseRng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    super();
    const next = splitMix32(seed);
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    // An all-zero state is the one fixed point of the generator.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      this.s0 = 1;
    }
  }

  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;

    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);

    return result;
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}
