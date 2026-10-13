import { mkdirSync, writeFileSync } from 'node:fs';
import { analyzeRound, type RoundAnalysis } from '../src/math/analysis/exact';
import { simulate, type SimulationResult } from '../src/math/analysis/simulator';
import { DEEP_REEF } from '../src/math/config/deepReef';
import { compileGame } from '../src/math/engine/compile';
import { markdownTable, oneIn, pct } from './lib/markdown';

/**
 * Usage: npm run math:sim -- [--rounds 10000000] [--seeds 20240601,777] [--bet 20] [--doc]
 * --doc also writes the report to docs/math-simulation.md.
 * Raw results are saved as JSON in sim-output/ (git-ignored).
 */

const Z95 = 1.96;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const rounds = Number(arg('rounds', '10000000'));
const seeds = arg('seeds', '20240601,777').split(',').map(Number);
const bet = Number(arg('bet', '20'));

const log = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

log('exact analysis...');
const exact = analyzeRound(compileGame(DEEP_REEF));

const results: SimulationResult[] = seeds.map((seed) => {
  log(`simulating ${rounds.toLocaleString('en-US')} rounds, seed ${seed}...`);
  const result = simulate(DEEP_REEF, {
    rounds,
    seed,
    totalBet: bet,
    onProgress: (done) => log(`  ${(done / 1e6).toFixed(0)}M`),
  });
  mkdirSync('sim-output', { recursive: true });
  writeFileSync(`sim-output/sim-seed-${seed}.json`, JSON.stringify(result, null, 2));
  log(`  done in ${result.seconds.toFixed(0)} s`);
  return result;
});

// ---------- report ----------

const out: string[] = [];
const section = (title: string, body: string): void => {
  out.push(`### ${title}\n\n${body}\n`);
};
const seedHeaders = results.map((r) => `Seed ${r.seed}`);

interface Comparison {
  readonly name: string;
  readonly exact: number;
  readonly format: (x: number) => string;
  /** Simulated value and its standard error for one run. */
  readonly sim: (r: SimulationResult) => readonly [value: number, se: number];
}

const proportion = (p: number, n: number): number => Math.sqrt((p * (1 - p)) / n);

const comparisons: Comparison[] = [
  {
    name: 'RTP (capped; exact = upper bound)',
    exact: exact.rtpCappedUpperBound,
    format: (x) => pct(x, 3),
    sim: (r) => [r.roundWin.mean, r.roundWin.seMean],
  },
  {
    name: 'Base game RTP',
    exact: exact.rtpBase,
    format: (x) => pct(x, 3),
    sim: (r) => [r.baseWin.mean, r.baseWin.seMean],
  },
  {
    name: 'Free spins RTP (capped; exact = upper bound)',
    exact: exact.rtpFeatureUncapped - exact.capLossLowerBound,
    format: (x) => pct(x, 3),
    sim: (r) => [r.featureWinPerRound.mean, r.featureWinPerRound.seMean],
  },
  {
    name: 'Hit rate',
    exact: exact.hitRate,
    format: (x) => pct(x, 3),
    sim: (r) => [r.hitRate, proportion(exact.hitRate, r.rounds)],
  },
  {
    name: 'FS trigger probability',
    exact: exact.triggerProbability,
    format: (x) => `${pct(x, 4)} (${oneIn(x)})`,
    sim: (r) => [r.triggerRate, proportion(exact.triggerProbability, r.rounds)],
  },
  {
    name: 'Retrigger per free spin',
    exact: exact.freeSpins.triggerProbability,
    format: (x) => pct(x, 3),
    sim: (r) => [r.retriggerRate, proportion(exact.freeSpins.triggerProbability, r.featureSpins.mean * r.features)],
  },
  {
    name: 'Free spins per feature',
    exact: exact.expectedFreeSpinsPerFeature,
    format: (x) => x.toFixed(3),
    sim: (r) => [r.featureSpins.mean, r.featureSpins.seMean],
  },
  {
    name: 'Single free spin win (x bet)',
    exact: exact.freeSpins.meanWin * DEEP_REEF.freeSpins.winMultiplier,
    format: (x) => x.toFixed(4),
    sim: (r) => [r.freeSpinWin.mean, r.freeSpinWin.seMean],
  },
  {
    name: 'Feature win (x bet)',
    exact: exact.featureMeanUncapped,
    format: (x) => x.toFixed(2),
    sim: (r) => [r.featureWin.mean, r.featureWin.seMean],
  },
];

