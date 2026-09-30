import type { Rng } from './Rng';

/**
 * Deterministic Rng that replays a fixed list of values. It is used to force exact
 * outcomes (reel stops) in tests and, later, in debug tooling.
 */
export class ScriptedRng implements Rng {
  private cursor = 0;

  constructor(private readonly values: readonly number[]) {}

  get remaining(): number {
    return this.values.length - this.cursor;
  }

  nextInt(maxExclusive: number): number {
    const value = this.values[this.cursor];
    if (value === undefined) {
      throw new Error(`ScriptedRng exhausted after ${this.cursor} values`);
    }
    if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
      throw new RangeError(`ScriptedRng value ${value} at #${this.cursor} is outside [0, ${maxExclusive})`);
    }
    this.cursor++;
    return value;
  }

  nextUint32(): number {
    return this.nextInt(0x1_0000_0000);
  }
}
