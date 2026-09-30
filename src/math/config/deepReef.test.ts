import { describe, expect, it } from 'vitest';
import { reelFingerprint } from '../analysis/fingerprint';
import { DEEP_REEF } from './deepReef';

/**
 * Pins the released reel strips. The base reels have been frozen since candidate v8, and
 * v13 restored them after v10-v12 accidentally re-laid reel 4 (see docs/math-tuning.md).
 * Changing a strip must be deliberate: update the pinned value in the same commit and
 * document why.
 */
describe('Deep Reef reel strips', () => {
  it('base reels are unchanged (frozen since v8)', () => {
    expect(reelFingerprint(DEEP_REEF.baseReels)).toBe('0276128d');
  });

  it('free-spin reels are unchanged (v11/v13)', () => {
    expect(reelFingerprint(DEEP_REEF.freeSpinReels)).toBe('44bfce94');
  });
});
