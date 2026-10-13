import { Container, type Texture } from 'pixi.js';
import type { Hurry } from './Hurry';
import { Reel } from './Reel';

export interface ReelTimings {
  /** Scroll speed while spinning. */
  readonly speedPxPerMs: number;
  /** The reels spin at least this long, even if the server answers instantly. */
  readonly minSpinMs: number;
  /** Delay between consecutive reels stopping. */
  readonly stopStaggerMs: number;
}

export interface ReelSetOptions {
  readonly textures: ReadonlyMap<string, Texture>;
  readonly fillers: readonly string[];
  readonly reels: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly symbolSize: number;
}

/** All reels of the game: starts them together and stops them one by one, or all at once on a slam. */
export class ReelSet extends Container {
  readonly reels: readonly Reel[];
  private readonly options: ReelSetOptions;

  constructor(options: ReelSetOptions) {
    super();
    this.options = options;
    this.reels = Array.from({ length: options.reels }, (_, i) => {
      const reel = new Reel(options);
      reel.x = i * options.cellSize;
      this.addChild(reel);
      return reel;
    });
  }

  get size(): { width: number; height: number } {
    return { width: this.options.reels * this.options.cellSize, height: this.options.rows * this.options.cellSize };
  }

  show(grid: readonly (readonly string[])[]): void {
    this.reels.forEach((reel, i) => reel.show(grid[i] ?? []));
  }

  start(timings: ReelTimings): void {
    for (const reel of this.reels) reel.start(timings.speedPxPerMs);
  }

  /**
   * Stops on `grid` (grid[reel][row]) reel by reel. A hurry press during the stop
   * sequence slams every reel that is still moving.
   */
  async stop(grid: readonly (readonly string[])[], timings: ReelTimings, hurry: Hurry): Promise<void> {
    let slammed = false;
    const slam = (): void => {
      slammed = true;
      this.reels.forEach((reel, i) => reel.slam(grid[i]));
    };
    const sequence = (async () => {
      const landings: Promise<void>[] = [];
      for (let i = 0; i < this.reels.length && !slammed; i++) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, timings.stopStaggerMs));
        if (slammed) break;
        landings.push(this.reels[i]?.stop(grid[i] ?? []) ?? Promise.resolve());
      }
      await Promise.all(landings);
    })();
    await hurry.during(sequence, slam);
  }

  /** Stops everything where it is on the given grid (e.g. after a failed request). */
  slam(grid: readonly (readonly string[])[]): void {
    this.reels.forEach((reel, i) => reel.slam(grid[i]));
  }

  update(deltaMs: number): void {
    for (const reel of this.reels) reel.update(deltaMs);
  }
}
