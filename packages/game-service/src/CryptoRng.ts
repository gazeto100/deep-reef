import { BaseRng } from '@deep-reef/math/rng/Rng';

/** Same shape as crypto.getRandomValues for a Uint32Array (Web Crypto, in browsers and Node). */
export type FillRandom = (array: Uint32Array<ArrayBuffer>) => unknown;

/**
 * Rng backed by a cryptographically secure source, for real outcomes. The source is
 * injected (usually `crypto.getRandomValues.bind(crypto)`), so this package needs no DOM
 * or Node typings. Values are drawn in batches to avoid a call per number; range
 * reduction stays unbiased via BaseRng.nextInt.
 */
export class CryptoRng extends BaseRng {
  private readonly buffer = new Uint32Array(new ArrayBuffer(256 * 4));
  private index: number;
  private readonly fill: FillRandom;

  constructor(fill: FillRandom) {
    super();
    this.fill = fill;
    this.index = this.buffer.length;
  }

  nextUint32(): number {
    if (this.index >= this.buffer.length) {
      this.fill(this.buffer);
      this.index = 0;
    }
    const value = this.buffer[this.index] ?? 0;
    this.index++;
    return value;
  }
}
