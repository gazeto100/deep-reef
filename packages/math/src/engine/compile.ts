import type { GameDefinition, PayByCount } from './types';

export class GameDefinitionError extends Error {
  override readonly name = 'GameDefinitionError';
}

/**
 * Index-based form of a GameDefinition used on hot paths: the round engine, the
 * exact full-cycle calculator and the simulator. Symbols are small integers, reels are
 * typed arrays and pays are flat lookup tables, so evaluating a line allocates nothing.
 */
export interface CompiledGame<S extends string = string> {
  readonly def: GameDefinition<S>;
  readonly reelCount: number;
  readonly rowCount: number;
  readonly symbolCount: number;
  /** Symbol index of the wild, or -1 to disable substitution (used by analysis). */
  readonly wild: number;
  readonly scatter: number;
  /** linePay[symbol * (reelCount + 1) + count] = multiple of line bet. */
  readonly linePay: Int32Array;
  /** scatterPay[count] = multiple of total bet. */
  readonly scatterPay: Int32Array;
  readonly paylines: readonly Uint8Array[];
  readonly baseReels: readonly Uint8Array[];
  readonly freeSpinReels: readonly Uint8Array[];
}

export function compileGame<S extends string>(def: GameDefinition<S>): CompiledGame<S> {
  const fail = (message: string): never => {
    throw new GameDefinitionError(`[${def.id}] ${message}`);
  };

  const { reelCount, rowCount } = def;
  if (!isPositiveInt(reelCount) || !isPositiveInt(rowCount)) {
    fail('reelCount and rowCount must be positive integers');
  }
  // A line win's count is packed into 4 bits (see evaluate.ts).
  if (reelCount > 15) fail('at most 15 reels are supported');

  const index = new Map<S, number>();
  def.symbols.forEach((symbol, i) => {
    if (index.has(symbol)) fail(`duplicate symbol "${symbol}"`);
    index.set(symbol, i);
  });
  if (index.size > 255) fail('at most 255 symbols are supported');

  const indexOf = (symbol: S, where: string): number => {
    const i = index.get(symbol);
    return i === undefined ? fail(`unknown symbol "${symbol}" in ${where}`) : i;
  };

  const wild = indexOf(def.wild, 'wild');
  const scatter = indexOf(def.scatter, 'scatter');
  if (wild === scatter) fail('wild and scatter must be different symbols');

  const linePay = new Int32Array(def.symbols.length * (reelCount + 1));
  for (const symbol of def.symbols) {
    const pays = def.linePays[symbol];
    if (pays === undefined) continue;
    if (symbol === def.scatter) fail('scatter cannot have line pays');
    fillPays(pays, reelCount, `linePays.${symbol}`, fail, (count, value) => {
      linePay[indexOf(symbol, 'linePays') * (reelCount + 1) + count] = value;
    });
  }

  const maxScatters = reelCount * rowCount;
  const scatterPay = new Int32Array(maxScatters + 1);
  fillPays(def.scatterPays, maxScatters, 'scatterPays', fail, (count, value) => {
    scatterPay[count] = value;
  });

  if (def.paylines.length === 0) fail('at least one payline is required');
  const paylines = def.paylines.map((line, li) => {
    if (line.length !== reelCount) fail(`payline ${li} must have ${reelCount} entries`);
    if (line.some((row) => !Number.isInteger(row) || row < 0 || row >= rowCount)) {
      fail(`payline ${li} has a row outside 0..${rowCount - 1}`);
    }
    return Uint8Array.from(line);
  });

  const compileReels = (reels: readonly (readonly S[])[], name: string): Uint8Array[] => {
    if (reels.length !== reelCount) fail(`${name} must have ${reelCount} reels`);
    return reels.map((strip, r) => {
      if (strip.length < rowCount) fail(`${name}[${r}] is shorter than the visible window`);
      return Uint8Array.from(strip, (symbol) => indexOf(symbol, `${name}[${r}]`));
    });
  };

  const { freeSpins, maxWinMultiplier, betLevels } = def;
  if (
    !isPositiveInt(freeSpins.triggerCount) ||
    !isPositiveInt(freeSpins.awarded) ||
    !isNonNegativeInt(freeSpins.retriggerAwarded) ||
    !isPositiveInt(freeSpins.winMultiplier) ||
    !Number.isInteger(freeSpins.maxTotal) ||
    freeSpins.maxTotal < freeSpins.awarded
  ) {
    fail('invalid freeSpins rules');
  }
  if (!isPositiveInt(maxWinMultiplier)) fail('maxWinMultiplier must be a positive integer');
  if (betLevels.length === 0) fail('at least one bet level is required');
  for (const bet of betLevels) {
    if (!isPositiveInt(bet) || bet % def.paylines.length !== 0) {
      fail(`bet level ${bet} must be a positive multiple of the payline count`);
    }
  }

  return {
    def,
    reelCount,
    rowCount,
    symbolCount: def.symbols.length,
    wild,
    scatter,
    linePay,
    scatterPay,
    paylines,
    baseReels: compileReels(def.baseReels, 'baseReels'),
    freeSpinReels: compileReels(def.freeSpinReels, 'freeSpinReels'),
  };
}

function fillPays(
  pays: PayByCount,
  maxCount: number,
  where: string,
  fail: (message: string) => never,
  set: (count: number, value: number) => void,
): void {
  for (const [key, value] of Object.entries(pays)) {
    const count = Number(key);
    if (!Number.isInteger(count) || count < 1 || count > maxCount) fail(`${where}: invalid count ${key}`);
    if (value === undefined || !isNonNegativeInt(value)) fail(`${where}[${key}] must be a non-negative integer`);
    set(count, value ?? 0);
  }
}

function isPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

function isNonNegativeInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}
