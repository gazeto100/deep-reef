import { Container, Graphics, Sprite, type Texture } from 'pixi.js';

export interface ReelOptions {
  readonly textures: ReadonlyMap<string, Texture>;
  /** Symbols to show while spinning (the reel never needs the real strip). */
  readonly fillers: readonly string[];
  readonly rows: number;
  /** Distance between symbol centres. */
  readonly cellSize: number;
  /** Rendered symbol size (cellSize minus the gap). */
  readonly symbolSize: number;
  readonly random?: () => number;
}

type ReelState = 'idle' | 'spinning' | 'stopping';

/**
 * One reel: rows + 1 sprites scrolling down inside a mask. When a sprite leaves the
 * bottom it wraps to the top with the next symbol: a filler while spinning, the result
 * column while stopping. So the reel always lands exactly on the server's grid.
 *
 * Sprite 0 sits just above the window; sprites 1..rows are the visible rows.
 */
export class Reel extends Container {
  private readonly options: ReelOptions;
  private readonly random: () => number;
  private readonly sprites: Sprite[] = [];
  private offset = 0;
  private speed = 0; // px per ms
  private state: ReelState = 'idle';
  private readonly queue: string[] = [];
  private wrapsUntilLanding = 0;
  private target: readonly string[] | null = null;
  private landed: (() => void) | null = null;

  constructor(options: ReelOptions) {
    super();
    this.options = options;
    this.random = options.random ?? Math.random;

    for (let i = 0; i <= options.rows; i++) {
      const sprite = new Sprite(this.textureFor(this.randomFiller()));
      sprite.width = options.symbolSize;
      sprite.height = options.symbolSize;
      this.sprites.push(sprite);
      this.addChild(sprite);
    }
    const mask = new Graphics().rect(0, 0, options.cellSize, options.rows * options.cellSize).fill(0xffffff);
    this.addChild(mask);
    this.mask = mask;
    this.layoutSprites();
  }

  get isIdle(): boolean {
    return this.state === 'idle';
  }

  /** Shows a column without animation (initial screen, or after a slam). */
  show(column: readonly string[]): void {
    this.sprites.forEach((sprite, i) => {
      sprite.texture = this.textureFor(i === 0 ? this.randomFiller() : (column[i - 1] ?? this.randomFiller()));
    });
    this.offset = 0;
    this.layoutSprites();
  }

  start(speedPxPerMs: number): void {
    this.speed = speedPxPerMs;
    this.queue.length = 0;
    this.target = null;
    this.state = 'spinning';
  }

  /**
   * Lands on `column` (top to bottom). The result symbols enter from the top in reverse
   * order; after rows + 1 wraps they fill the window exactly.
   */
  stop(column: readonly string[]): Promise<void> {
    if (this.state === 'idle') {
      this.show(column);
      return Promise.resolve();
    }
    this.target = column;
    this.queue.length = 0;
    this.queue.push(...[...column].reverse());
    this.wrapsUntilLanding = this.options.rows + 1;
    this.state = 'stopping';
    return new Promise((resolve) => {
      this.landed = resolve;
    });
  }

  /** Slam stop: land on the target at once. */
  slam(column?: readonly string[]): void {
    const target = column ?? this.target;
    if (target) this.show(target);
    this.finishLanding();
  }

  update(deltaMs: number): void {
    if (this.state === 'idle') return;
    const cell = this.options.cellSize;
    this.offset += this.speed * deltaMs;
    while (this.offset >= cell) {
      this.offset -= cell;
      this.wrap();
      if (this.state === 'stopping' && --this.wrapsUntilLanding === 0) {
        this.offset = 0; // snap; phase 6 adds a GSAP bounce here
        this.finishLanding();
        break;
      }
    }
    this.layoutSprites();
  }

  private wrap(): void {
    const sprite = this.sprites.pop();
    if (!sprite) return;
    sprite.texture = this.textureFor(this.queue.shift() ?? this.randomFiller());
    this.sprites.unshift(sprite);
  }

  private finishLanding(): void {
    this.state = 'idle';
    this.speed = 0;
    this.queue.length = 0;
    this.layoutSprites();
    const landed = this.landed;
    this.landed = null;
    landed?.();
  }

  private layoutSprites(): void {
    const { cellSize, symbolSize } = this.options;
    const inset = (cellSize - symbolSize) / 2;
    this.sprites.forEach((sprite, i) => {
      sprite.position.set(inset, this.offset + (i - 1) * cellSize + inset);
    });
  }

  private randomFiller(): string {
    const { fillers } = this.options;
    return fillers[Math.floor(this.random() * fillers.length)] ?? fillers[0] ?? '';
  }

  private textureFor(symbol: string): Texture {
    const texture = this.options.textures.get(symbol);
    if (!texture) throw new Error(`no texture for symbol "${symbol}"`);
    return texture;
  }
}
