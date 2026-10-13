import type { SymbolArt, SymbolTheme } from '@framework/pixi/SymbolTextures';
import a from './symbols/a.svg';
import j from './symbols/j.svg';
import k from './symbols/k.svg';
import octopus from './symbols/octopus.svg';
import puffer from './symbols/puffer.svg';
import q from './symbols/q.svg';
import scatter from './symbols/scatter.svg';
import seahorse from './symbols/seahorse.svg';
import shark from './symbols/shark.svg';
import turtle from './symbols/turtle.svg';
import wild from './symbols/wild.svg';

/**
 * Fallback look of the Deep Reef symbols (labelled tiles), used only if artwork fails to
 * load. Colours match the artwork: warm for premiums, cool for low symbols.
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

/**
 * Symbol artwork: hand-made SVG tiles in one style (gradient tile, light rim, flat
 * creatures with dark outlines). Letters are drawn as paths, not text, so they look the
 * same on every device. Vite turns each import into a hashed URL (or an inline data URL
 * for small files). The paytable screen shows the same images.
 */
export const DEEP_REEF_SYMBOL_IMAGES: Readonly<Record<string, string>> = {
  WILD: wild,
  SCATTER: scatter,
  SHARK: shark,
  OCTOPUS: octopus,
  TURTLE: turtle,
  SEAHORSE: seahorse,
  PUFFER: puffer,
  A: a,
  K: k,
  Q: q,
  J: j,
};

export const DEEP_REEF_ART: SymbolArt = { images: DEEP_REEF_SYMBOL_IMAGES, fallback: DEEP_REEF_THEME };
