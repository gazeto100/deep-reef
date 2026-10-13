import { findLayoutViolations, type LayoutRules } from '../../src/math/analysis/layoutRules';
import { Xoshiro128 } from '../../src/math/rng/Xoshiro128';

export type SymbolCounts<S extends string> = Readonly<Partial<Record<S, number>>>;

/** Stack heights per symbol, e.g. { SHARK: [3, 2] } = one stack of 3 and one of 2. */
export type StackSpec<S extends string> = Readonly<Partial<Record<S, readonly number[]>>>;

/**
 * Turns symbol counts (plus optional stacks) into a concrete reel strip. It does a
 * seeded shuffle of singles and whole stacks, repeated until the strip passes the
 * shared layout rules (src/math/analysis/layoutRules.ts). The result is reproducible.
 */
export function layoutStrip<S extends string>(
  counts: SymbolCounts<S>,
  options: LayoutRules<S> & { readonly seed: number; readonly stacks?: StackSpec<S> },
): S[] {
  const blocks: S[][] = [];
  for (const [symbol, count] of Object.entries(counts) as [S, number | undefined][]) {
    for (let i = 0; i < (count ?? 0); i++) blocks.push([symbol]);
  }
  for (const [symbol, heights] of Object.entries(options.stacks ?? {}) as [S, readonly number[] | undefined][]) {
    for (const h of heights ?? []) blocks.push(new Array<S>(h).fill(symbol));
  }

  const rng = new Xoshiro128(options.seed);
  for (let attempt = 0; attempt < 200_000; attempt++) {
    shuffle(blocks, rng);
    const strip = blocks.flat();
    if (findLayoutViolations(strip, options).length === 0) return strip;
  }
  throw new Error(
    `could not lay out strip ${JSON.stringify(counts)} with stacks ${JSON.stringify(options.stacks ?? {})}`,
  );
}

function shuffle<T>(items: T[], rng: Xoshiro128): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
}
