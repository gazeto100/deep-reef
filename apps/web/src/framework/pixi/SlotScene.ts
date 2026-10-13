import type { GameConfig } from '@deep-reef/contract/schemas';
import { Container, Graphics, type Texture } from 'pixi.js';
import { ReelSet } from './ReelSet';
import { WinPresenter } from './WinPresenter';

export const CELL_SIZE = 128;
export const SYMBOL_SIZE = 116;
const FRAME_PADDING = 16;

/**
 * The game's root display object: frame, reels and win overlay at a fixed design size,
 * scaled uniformly to fit whatever the canvas is (portrait phone or landscape desktop).
 */
export class SlotScene extends Container {
  readonly reelSet: ReelSet;
  readonly winPresenter: WinPresenter;
  private readonly designWidth: number;
  private readonly designHeight: number;

  constructor(config: GameConfig, textures: ReadonlyMap<string, Texture>) {
    super();
    this.reelSet = new ReelSet({
      textures,
      // Random filler symbols (spinning reels, first screen) never include the wild or the
      // scatter: they could form layouts the real strips cannot produce (two scatters on
      // one reel, a wild on reel 1). Results from the server show them as they are.
      fillers: config.symbols.filter((s) => s !== config.wild && s !== config.scatter),
      reels: config.reels,
      rows: config.rows,
      cellSize: CELL_SIZE,
      symbolSize: SYMBOL_SIZE,
    });
    this.winPresenter = new WinPresenter({
      cellSize: CELL_SIZE,
      reels: config.reels,
      rows: config.rows,
      paylines: config.paylines,
    });

    const { width, height } = this.reelSet.size;
    this.designWidth = width + 2 * FRAME_PADDING;
    this.designHeight = height + 2 * FRAME_PADDING;

    const frame = new Graphics()
      .roundRect(0, 0, this.designWidth, this.designHeight, 24)
      .fill({ color: 0x021725, alpha: 0.85 })
      .stroke({ width: 4, color: 0x2b7fb8 });
    this.reelSet.position.set(FRAME_PADDING, FRAME_PADDING);
    this.winPresenter.position.set(FRAME_PADDING, FRAME_PADDING);
    this.addChild(frame, this.reelSet, this.winPresenter);
  }

  /** Uniform scale to fit the screen with a small margin, centred. */
  fit(screenWidth: number, screenHeight: number): void {
    const margin = 0.96;
    const scale = Math.min((screenWidth * margin) / this.designWidth, (screenHeight * margin) / this.designHeight);
    this.scale.set(Math.max(scale, 0.01));
    this.position.set(
      (screenWidth - this.designWidth * this.scale.x) / 2,
      (screenHeight - this.designHeight * this.scale.y) / 2,
    );
  }
}
