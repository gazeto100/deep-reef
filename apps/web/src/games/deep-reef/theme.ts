import type { SymbolTheme } from '@framework/pixi/SymbolTextures';

/**
 * Placeholder look of the Deep Reef symbols: coloured tiles with labels, rendered to
 * textures at startup. Phase 5 replaces this with SVG artwork in a texture atlas.
 * Colours follow the pay rank: warm and saturated for premiums, cool for low symbols.
 */
export const DEEP_REEF_THEME: SymbolTheme = {
  WILD: { label: 'WILD', fill: 0xf4b400, text: 0x3a2400, border: 0xfff1b8 },
  SCATTER: { label: 'BONUS', fill: 0x8e3fd1, text: 0xffffff, border: 0xe0c3ff },
  SHARK: { label: 'SHARK', fill: 0xd7263d, text: 0xffffff, border: 0xff9aa6 },
  OCTOPUS: { label: 'OCTO', fill: 0xf46036, text: 0xffffff, border: 0xffbfa6 },
  TURTLE: { label: 'TURTLE', fill: 0x1b998b, text: 0xffffff, border: 0x9ff1e6 },
  SEAHORSE: { label: 'HORSE', fill: 0x2e86ab, text: 0xffffff, border: 0xa9dcf5 },
  PUFFER: { label: 'PUFFER', fill: 0x6c757d, text: 0xffffff, border: 0xc8ced3 },
  A: { label: 'A', fill: 0x14334a, text: 0x7fd1ff, border: 0x3d7aa3 },
  K: { label: 'K', fill: 0x14334a, text: 0x9ef0c4, border: 0x3d7aa3 },
  Q: { label: 'Q', fill: 0x14334a, text: 0xffd3f0, border: 0x3d7aa3 },
  J: { label: 'J', fill: 0x14334a, text: 0xfff3a3, border: 0x3d7aa3 },
};
