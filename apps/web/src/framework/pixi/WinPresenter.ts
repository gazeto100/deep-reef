import type { Position, SpinOutcome } from '@deep-reef/contract/schemas';
import { Container, Graphics } from 'pixi.js';
import type { Hurry } from './Hurry';

/** Every cell that takes part in a win: line wins plus a paying scatter. */
export function winningPositions(spin: SpinOutcome): Position[] {
  return [
    ...spin.lineWins.flatMap((win) => win.positions),
    ...(spin.scatter && spin.scatter.win > 0 ? spin.scatter.positions : []),
  ];
}

const LINE_COLORS = [0xffd166, 0x06d6a0, 0xef476f, 0x4cc9f0, 0xf78c6b, 0xb5179e, 0x80ed99, 0xfee440];

export interface WinPresenterOptions {
  readonly cellSize: number;
  readonly reels: number;
  readonly rows: number;
  readonly paylines: readonly (readonly number[])[];
}

/**
 * Shows the wins of one spin over the reels: every winning payline as a line through the
 * cell centres, and a frame around each winning symbol (scatters included). A hurry press
 * skips the display.
 */
export class WinPresenter extends Container {
  private readonly options: WinPresenterOptions;
  private readonly lines = new Graphics();
  private readonly frames = new Graphics();

  constructor(options: WinPresenterOptions) {
    super();
    this.options = options;
    this.addChild(this.lines, this.frames);
  }

  /** Resolves after `durationMs`, or at once on a hurry press. Nothing is shown for a losing spin. */
  async show(spin: SpinOutcome, durationMs: number, hurry: Hurry): Promise<void> {
    const positions = winningPositions(spin);
    if (positions.length === 0) return;

    this.draw(spin, positions);
    await hurry.wait(durationMs);
    this.clear();
  }

  clear(): void {
    this.lines.clear();
    this.frames.clear();
  }

  private draw(spin: SpinOutcome, positions: readonly Position[]): void {
    const { cellSize, paylines } = this.options;
    const centre = (reel: number, row: number): [number, number] => [(reel + 0.5) * cellSize, (row + 0.5) * cellSize];

    const width = Math.max(4, cellSize * 0.05);
    const trace = (line: readonly number[]): void => {
      line.forEach((row, reel) => {
        const [x, y] = centre(reel, row);
        if (reel === 0) this.lines.moveTo(x, y);
        else this.lines.lineTo(x, y);
      });
    };
    spin.lineWins.forEach((win, i) => {
      const line = paylines[win.line];
      if (!line) return;
      // A dark outline under each coloured line keeps it readable over any symbol.
      trace(line);
      this.lines.stroke({ width: width + 6, color: 0x02101c, alpha: 0.85, join: 'round', cap: 'round' });
      trace(line);
      this.lines.stroke({ width, color: LINE_COLORS[i % LINE_COLORS.length] ?? 0xffffff, join: 'round', cap: 'round' });
    });

    const inset = cellSize * 0.04;
    const seen = new Set<string>();
    for (const { reel, row } of positions) {
      const key = `${reel}:${row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      this.frames.roundRect(
        reel * cellSize + inset,
        row * cellSize + inset,
        cellSize - 2 * inset,
        cellSize - 2 * inset,
        12,
      );
    }
    this.frames.stroke({ width: Math.max(4, cellSize * 0.06), color: 0xffe066, alpha: 1 });
  }
}
