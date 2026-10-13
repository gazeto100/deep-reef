import { Container, Graphics, Text, type Renderer, type Texture } from 'pixi.js';

/** How one symbol looks while there is no artwork yet (phase 5 replaces it with an atlas). */
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
