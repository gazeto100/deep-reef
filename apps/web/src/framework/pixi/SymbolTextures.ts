import { Assets, Container, Graphics, Text, type Renderer, type Texture } from 'pixi.js';

/** Fallback look of a symbol (labelled tile), used when its artwork is missing or fails to load. */
export interface SymbolStyle {
  readonly label: string;
  readonly fill: number;
  readonly text: number;
  readonly border: number;
}

export type SymbolTheme = Readonly<Record<string, SymbolStyle>>;

const FALLBACK: SymbolStyle = { label: '?', fill: 0x444444, text: 0xffffff, border: 0x888888 };

/**
 * Draws each symbol once (rounded tile + label) and bakes it into a texture, so the reels
 * render sprites instead of re-drawing vector graphics every frame.
 */
export function createSymbolTextures(
  renderer: Renderer,
  symbols: readonly string[],
  theme: SymbolTheme,
  size: number,
): Map<string, Texture> {
  const textures = new Map<string, Texture>();
  for (const symbol of symbols) {
    const style = theme[symbol] ?? { ...FALLBACK, label: symbol };
    const tile = new Container();
    tile.addChild(
      new Graphics()
        .roundRect(0, 0, size, size, size * 0.16)
        .fill(style.fill)
        .stroke({ width: Math.max(2, size * 0.04), color: style.border, alignment: 1 }),
    );
    const label = new Text({
      text: style.label,
      style: {
        fontFamily: 'system-ui, Segoe UI, Arial, sans-serif',
        fontWeight: '800',
        fontSize: style.label.length <= 2 ? size * 0.5 : size * (style.label.length > 5 ? 0.17 : 0.22),
        fill: style.text,
        align: 'center',
      },
    });
    label.anchor.set(0.5);
    label.position.set(size / 2, size / 2);
    tile.addChild(label);

    textures.set(symbol, renderer.generateTexture({ target: tile, resolution: 2 }));
    tile.destroy({ children: true });
  }
  return textures;
}

/** Artwork per symbol (image URLs, e.g. SVG), plus the labelled-tile fallback. */
export interface SymbolArt {
  readonly images: Readonly<Partial<Record<string, string>>>;
  readonly fallback: SymbolTheme;
}

/** Rasterisation scale for vector artwork: sharp on high-density phones without wasting memory. */
const ART_RESOLUTION = 1.5;

/**
 * Loads each symbol's artwork through Pixi Assets (SVG is rasterised once at load time).
 * A symbol without artwork, or whose image fails to load, gets a generated labelled tile,
 * so a missing file degrades the look but never breaks the game.
 */
export async function loadSymbolTextures(
  renderer: Renderer,
  symbols: readonly string[],
  art: SymbolArt,
  size: number,
): Promise<{ textures: Map<string, Texture>; release: () => void }> {
  const textures = new Map<string, Texture>();
  const loaded: string[] = [];
  const missing: string[] = [];

  await Promise.all(
    symbols.map(async (symbol) => {
      const src = art.images[symbol];
      if (!src) {
        missing.push(symbol);
        return;
      }
      try {
        textures.set(symbol, await Assets.load<Texture>({ src, data: { resolution: ART_RESOLUTION } }));
        loaded.push(src);
      } catch (error) {
        console.warn(`symbol art for ${symbol} failed to load, using a fallback tile`, error);
        missing.push(symbol);
      }
    }),
  );

  const generated = createSymbolTextures(renderer, missing, art.fallback, size);
  for (const [symbol, texture] of generated) textures.set(symbol, texture);

  return {
    textures,
    release: () => {
      for (const texture of generated.values()) texture.destroy(true);
      void Assets.unload(loaded);
    },
  };
}
