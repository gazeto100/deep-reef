import { analyzeRound, type ReelSetAnalysis } from '../src/math/analysis/exact';
import { DEEP_REEF } from '../src/math/config/deepReef';
import { compileGame } from '../src/math/engine/compile';
import { formatNumber, markdownTable, oneIn, pct } from './lib/markdown';

/** Prints the exact (full-cycle) math report for Deep Reef as Markdown. */

const started = performance.now();
const game = compileGame(DEEP_REEF);
const a = analyzeRound(game);
const { winMultiplier } = DEEP_REEF.freeSpins;

const out: string[] = [];
const section = (title: string, body: string): void => {
  out.push(`### ${title}\n\n${body}\n`);
};

section(
  'Summary (exact, full cycle)',
  markdownTable(
    ['Metric', 'Value', 'How it is obtained'],
    [
      ['Base game: line wins', pct(a.base.rtpLines, 3), `exact, ${a.base.combinations.toLocaleString('en-US')} stop combinations`],
      ['Base game: scatter pays', pct(a.base.rtpScatter, 3), 'exact'],
      ['Free spins (uncapped)', pct(a.rtpFeatureUncapped, 3), 'exact: P(trigger) x E[spins] x E[FS spin win] (Wald)'],
      ['**RTP without cap**', `**${pct(a.rtpUncapped, 3)}**`, 'exact'],
      [`Cap loss (${a.maxWinMultiplier}x), lower bound`, pct(a.capLossLowerBound, 4), 'exact: E[free spins] x E[(single spin - cap)+] (Wald)'],
      ['**RTP with cap, upper bound**', `**≤ ${pct(a.rtpCappedUpperBound, 3)}**`, 'exact bound; the simulator estimates the rest of the cap loss'],
      ['A single spin reaches the cap', oneIn(a.singleSpinCapProbabilityPerRound), 'exact, per round'],
      ['Hit rate', pct(a.hitRate, 2), 'exact (every trigger also pays scatters)'],
      ['Free spins trigger', oneIn(a.triggerProbability), 'exact'],
      ['Retrigger per free spin', oneIn(a.freeSpins.triggerProbability), 'exact'],
      ['Free spins per feature', a.expectedFreeSpinsPerFeature.toFixed(3), 'exact (Markov chain incl. 50-spin limit)'],
      ['Average feature win', `${a.featureMeanUncapped.toFixed(2)}x bet`, 'exact, uncapped'],
      ['Base game SD per spin', `${Math.sqrt(a.base.winVariance).toFixed(3)}x bet`, 'exact, base spins only'],
      ['Max base spin', `${a.baseMaxWin.toFixed(1)}x bet`, `exact; < ${a.maxWinMultiplier}x, so the cap never binds in base`],
      ['Max single free spin', `${a.freeSpinMaxWin.toFixed(1)}x bet`, 'exact, x2 included'],
      ['Cap effect beyond the bound', 'not computed', 'rounds where several spins add up past the cap -> simulator'],
      ['Overall volatility (SD)', 'not computed', 'feature variance with retriggers -> simulator'],
    ],
  ),
);

const paytable = (set: ReelSetAnalysis, multiplier: number, rtpLabel: string): string =>
  markdownTable(
    ['Symbol', 'Count', 'Pay (x line bet)', 'P per line', 'Per spin (20 lines)', rtpLabel],
    set.lineStats.map((s) => [
      s.symbol,
      s.count,
      s.pay * multiplier,
      oneIn(s.probabilityPerLine),
      oneIn(s.hitsPerSpin),
      pct(s.rtp * multiplier, 3),
    ]),
  );

section('Base game line pays', paytable(a.base, 1, 'RTP'));
section(`Free spins line pays (x${winMultiplier} included)`, paytable(a.freeSpins, winMultiplier, 'Win per free spin (x bet)'));

section(
  'Scatter pays (x total bet, anywhere)',
  markdownTable(
    ['Scatters', 'Pay', 'Base: probability', 'Base: RTP', 'FS: probability', `FS: win per spin (x${winMultiplier}, x bet)`],
    a.base.scatterStats.map((s) => {
      const fs = a.freeSpins.scatterStats.find((f) => f.count === s.count);
      return [s.count, s.pay, oneIn(s.probability), pct(s.rtp, 3), oneIn(fs?.probability ?? 0), pct((fs?.rtp ?? 0) * winMultiplier, 3)];
    }),
  ),
);

const composition = (reels: readonly (readonly string[])[]): string =>
  markdownTable(
    ['Symbol', ...reels.map((_, i) => `Reel ${i + 1}`)],
    [
      ...DEEP_REEF.symbols.map((symbol) => [symbol, ...reels.map((strip) => strip.filter((x) => x === symbol).length)]),
      ['**Length**', ...reels.map((strip) => strip.length)],
    ],
  );

section('Base reel composition', composition(DEEP_REEF.baseReels));
section('Free-spin reel composition', composition(DEEP_REEF.freeSpinReels));

console.log(out.join('\n'));
console.error(`(${formatNumber((performance.now() - started) / 1000)} s)`);
