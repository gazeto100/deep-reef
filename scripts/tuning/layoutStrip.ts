import { Xoshiro128 } from '../../src/math/rng/Xoshiro128';

export type SymbolCounts<S extends string> = Readonly<Partial<Record<S, number>>>;

/**
 * Turns symbol counts into a concrete reel strip. The layout is a seeded shuffle,
 * repeated until the strip meets the layout rules, so the result is reproducible.
 *
 * Layout rules:
 * - No two identical symbols next to each other (circular), so no stacks.
 * - Scatters are at least `rowCount` apart (circular), so a window never shows two
 *   scatters from the same reel.
 */
export function layoutStrip<S extends string>(
  counts: SymbolCounts<S>,
  options: { readonly scatter: S; readonly rowCount: number; readonly seed: number },
): S[] {
  const strip: S[] = [];
  for (const [symbol, count] of Object.entries(counts) as [S, number | undefined][]) {
    for (let i = 0; i < (count ?? 0); i++) strip.push(symbol);
  }

  const rng = new Xoshiro128(options.seed);
  for (let attempt = 0; attempt < 100_000; attempt++) {
    shuffle(strip, rng);
    if (isValidLayout(strip, options.scatter, options.rowCount)) return strip;
  }
  throw new Error(`could not lay out strip ${JSON.stringify(counts)}`);
}

export function isValidLayout<S extends string>(strip: readonly S[], scatter: S, rowCount: number): boolean {
  const n = strip.length;
  for (let i = 0; i < n; i++) {
    const symbol = strip[i];
    if (symbol === strip[(i + 1) % n]) return false;
    if (symbol === scatter) {
      for (let d = 1; d < rowCount; d++) {
        if (strip[(i + d) % n] === scatter) return false;
      }
    }
  }
  return true;
}

function shuffle<T>(items: T[], rng: Xoshiro128): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
}
