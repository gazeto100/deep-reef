import { compileGame, type CompiledGame } from '../engine/compile';
import { SlotEngine } from '../engine/SlotEngine';
import type { GameDefinition } from '../engine/types';
import { Xoshiro128 } from '../rng/Xoshiro128';
import { analyzeRound, type RoundAnalysis } from './exact';
import { findLayoutViolations } from './layoutRules';

export interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * Structural and mathematical invariants of a game definition. It is meant to run in
 * CI: any failed check means the math is not releasable.
 */
export function verifyGame<S extends string>(
  def: GameDefinition<S>,
  analysis?: RoundAnalysis,
): { checks: CheckResult[]; analysis: RoundAnalysis } {
  const game = compileGame(def); // throws on structural errors
  const a = analysis ?? analyzeRound(game);
  const checks: CheckResult[] = [];
  const check = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };

  // Structure
  const lineKeys = def.paylines.map((l) => l.join(','));
  const duplicates = lineKeys.filter((k, i) => lineKeys.indexOf(k) !== i);
  check('paylines are unique', duplicates.length === 0, duplicates.length ? `duplicates: ${duplicates.join(' | ')}` : `${lineKeys.length} lines`);

  for (const [name, reels] of reelSets(game)) {
    const bad = wildOutsideAllowedReels(game, reels, def.constraints.wildReels);
    check(`${name}: wild only on reels ${def.constraints.wildReels.map((r) => r + 1).join(',')}`, bad.length === 0, bad.length ? `found on reels ${bad.map((r) => r + 1).join(',')}` : 'ok');

    const stacked = scatterStacks(game, reels);
    check(`${name}: at most one scatter per reel window`, stacked.length === 0, stacked.length ? stacked.join('; ') : 'ok');

    const layout = (name === 'base reels' ? def.baseReels : def.freeSpinReels).flatMap((strip, r) =>
      findLayoutViolations(strip, {
        scatter: def.scatter,
        rowCount: def.rowCount,
        stackable: def.constraints.stackable,
        maxStack: def.constraints.maxStack,
      }).map((v) => `reel ${r + 1}: ${v}`),
    );
    const stackRule = def.constraints.stackable.length
      ? `stacks only for ${def.constraints.stackable.join('/')}, max ${def.constraints.maxStack}`
      : 'no stacks';
    check(`${name}: layout rules (${stackRule})`, layout.length === 0, layout.length ? layout.slice(0, 5).join('; ') : 'ok');

    const missing = def.symbols.filter((_, i) => !reels.some((strip) => strip.includes(i)));
    check(`${name}: every symbol appears on the reels`, missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : 'ok');
  }

  // Pays
  const notMonotonic: string[] = [];
  for (const symbol of def.symbols) {
    const pays = def.linePays[symbol];
    if (!pays) continue;
    const values = Object.entries(pays).sort(([x], [y]) => Number(x) - Number(y)).map(([, v]) => v ?? 0);
    if (values.some((v, i) => i > 0 && v <= (values[i - 1] ?? 0))) notMonotonic.push(symbol);
  }
  check('line pays increase with count', notMonotonic.length === 0, notMonotonic.length ? notMonotonic.join(', ') : 'ok');

  const unreachable = a.base.lineStats.filter((s) => s.probabilityPerLine === 0).map((s) => `${s.symbol}x${s.count}`);
  check('every line pay is reachable in the base game', unreachable.length === 0, unreachable.length ? unreachable.join(', ') : `${a.base.lineStats.length} line pays`);

  const unreachableFs = a.freeSpins.lineStats.filter((s) => s.probabilityPerLine === 0).map((s) => `${s.symbol}x${s.count}`);
  check('every line pay is reachable in free spins', unreachableFs.length === 0, unreachableFs.length ? unreachableFs.join(', ') : 'ok');

  const scatterUnreachable = a.base.scatterStats.filter((s) => s.probability === 0).map((s) => `${s.count} scatters`);
  check('every scatter pay is reachable', scatterUnreachable.length === 0, scatterUnreachable.length ? scatterUnreachable.join(', ') : a.base.scatterStats.map((s) => s.count).join('/'));

  // Contribution
  const rtpBySymbol = new Map<string, number>();
  for (const s of a.base.lineStats) rtpBySymbol.set(s.symbol, (rtpBySymbol.get(s.symbol) ?? 0) + s.rtp);
  const deadSymbols = [...rtpBySymbol].filter(([, rtp]) => rtp <= 0).map(([s]) => s);
  check('every paying symbol contributes to base RTP', deadSymbols.length === 0, deadSymbols.length ? deadSymbols.join(', ') : `${rtpBySymbol.size} symbols`);
  check('wild contributes (wins using a substitution)', a.base.rtpLinesWithWild > 0, pct(a.base.rtpLinesWithWild));
  check('scatter contributes (pays and triggers)', a.base.rtpScatter > 0 && a.triggerProbability > 0, `${pct(a.base.rtpScatter)}, trigger 1 in ${(1 / a.triggerProbability).toFixed(1)}`);

  const trigger = def.freeSpins.triggerCount;
  const maxScatters = def.reelCount * def.rowCount;
  const silentTriggers: number[] = [];
  for (let n = trigger; n <= maxScatters; n++) {
    if ((a.base.scatterCountProbability[n] ?? 0) > 0 && (game.scatterPay[n] ?? 0) === 0) silentTriggers.push(n);
  }
  check('every reachable trigger also pays (round hit rate = base hit rate)', silentTriggers.length === 0, silentTriggers.length ? `no pay for ${silentTriggers.join(', ')} scatters` : 'ok');

  // Cap and RTP
  check(
    'max win cap cannot bind in the base game',
    a.baseMaxWin < def.maxWinMultiplier,
    `max base spin ${a.baseMaxWin.toFixed(1)}x < cap ${def.maxWinMultiplier}x`,
  );
  const [lo, hi] = def.constraints.targetRtp;
  check(
    `exact uncapped RTP within target ${pct(lo)}-${pct(hi)}`,
    a.rtpUncapped >= lo && a.rtpUncapped <= hi,
    `${pct(a.rtpUncapped, 3)} (upper bound; the cap only lowers it)`,
  );

  // Determinism
  const engine = new SlotEngine(def);
  const bet = def.betLevels[0] ?? 0;
  const run = (): string => {
    const rng = new Xoshiro128(20240601);
    return JSON.stringify(Array.from({ length: 500 }, () => engine.playRound(bet, rng)));
  };
  check('rounds are reproducible from a seed', run() === run(), '500 rounds, seed 20240601');

  return { checks, analysis: a };
}

function reelSets(game: CompiledGame): [string, readonly Uint8Array[]][] {
  return [
    ['base reels', game.baseReels],
    ['free-spin reels', game.freeSpinReels],
  ];
}

function wildOutsideAllowedReels(game: CompiledGame, reels: readonly Uint8Array[], allowed: readonly number[]): number[] {
  return reels.flatMap((strip, r) => (!allowed.includes(r) && strip.includes(game.wild) ? [r] : []));
}

function scatterStacks(game: CompiledGame, reels: readonly Uint8Array[]): string[] {
  const problems: string[] = [];
  reels.forEach((strip, r) => {
    for (let stop = 0; stop < strip.length; stop++) {
      let n = 0;
      for (let row = 0; row < game.rowCount; row++) {
        if (strip[(stop + row) % strip.length] === game.scatter) n++;
      }
      if (n > 1) problems.push(`reel ${r + 1} stop ${stop}`);
    }
  });
  return problems;
}

function pct(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)}%`;
}