section(
  'Simulation vs exact (95% confidence interval = ±1.96 SE)',
  markdownTable(
    ['Metric', 'Exact', ...seedHeaders.flatMap((h) => [h, 'z', '95% CI'])],
    comparisons.map((c) => [
      c.name,
      c.format(c.exact),
      ...results.flatMap((r) => {
        const [value, se] = c.sim(r);
        const z = se > 0 ? (value - c.exact) / se : 0;
        return [
          `${c.format(value)} ± ${c.format(Z95 * se)}`,
          z.toFixed(2),
          Math.abs(z) <= Z95 ? 'inside' : '**outside**',
        ];
      }),
    ]),
  ) +
    `\n\nz = (sim − exact) / SE. Each comparison has a 5% chance of landing outside by luck alone. The FS metrics are correlated (more retriggers mean more spins and a bigger feature win), so they tend to drift together.

**Heavy tail caveat.** The exact capped RTP is bounded above by ${pct(exact.rtpCappedUpperBound, 3)} (uncapped ${pct(exact.rtpUncapped, 3)} minus the exact lower bound on the cap loss, ${pct(exact.capLossLowerBound, 3)}). A noticeable part of the RTP sits in free spins that are rarer than 1 in a million rounds (see the tail table), so ${rounds.toLocaleString('en-US')} rounds sample them only a handful of times. The sample SD then underestimates the true SD, and RTP/feature estimates are more often slightly low than slightly high. The tail table below is the sharper test of the engine: it compares event counts with exact probabilities.`,
);

section(
  'Tail events: simulated free spins vs exact probability',
  markdownTable(
    [
      'Single free spin win',
      'Exact P per spin',
      ...seedHeaders.flatMap((h) => [`${h}: observed`, 'expected', 'z (Poisson)']),
    ],
    exact.freeSpins.tail.map((t, k) => [
      `>= ${t.threshold}x`,
      oneIn(t.probability),
      ...results.flatMap((r) => {
        const observed = r.freeSpinTail[k]?.count ?? 0;
        const expected = r.freeSpinWin.n * t.probability;
        const z = expected > 0 ? (observed - expected) / Math.sqrt(expected) : 0;
        return [String(observed), expected.toFixed(1), z.toFixed(2)];
      }),
    ]),
  ),
);

const volatilityClass = (sd: number): string => (sd < 5 ? 'low' : sd <= 15 ? 'medium' : 'high');
section(
  'Volatility (SD of round win, x bet)',
  markdownTable(
    ['', ...seedHeaders],
    [
      ['SD ± 95% CI', ...results.map((r) => `${r.roundWin.sd.toFixed(3)} ± ${(Z95 * r.roundWin.seSd).toFixed(3)}`)],
      ['Class (<5 low, 5-15 medium, >15 high)', ...results.map((r) => volatilityClass(r.roundWin.sd))],
      [
        `Base game only (exact ${Math.sqrt(exact.base.winVariance).toFixed(3)})`,
        ...results.map((r) => r.baseWin.sd.toFixed(3)),
      ],
    ],
  ) +
    '\n\nThe SD confidence interval uses the delta method with the 4th central moment. With heavy-tailed wins it is optimistic, which is why two seeds are compared.',
);

const theoreticalMax = exact.baseMaxWin + DEEP_REEF.freeSpins.maxTotal * exact.freeSpinMaxWin;
const cap = DEEP_REEF.maxWinMultiplier;
section(
  `Max win and the ${cap}x cap`,
  markdownTable(
    ['', ...seedHeaders],
    [
      [
        'Largest round (x bet)',
        ...results.map(
          (r) =>
            `${r.maxRound.win.toFixed(1)}x (round #${r.maxRound.roundIndex.toLocaleString('en-US')}, ${r.maxRound.freeSpins} FS)`,
        ),
      ],
      ['Largest feature (x bet)', ...results.map((r) => `${r.featureWin.max.toFixed(1)}x`)],
      ['Rounds that hit the cap', ...results.map((r) => String(r.capHits))],
      ['RTP removed by the cap', ...results.map((r) => pct(r.capLost, 4))],
      ...results[0]!.roundsAtLeast.map((t, k) => [
        `Rounds >= ${t.threshold}x`,
        ...results.map((r) => {
          const count = r.roundsAtLeast[k]?.count ?? 0;
          return `${count} (${oneIn(count / r.rounds)})`;
        }),
      ]),
    ],
  ) +
    `\n\nUpper bound on an uncapped round: max base spin ${exact.baseMaxWin.toFixed(1)}x + ${DEEP_REEF.freeSpins.maxTotal} free spins × ${exact.freeSpinMaxWin.toFixed(1)}x = ${theoreticalMax.toFixed(0)}x. The cap is therefore reachable in principle.`,
);

