/**
 * Declarative game definition. It is pure data, so it can be diffed, reviewed and
 * verified independently of the engine.
 *
 * Money convention: every amount is an integer number of credits. Line pays are
 * multiples of the line bet and scatter pays are multiples of the total bet.
 */
export interface GameDefinition<S extends string = string> {
  readonly id: string;
  readonly reelCount: number;
  readonly rowCount: number;
  /** Every symbol id used by the game, in a stable order. */
  readonly symbols: readonly S[];
  readonly wild: S;
  readonly scatter: S;
  /** Row index per reel for each payline, top row = 0. */
  readonly paylines: readonly (readonly number[])[];
  /** Symbol -> (count of a kind -> multiple of line bet). Missing entries pay nothing. */
  readonly linePays: Readonly<Partial<Record<S, PayByCount>>>;
  /** Scatter count anywhere -> multiple of total bet. */
  readonly scatterPays: PayByCount;
  readonly baseReels: readonly (readonly S[])[];
  readonly freeSpinReels: readonly (readonly S[])[];
  readonly freeSpins: FreeSpinRules;
  /** Hard cap on the total win of one round, as a multiple of total bet. */
  readonly maxWinMultiplier: number;
  /**
   * The RTP the game advertises to players (e.g. 0.956). verify checks it never exceeds
   * the exact upper bound for the capped RTP, so the published figure is always true.
   */
  readonly declaredRtp: number;
  /** Allowed total bets in credits. Each must be divisible by the payline count. */
  readonly betLevels: readonly number[];
  /** Design constraints checked by verify (not needed by the engine itself). */
  readonly constraints: GameConstraints<S>;
}

export type PayByCount = Readonly<Partial<Record<number, number>>>;

export interface FreeSpinRules {
  /** Minimum scatters anywhere to trigger (base game) or retrigger (free spins). */
  readonly triggerCount: number;
  readonly awarded: number;
  readonly retriggerAwarded: number;
  /** Upper bound on free spins awarded in one feature, including retriggers. */
  readonly maxTotal: number;
  /** Applied to every win during free spins, scatter pays included. */
  readonly winMultiplier: number;
}

export interface GameConstraints<S extends string = string> {
  /** 0-based reels that may contain the wild. */
  readonly wildReels: readonly number[];
  /** Symbols allowed to repeat next to each other on a strip (stacks). */
  readonly stackable: readonly S[];
  /** Longest allowed run of one stackable symbol. Other symbols never repeat. */
  readonly maxStack: number;
  /** Paying symbols from highest to lowest rank: for every count, a higher rank pays strictly more. */
  readonly payRank: readonly S[];
  /** Target RTP window, e.g. [0.95, 0.96]. */
  readonly targetRtp: readonly [number, number];
}

/** A cell on the grid: [reel, row]. */
export type Position = readonly [reel: number, row: number];

/** Visible symbols, column-major: grid[reel][row]. */
export type Grid<S extends string = string> = readonly (readonly S[])[];

export interface LineWin<S extends string = string> {
  readonly lineIndex: number;
  readonly symbol: S;
  readonly count: number;
  readonly positions: readonly Position[];
  /** Credits, multiplier included. */
  readonly win: number;
}

export interface ScatterWin {
  readonly count: number;
  readonly positions: readonly Position[];
  /** Credits, multiplier included. */
  readonly win: number;
  readonly freeSpinsAwarded: number;
}

export interface SpinResult<S extends string = string> {
  /** Index of the top visible symbol on each reel strip. */
  readonly stops: readonly number[];
  readonly grid: Grid<S>;
  readonly lineWins: readonly LineWin<S>[];
  readonly scatter: ScatterWin | null;
  readonly multiplier: number;
  /** Sum of line and scatter wins before the round cap. */
  readonly rawWin: number;
  /** Credits actually paid for this spin, after the round cap. */
  readonly win: number;
  /** True when the round cap cut this spin's win. */
  readonly capped: boolean;
}

export interface FreeSpinsResult<S extends string = string> {
  /** Total free spins awarded, including retriggers. */
  readonly awarded: number;
  readonly retriggers: number;
  readonly spins: readonly SpinResult<S>[];
  readonly totalWin: number;
}

/**
 * The complete outcome of one paid round, free spins included. It is computed in full
 * before anything is animated. The client only plays it back.
 */
export interface RoundResult<S extends string = string> {
  readonly totalBet: number;
  readonly base: SpinResult<S>;
  readonly freeSpins: FreeSpinsResult<S> | null;
  readonly totalWin: number;
  readonly maxWinReached: boolean;
}
