/**
 * Stable 32-bit FNV-1a fingerprint of a reel set. Tests pin the fingerprint of the
 * released strips, so any change to them has to be deliberate: the pinned value must
 * be updated in the same commit.
 */
export function reelFingerprint(reels: readonly (readonly string[])[]): string {
  let hash = 0x811c9dc5;
  const text = reels.map((strip) => strip.join(',')).join('|');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