section(
  'What-if caps (from the simulated rounds)',
  markdownTable(
    ['Cap', ...seedHeaders.flatMap((h) => [`${h}: rounds reaching it`, 'frequency', 'RTP removed'])],
    results[0]!.capScenarios.map((s, k) => [
      `${s.cap}x${s.cap === cap ? ' (current)' : ''}`,
      ...results.flatMap((r) => {
        const x = r.capScenarios[k] ?? { rounds: 0, rtpLoss: 0 };
        return [String(x.rounds), oneIn(x.rounds / r.rounds), pct(x.rtpLoss, 4)];
      }),
    ]),
  ) +
    `\n\nRTP removed = E[(W - cap)+]. It is exact for these rounds only for caps at or below the largest simulated round, and only as long as the configured ${cap}x cap never bound (rounds reaching it: ${results.map((r) => r.capHits).join(' / ')}).`,
);

section(
  'Round win distribution',
  markdownTable(
    ['Bucket', ...seedHeaders.flatMap((h) => [`${h}: share`, 'frequency', 'RTP'])],
    results[0]!.buckets.map((b, k) => [
      b.label,
      ...results.flatMap((r) => {
        const bucket = r.buckets[k] ?? { count: 0, rtp: 0 };
        return [pct(bucket.count / r.rounds, 3), oneIn(bucket.count / r.rounds), pct(bucket.rtp, 2)];
      }),
    ]),
  ),
);

section(
  'Free spins feature win (x bet, per feature)',
  markdownTable(
    ['', ...seedHeaders],
    [
      ['Features', ...results.map((r) => r.features.toLocaleString('en-US'))],
      ['Mean', ...results.map((r) => r.featureWin.mean.toFixed(2))],
      ['Median', ...results.map((r) => r.featureWin.median.toFixed(2))],
      ['90th percentile', ...results.map((r) => r.featureWin.p90.toFixed(2))],
      ['99th percentile', ...results.map((r) => r.featureWin.p99.toFixed(2))],
      ['Max', ...results.map((r) => r.featureWin.max.toFixed(2))],
      ['SD', ...results.map((r) => r.featureWin.sd.toFixed(2))],
    ],
  ) + '\n\nMedian < mean: most features pay modestly and a few large ones carry the average (right-skewed).',
);

section('RTP contribution by source', contributionTable(exact, results));

function contributionTable(a: RoundAnalysis, runs: readonly SimulationResult[]): string {
  const fsWeight = a.triggerProbability * a.expectedFreeSpinsPerFeature * DEEP_REEF.freeSpins.winMultiplier;
  const exactLine = (set: RoundAnalysis['base'], symbol: string): number =>
    set.lineStats.filter((s) => s.symbol === symbol).reduce((sum, s) => sum + s.rtp, 0);

  const rows: (string | number)[][] = [];
  const add = (label: string, exactTotal: number, pick: (r: SimulationResult) => number): void => {
    rows.push([
      label,
      pct(exactTotal, 3),
      ...runs.map((r) => pct(pick(r), 3)),
      pick(runs[0]!) > 0 || label.includes('cap') ? 'yes' : '**NO**',
    ]);
  };
  const sim = (r: SimulationResult, kind: string, source: string): number =>
    r.contributions
      .filter((c) => c.kind === kind && c.source === source)
      .reduce((sum, c) => sum + c.base + c.freeSpins, 0);

  for (const symbol of DEEP_REEF.symbols) {
    if (symbol === DEEP_REEF.wild || symbol === DEEP_REEF.scatter) continue;
    add(symbol, exactLine(a.base, symbol) + fsWeight * exactLine(a.freeSpins, symbol), (r) => sim(r, 'line', symbol));
  }
  add(`${DEEP_REEF.scatter} (pays)`, a.base.rtpScatter + fsWeight * a.freeSpins.rtpScatter, (r) =>
    sim(r, 'scatter', DEEP_REEF.scatter),
  );
  add(
    `${DEEP_REEF.wild} (line wins that used a wild; overlaps the symbols above)`,
    a.base.rtpLinesWithWild + fsWeight * a.freeSpins.rtpLinesWithWild,
    (r) => sim(r, 'wild-assisted', DEEP_REEF.wild),
  );
  add('max win cap (negative)', 0, (r) => sim(r, 'cap', 'max win cap'));

  return (
    markdownTable(['Source', 'Exact (uncapped)', ...seedHeaders, '> 0'], rows) +
    "\n\nFree-spin wins are included, weighted by trigger probability × expected spins × 2. The exact FS part per symbol uses Wald's identity."
  );
}

const report = out.join('\n');
console.log(report);

if (process.argv.includes('--doc')) {
  const header = `# Deep Reef: simulation results

Generated by \`npm run math:sim -- --rounds ${rounds} --seeds ${seeds.join(',')} --doc\`
(total bet ${bet} credits; every figure is a multiple of total bet). The simulator plays
complete rounds through \`SlotEngine.playRound\`, the same code the server uses, and
compares them with the exact calculator ([math-report.md](math-report.md)).

`;
  writeFileSync('docs/math-simulation.md', `${header}${report}\n`);
  log('wrote docs/math-simulation.md');
}
