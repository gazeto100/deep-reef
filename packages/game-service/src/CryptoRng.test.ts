import { describe, expect, it, vi } from 'vitest';
import { CryptoRng } from './CryptoRng';

describe('CryptoRng', () => {
  it('draws values in batches from the injected source', () => {
    let counter = 0;
    const fill = vi.fn((array: Uint32Array) => {
      for (let i = 0; i < array.length; i++) array[i] = counter++;
      return array;
    });
    const rng = new CryptoRng(fill);

    expect(rng.nextUint32()).toBe(0);
    expect(fill).toHaveBeenCalledTimes(1);
    for (let i = 1; i < 256; i++) rng.nextUint32();
    expect(fill).toHaveBeenCalledTimes(1);
    expect(rng.nextUint32()).toBe(256); // refills after 256 values
    expect(fill).toHaveBeenCalledTimes(2);
  });

  it('works with the real Web Crypto source and stays in range', () => {
    const rng = new CryptoRng((array) => crypto.getRandomValues(array));
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(32);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(32);
    }
  });
});
