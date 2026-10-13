# Deep Reef: math tuning log

The pays and reel strips were tuned with the **exact full-cycle calculator**
(`packages/math/src/analysis/exact.ts`), not with the simulator. Each iteration is saved in
`packages/math/scripts/tuning/candidates.ts` and can be re-run:

```bash
npm run math:tune              # all iterations
npm run math:tune -- v8 --detail
```

Strips are generated from symbol counts by a seeded shuffle that enforces the layout
rules: no identical neighbours, and scatters at least 3 apart. The chosen candidate is then
**frozen as literal data** in `packages/math/src/config/deepReef.ts` with `--write`.

## Phase 1: base targets (v1–v8)

| Metric     | Target                                      |
| ---------- | ------------------------------------------- |
| RTP        | 95–96%                                      |
| Hit rate   | ~40%                                        |
| Volatility | medium                                      |
| Free spins | roughly 1 in 150, carrying about 30% of RTP |

All figures are exact. "FS" is the free-spin contribution **without** the cap.

| #   | Change                                                                                                                | Base lines | Base scatter | FS     | **RTP**     | Hit rate | FS 1 in |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---------- | ------------ | ------ | ----------- | -------- | ------- |
| v1  | Starting point: typical 20-line paytable, 32-symbol reels, 1 scatter per reel, 2 wilds on reels 2–4 (base) and 4 (FS) | 28.93%     | 1.74%        | 9.39%  | **40.06%**  | 38.82%   | 140     |
| v2  | All line pays ×2                                                                                                      | 57.86%     | 1.74%        | 18.52% | **78.12%**  | 38.82%   | 140     |
| v3  | +1 wild on base reels 2–4, +2 wilds on FS reels 2–4, scatter 3/15/100                                                 | 85.14%     | 2.63%        | 32.86% | **120.63%** | 45.92%   | 140     |
| v4  | Back to 2 base wilds; low 3-of-a-kind bumps (A 12, Q/J 10), SEAHORSE 4-of-a-kind 60; 5 FS wilds                       | 61.03%     | 2.63%        | 26.04% | **89.70%**  | 38.82%   | 140     |
| v5  | FS reels 1 and 5: −2 Q, −2 J (28 symbols)                                                                             | 61.03%     | 2.63%        | 28.83% | **92.48%**  | 38.82%   | 140     |
| v6  | Centre FS reel: 6th wild                                                                                              | 61.03%     | 2.63%        | 32.28% | **95.94%**  | 38.82%   | 140     |
| v7  | Base reels 1 and 5: PUFFER → A                                                                                        | 61.41%     | 2.63%        | 32.28% | **96.32%**  | 39.21%   | 140     |
| v8  | 3 scatters pay 2x instead of 3x                                                                                       | 61.41%     | 1.95%        | 32.15% | **95.52%**  | 39.21%   | 140     |

## What each step taught

- **v1 → v2 (linear).** Line RTP is linear in pays, and the hit rate does not depend on
  pays. Doubling the pays doubled line RTP exactly (28.93 → 57.86) and left the hit
  rate at 38.82%. This is the cheapest lever and the most predictable one.
- **v2 → v3 (overshoot).** The v2 breakdown showed that about 68% of line RTP came from wins
  using a wild. One more wild on each of three reels was therefore a large step: +27 points
  in base. Lesson: wild counts are a coarse lever, so use them for the feature and use
  pays for fine-tuning. _(Correction: I originally attributed part of this jump to the
  reshuffled layout. That is wrong; see "RTP does not depend on the layout" below.)_
- **v4.** Base went back to v2's reels. Because the layout is seeded, these are _identical
  strips_, so the base change is purely the pay bumps: +3.2 points, as predicted. The base
  game is now on target at 61% lines and 38.8% hits. From here only the feature moves.
