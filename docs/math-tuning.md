# Deep Reef: math tuning log

The pays and reel strips were tuned with the **exact full-cycle calculator**
(`src/math/analysis/exact.ts`), not with the simulator. Each iteration is saved in
`scripts/tuning/candidates.ts` and can be re-run:

```bash
npm run math:tune              # all iterations
npm run math:tune -- v8 --detail
```

Strips are generated from symbol counts by a seeded shuffle that enforces the layout
rules: no identical neighbours, and scatters at least 3 apart. The chosen candidate is then
**frozen as literal data** in `src/math/config/deepReef.ts` with `--write`.

## Targets

| Metric | Target |
|---|---|
| RTP | 95–96% |
| Hit rate | ~40% |
| Volatility | medium |
| Free spins | roughly 1 in 150, carrying about 30% of RTP |

## Iterations

All figures are exact. "FS" is the free-spin contribution **without** the 5000x cap. The
exact uncapped value is an upper bound for the capped RTP.

| # | Change | Base lines | Base scatter | FS | **RTP** | Hit rate | FS 1 in |
|---|---|---|---|---|---|---|---|
| v1 | Starting point: typical 20-line paytable, 32-symbol reels, 1 scatter per reel, 2 wilds on reels 2–4 (base) and 4 (FS) | 28.93% | 1.74% | 9.39% | **40.06%** | 38.82% | 140 |
| v2 | All line pays ×2 | 57.86% | 1.74% | 18.52% | **78.12%** | 38.82% | 140 |
| v3 | +1 wild on base reels 2–4, +2 wilds on FS reels 2–4, scatter 3/15/100 | 85.14% | 2.63% | 32.86% | **120.63%** | 45.92% | 140 |
| v4 | Back to 2 base wilds; low 3-of-a-kind bumps (A 12, Q/J 10), SEAHORSE 4-of-a-kind 60; 5 FS wilds | 61.03% | 2.63% | 26.04% | **89.70%** | 38.82% | 140 |
| v5 | FS reels 1 and 5: −2 Q, −2 J (28 symbols) | 61.03% | 2.63% | 28.83% | **92.48%** | 38.82% | 140 |
| v6 | Centre FS reel: 6th wild | 61.03% | 2.63% | 32.28% | **95.94%** | 38.82% | 140 |
| v7 | Base reels 1 and 5: PUFFER → A | 61.41% | 2.63% | 32.28% | **96.32%** | 39.21% | 140 |
| v8 | 3 scatters pay 2x instead of 3x | 61.41% | 1.95% | 32.15% | **95.52%** | 39.21% | 140 |

## What each step taught

- **v1 → v2 (linear).** Line RTP is linear in pays, and the hit rate does not depend on
  pays. Doubling the pays doubled line RTP exactly (28.93 → 57.86) and left the hit
  rate at 38.82%. This is the cheapest lever and the most predictable one.
- **v2 → v3 (overshoot).** The v2 breakdown showed that about 68% of line RTP came from wins
  using a wild. One more wild on each of three reels was therefore a large step: +27 points
  in base. Changing the counts also reshuffles the layout, so part of the jump comes from
  the new arrangement. Lesson: wild counts are a coarse lever, so use them for the
  feature and use pays for fine-tuning.
- **v4.** Base went back to v2's reels. Because the layout is seeded, these are *identical
  strips*, so the base change is purely the pay bumps: +3.2 points, as predicted. The base
  game is now on target at 61% lines and 38.8% hits. From here only the feature moves.
- **v5 → v6.** Two measured steps on the FS reels: shorter outer reels (+2.8 points), then
  one extra wild on the centre reel only (+3.5 points). From v3 → v4 I had estimated
  about 2.3 points per wild per reel. The real gain was larger, partly because v5 had
  already made every FS win more likely, and partly because the changed reel was
  reshuffled.
- **v7 (a wrong prediction, kept on purpose).** I expected swapping PUFFER for the cheaper
  A to lower RTP. It *raised* it (+0.38). On reels 2–4, A has 4 copies against PUFFER's
  3, so an A on reel 1 lines up more often, and frequency outweighs the lower pay. The hit
  rate moved as intended, to 39.2%.
- **v8.** 3 scatters (probability about 1 in 148) paying 2x instead of 3x removes about
  0.68 points of base scatter RTP. It also slightly lowers FS, because scatters pay during
  FS too. Final result: **95.52%**, centred in the range.

## Final (v8): exact vs estimated

| Figure | Value | Status |
|---|---|---|
| RTP without cap | 95.519% | **exact** (full cycle + Wald's identity + Markov chain for retriggers) |
| Effect of the 5000x cap | — | **estimated by the simulator**; it cannot bind in base (max base spin 101.5x) |
| Hit rate | 39.21% | **exact** |
| FS trigger | 1 in 140 | **exact** |
| Free spins per feature | 10.907 | **exact** (incl. 50-spin limit) |
| Average feature win | 45.13x bet | **exact**, uncapped |
| Overall volatility (SD) | — | **estimated by the simulator** |

The full paytable with probabilities is in [math-report.md](math-report.md), generated with
`npm run math:exact`.
