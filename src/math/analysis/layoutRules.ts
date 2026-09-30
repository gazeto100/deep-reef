/**
 * Reel strip layout rules, shared by the strip generator (tuning) and verify so the
 * two can never disagree:
 * - a symbol may repeat next to itself only if it is stackable, and then at most
 *   `maxStack` in a row (strips are circular);
 * - scatters are at least `rowCount` apart, so a window never shows two from one reel.
 */
export interface LayoutRules<T> {
  readonly scatter: T;
  readonly rowCount: number;
  readonly stackable: readonly T[];
  readonly maxStack: number;
}

/** Returns human-readable violations; an empty array means the strip is valid. */
export function findLayoutViolations<T>(strip: readonly T[], rules: LayoutRules<T>): string[] {
  const n = strip.length;
  const violations: string[] = [];
  if (n === 0) return ['empty strip'];

  // Start the circular scan at a run boundary so no run is split in two.
  let start = 0;
  while (start < n && strip[start] === strip[(start - 1 + n) % n]) start++;
  if (start === n) return [`strip is a single symbol ${String(strip[0])}`];

  let i = 0;
  while (i < n) {
    const pos = (start + i) % n;
    const symbol = strip[pos] as T;
    let run = 1;
    while (i + run < n && strip[(start + i + run) % n] === symbol) run++;
    const limit = rules.stackable.includes(symbol) ? rules.maxStack : 1;
    if (run > limit) violations.push(`${String(symbol)} x${run} at ${pos} (max ${limit})`);
    i += run;
  }

  for (let p = 0; p < n; p++) {
    if (strip[p] !== rules.scatter) continue;
    for (let d = 1; d < rules.rowCount; d++) {
      if (strip[(p + d) % n] === rules.scatter) violations.push(`scatters at ${p} and ${(p + d) % n} share a window`);
    }
  }
  return violations;
}