- **v5 → v6.** Two measured steps on the FS reels: shorter outer reels (+2.8 points), then
  one extra wild on the centre reel only (+3.5 points). From v3 → v4 I had estimated
  about 2.3 points per wild per reel. The real gain was larger because v5 had already
  made every FS win more likely, so each extra wild completed more combinations.
  _(Correction: the reshuffle I originally cited plays no part in RTP.)_
- **v7 (a wrong prediction, kept on purpose).** I expected swapping PUFFER for the cheaper
  A to lower RTP. It _raised_ it (+0.38). On reels 2–4, A has 4 copies against PUFFER's
  3, so an A on reel 1 lines up more often, and frequency outweighs the lower pay. The hit
  rate moved as intended, to 39.2%.
- **v8.** 3 scatters (probability about 1 in 148) paying 2x instead of 3x removes about
  0.68 points of base scatter RTP. It also slightly lowers FS, because scatters pay during
  FS too. Final result: **95.52%**, centred in the range.

### v8 result: on target except volatility

The 2 × 10M simulation of v8 matched the exact figures, but showed **SD 4.98**, which is low
volatility, and a largest round of only 460x in 20M rounds, far below the 5000x cap.

## Phase 2: volatility (v9–v12)

New targets: RTP 95.3–95.8%, hit rate ≥ 37%, SD 7–9, largest observed round ≥ 1000x.
Stacks are allowed only for SHARK and OCTOPUS (2–3 in a row); all other layout rules stay.
The budget was 6 iterations; 4 were used.

SD and the largest round come from a quick simulation (seed 1, 2M rounds; 5M for v12).
Everything else is exact.

| #   | Change                                                                                                      | Base lines | Base scatter | FS     | **RTP (uncapped)** | Hit rate  | FS spin SD | **SD (sim)** | Largest round (sim) |
| --- | ----------------------------------------------------------------------------------------------------------- | ---------- | ------------ | ------ | ------------------ | --------- | ---------- | ------------ | ------------------- |
| v9  | Same counts as v8; SHARK and OCTOPUS as stacks of 2 on all reels                                            | 61.41%     | 1.95%        | 32.15% | **95.519%**        | 36.57% ❌ | —          | 5.27         | 435x                |
| v10 | Base = v8 (no stacks). FS: SHARK and OCTOPUS stacks of 3 (+1 each), −1 A, −1 K, one wild fewer on reels 2–4 | 61.41%     | 1.95%        | 30.07% | **93.436%**        | 39.21%    | 7.00       | 5.75         | 1133x               |
| v11 | Top-heavy pays: SHARK 30/300/2500, OCTOPUS 25/200/1200; one wild fewer on the centre FS reel                | 62.16%     | 1.95%        | 31.23% | **95.346%**        | 39.21%    | 12.14      | 7.72         | 1514x               |
| v12 | 4 scatters pay 20x instead of 15x                                                                           | 62.16%     | 2.13%        | 31.27% | **95.554%**        | 39.21%    | 12.15      | **8.04**     | 2266x               |

### What each step taught

- **v9: RTP does not depend on the layout.** Only symbol counts changed places, not
  values, and RTP stayed at exactly 95.519%. Every row of a reel is uniformly
  distributed with that reel's symbol frequencies, and reels are independent, so the
  expected win of a line depends only on the counts. The layout moves only the **joint**
  behaviour of the 20 lines: stacks make lines win together, which raises SD and lowers
  the hit rate. Verify now checks this with an independent frequency-only calculation.
  The lesson: stacks of 2 in base cost 2.6 points of hit rate and bought only +0.3 SD.
- **v10: put the volatility where it is cheap.** The base game drives the hit rate, and
  the free spins drive the tail. Base went back to v8; FS got stacks of 3. SD rose to
  5.75 and the tail reached 1000x, but RTP fell by 2.1 points.
- **Model for SD before spending iterations.** With X a single free spin (×1) and N the
  spins per feature: `Var ≈ Var(base) + P(trigger) × E[S²]` with
  `Var(S) ≈ E[N] × 4 × Var(X)` (the 4 is ×2 squared). v10 had SD(X) = 7.0, and the
  model said SD(X) ≈ 11 was needed for SD ≈ 7.5.
