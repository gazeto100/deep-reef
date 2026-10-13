/**
 * Source of randomness for the math engine.
 *
 * The engine depends only on this interface. That lets the same round logic run with a
 * seedable PRNG (simulator, tests, reproducible bug reports) or with a certified
 * CSPRNG on a real server.
 */
export interface Rng {
  /** Uniform integer in [0, 2^32). */
  nextUint32(): number;
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

const UINT32_RANGE = 0x1_0000_0000;

/**
 * Template-method base class: subclasses supply raw 32-bit output and inherit
 * unbiased range reduction.
 */
export abstract class BaseRng implements Rng {
  abstract nextUint32(): number;

  /**
   * Rejection sampling. A plain `nextUint32() % n` is biased whenever 2^32 is not a
   * multiple of n: the low residues get one extra preimage. We discard the
   * incomplete top bucket so every result has exactly the same number of preimages.
   */
  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
      throw new RangeError(`nextInt: maxExclusive must be an integer in (0, 2^32], got ${maxExclusive}`);
    }
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    let value = this.nextUint32();
    while (value >= limit) {
      value = this.nextUint32();
    }
    return value % maxExclusive;
  }
}