- **v11: top-heavy pays.** A win's variance grows with pay², but its mean only with pay.
  Moving value from 3-of-a-kind to 4/5-of-a-kind premium wins raises SD cheaply.
  Predicted base +0.73 → actual +0.75; predicted FS ≈ 31.6 → actual 31.23. SD(X) reached
  12.1 and SD 7.7. Every target was met, but RTP sat 0.05 above the floor.
- **v12.** A small, predictable nudge to the centre of the range: +0.18 base scatter
  and +0.04 FS, both exactly as predicted.

## Choosing the max win cap

The cap is chosen from the v12 tail (2 × 10M rounds, simulated with a 5000x cap that never bound):

| Cap       | Rounds reaching it                                          | RTP it would remove              |
| --------- | ----------------------------------------------------------- | -------------------------------- |
| 1000x     | 1 in ~117,000                                               | 0.16–0.24%                       |
| 1500x     | 1 in ~500,000                                               | 0.03–0.05%                       |
| **2000x** | **1 in ~4M (sim); a single spin alone: 1 in 1.64M (exact)** | **≥ 0.028% (exact lower bound)** |
| 2500x+    | never in 20M rounds                                         | not measurable                   |

**2000x** is the cap because it is:

- **real:** players can actually reach it, with a single free spin doing so about 1 in
  1.6M rounds, so "win up to 2000x" is an honest claim;
- **cheap:** it removes only a few hundredths of a percent of RTP;
- **provable:** the capped RTP stays in range, with an exact upper bound of 95.526% for v12
  and 95.639% for v13.

## Review fixes (v13)

**1. Strict rank order in the paytable.** v12 broke the rank order for 3-of-a-kind
(OCTOPUS 25 < TURTLE 30, SHARK = TURTLE, K = Q = J) and for Q/J 4-of-a-kind. The new rule
is that for every count, a higher rank pays strictly more:
SHARK > OCTOPUS > TURTLE > SEAHORSE > PUFFER > A > K > Q > J. It is declared as
`constraints.payRank` and checked by verify.

|     | 3 of a kind                                     | 4 of a kind |
| --- | ----------------------------------------------- | ----------- |
| v12 | SHARK 30, OCTOPUS 25, TURTLE 30, K/Q/J 10/10/10 | Q/J 20/20   |
| v13 | SHARK 36, OCTOPUS 30, TURTLE 24, K/Q/J 11/10/9  | Q/J 21/20   |

The prediction came from the per-count pay-unit contributions of v10/v11: about +0.1
RTP. The result was +0.11 (95.554 → 95.667%). It took one iteration, and the hit rate and SD
barely move because pays do not change which lines win.

**2. Base reel 4 had drifted in v10–v12.** Those candidates declared _empty_ base
stacks (`baseStacks: five({})`). Because the stack flag was global, that enabled the
stack rule for the base reels too. With the same seed, the layout loop accepts the first
shuffle that passes the rules. For reel 4 that first shuffle contained SHARK SHARK, which
the old rule had rejected. The counts did not change, so RTP was identical, but the strip
did. Fixes:

- The stack rule is now decided **per reel set**, and v13 declares no base stacks, so
  its base reels are **byte-identical to v8** (checked by diffing against the v8 config).
- `tune --write` **refuses** to change the base reels unless `--allow-base-change` is
  passed. v13 needed it on purpose, to restore v8.
- A test pins the fingerprint of the released strips (`deepReef.test.ts`).
- The exact hit rate was recomputed on the final strips: **39.214408%**. It is identical
  to v12 because reel 4 cannot create or remove a hit (a win needs reels 1–3; reel 4 only
  extends it). The base SD does differ (2.4024 → 2.3907), which confirms the calculation
  really ran on different strips.

v10–v12 keep their original definition, so their recorded numbers stay reproducible.

| #       | Change                             | Base lines | Base scatter | FS     | **RTP (uncapped)** | RTP capped (bound) | Hit rate     | **SD (sim)** |
| ------- | ---------------------------------- | ---------- | ------------ | ------ | ------------------ | ------------------ | ------------ | ------------ |
| v12     | (see above)                        | 62.16%     | 2.13%        | 31.27% | 95.554%            | ≤ 95.526%          | 39.2144%     | 8.03         |
| **v13** | Strict rank order; base reels = v8 | 61.94%     | 2.13%        | 31.60% | **95.667%**        | **≤ 95.639%**      | **39.2144%** | **8.02**     |

## Final (v13): exact vs estimated

| Figure                  | Value                     | Status                                                                                                                                                                           |
| ----------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RTP without cap         | 95.667%                   | **exact** (full cycle + Wald + Markov chain)                                                                                                                                     |
| RTP with the 2000x cap  | ≤ 95.639%                 | **exact upper bound**; the cap loss is at least 0.028%                                                                                                                           |
| Cap loss (measured)     | 0.016–0.020%              | **simulator**, 6 and 4 cap hits in 2 × 10M rounds. This is below the exact expectation of ≥ 0.028% only through sampling noise: about 6 such events are expected per 10M rounds. |
| Hit rate                | 39.2144%                  | **exact**                                                                                                                                                                        |
| FS trigger              | 1 in 140                  | **exact**                                                                                                                                                                        |
| Free spins per feature  | 10.907                    | **exact**                                                                                                                                                                        |
| Average feature win     | 44.35x bet (uncapped)     | **exact**                                                                                                                                                                        |
| Largest base spin       | 259x                      | **exact**, so the cap never binds in base                                                                                                                                        |
| Overall volatility (SD) | 8.25 ± 0.25 / 8.19 ± 0.23 | **simulator**, two seeds (medium)                                                                                                                                                |

The v13 run with the two standard seeds has all 18 comparisons within the 95% CI.

### Extended validation of the simulator (v12)

High volatility makes 10M-round RTP estimates noisy. About 0.15% of RTP comes from free
spins rarer than 1 in 1.6M rounds, so 10M rounds sample them only about 6 times. I
therefore ran extra seeds:

| Run                | RTP (sim, capped) | z vs 95.526% | FS trigger z |
| ------------------ | ----------------- | ------------ | ------------ |
| seed 20240601, 10M | 95.699%           | +0.66        | −0.69        |
| seed 777, 10M      | 94.894%           | −2.52        | −2.39        |
| seed 1, 10M        | 94.980%           | −2.2         | +0.26        |
| seed 2, 10M        | 95.568%           | +0.2         | +1.40        |
| seed 3, 10M        | 95.105%           | −1.7         | −1.22        |
| seed 4, **100M**   | 95.394%           | −1.6         | −1.41        |

- The **base game** agrees with the exact values in every run.
- **Rare events** agree with their exact probabilities: counts of free spins ≥ 100x,
  500x, 1000x and 2000x are within Poisson noise (see [math-simulation.md](math-simulation.md)).
- **Seed 777** has an unusually low trigger count (z −2.39). That is a base-game event
  with no heavy tail, so the low RTP comes from bad luck with triggers, not from a flaw.
- The RTP z-scores lean negative. That is the expected signature of a right-skewed win
  distribution: samples with fewer extreme wins have both a lower mean and a lower sample
  SD. The 100M run pulls the gap in half (−0.13 points), as noise does, whereas a real
  bias would have grown to z ≈ −4. The seeds were **not** re-picked to make the tables look better.
- As a final check, the exact calculator was cross-checked by an independent
  frequency-only method, which agreed to 6 decimals.

Simulation results: [math-simulation.md](math-simulation.md).

The full paytable with probabilities is in [math-report.md](math-report.md), generated with
`npm run math:exact`.
