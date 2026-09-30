import type { PayByCount } from '../../src/math/engine/types';
import type { DeepReefSymbol } from '../../src/math/config/deepReefRules';
import type { SymbolCounts } from './layoutStrip';

/**
 * Tuning history. Each entry is one iteration of pays and reel composition. Any of
 * them can be re-run with `npm run math:tune -- <id>`, so the path to the final
 * numbers is reproducible, not just the end result.
 */
export interface Candidate {
  readonly id: string;
  readonly note: string;
  readonly linePays: Readonly<Partial<Record<DeepReefSymbol, PayByCount>>>;
  readonly scatterPays: PayByCount;
  readonly baseReels: readonly SymbolCounts<DeepReefSymbol>[];
  readonly freeSpinReels: readonly SymbolCounts<DeepReefSymbol>[];
  readonly layoutSeed: number;
}

type Counts = SymbolCounts<DeepReefSymbol>;

const PAYS_V1: Candidate['linePays'] = {
  SHARK: { 3: 25, 4: 100, 5: 500 },
  OCTOPUS: { 3: 20, 4: 60, 5: 250 },
  TURTLE: { 3: 15, 4: 40, 5: 150 },
  SEAHORSE: { 3: 10, 4: 25, 5: 100 },
  PUFFER: { 3: 8, 4: 20, 5: 75 },
  A: { 3: 5, 4: 15, 5: 50 },
  K: { 3: 5, 4: 12, 5: 40 },
  Q: { 3: 4, 4: 10, 5: 30 },
  J: { 3: 4, 4: 8, 5: 25 },
};

const SCATTER_PAYS_V1: PayByCount = { 3: 2, 4: 10, 5: 50 };

// v2: every line pay doubled. Line RTP scales linearly with pays, and the hit rate does not change.
const PAYS_V2: Candidate['linePays'] = {
  SHARK: { 3: 50, 4: 200, 5: 1000 },
  OCTOPUS: { 3: 40, 4: 120, 5: 500 },
  TURTLE: { 3: 30, 4: 80, 5: 300 },
  SEAHORSE: { 3: 20, 4: 50, 5: 200 },
  PUFFER: { 3: 16, 4: 40, 5: 150 },
  A: { 3: 10, 4: 30, 5: 100 },
  K: { 3: 10, 4: 24, 5: 80 },
  Q: { 3: 8, 4: 20, 5: 60 },
  J: { 3: 8, 4: 16, 5: 50 },
};

// Base reels, v1: 32 symbols per reel, one scatter, wilds on reels 2-4 only.
const BASE_OUTER_V1: Counts = { SCATTER: 1, SHARK: 2, OCTOPUS: 2, TURTLE: 3, SEAHORSE: 3, PUFFER: 3, A: 4, K: 4, Q: 5, J: 5 };
const BASE_INNER_V1: Counts = { WILD: 2, SCATTER: 1, SHARK: 2, OCTOPUS: 2, TURTLE: 3, SEAHORSE: 3, PUFFER: 3, A: 4, K: 4, Q: 4, J: 4 };

// Free-spin reels, v1: more wilds and fewer low symbols on reels 2-4.
const FS_OUTER_V1: Counts = BASE_OUTER_V1;
const FS_INNER_V1: Counts = { WILD: 4, SCATTER: 1, SHARK: 2, OCTOPUS: 2, TURTLE: 3, SEAHORSE: 3, PUFFER: 3, A: 4, K: 4, Q: 3, J: 3 };

// v3: one more wild on base reels 2-4 (replaces a J), two more on FS reels 2-4 (replace Q and J).
const BASE_INNER_V3: Counts = { ...BASE_INNER_V1, WILD: 3, J: 3 };
const FS_INNER_V3: Counts = { ...FS_INNER_V1, WILD: 6, Q: 2, J: 2 };
const SCATTER_PAYS_V3: PayByCount = { 3: 3, 4: 15, 5: 100 };

// v4: back to 2 base wilds; small bumps on the low symbols' 3-of-a-kind, which drive base RTP.
const PAYS_V4: Candidate['linePays'] = {
  ...PAYS_V2,
  SEAHORSE: { 3: 20, 4: 60, 5: 200 },
  A: { 3: 12, 4: 30, 5: 100 },
  Q: { 3: 10, 4: 20, 5: 60 },
  J: { 3: 10, 4: 20, 5: 50 },
};
const FS_INNER_V4: Counts = { ...FS_INNER_V1, WILD: 5, Q: 2, J: 3 };

// v5: FS reels 1 and 5 lose 2 Q and 2 J (28 symbols), so everything else is denser there.
const FS_OUTER_V5: Counts = { ...BASE_OUTER_V1, Q: 3, J: 3 };

// v6: the centre FS reel gets a 6th wild (replaces a J); reels 2 and 4 keep 5.
const FS_CENTER_V6: Counts = { ...FS_INNER_V4, WILD: 6, J: 2 };

// v7: base reels 1 and 5 swap a PUFFER for an A (cheaper, more frequent symbol).
const BASE_OUTER_V7: Counts = { ...BASE_OUTER_V1, PUFFER: 2, A: 5 };

// v8: 3 scatters pay 2x instead of 3x (P(3 scatters) ~ 0.65% -> about -0.65 pts).
const SCATTER_PAYS_V8: PayByCount = { 3: 2, 4: 15, 5: 100 };

const reels = (outer: Counts, inner: Counts): Counts[] => [outer, inner, inner, inner, outer];

export const CANDIDATES: readonly Candidate[] = [
  {
    id: 'v1',
    note: 'Starting point: typical 20-line medium paytable, 32-symbol reels, one scatter per reel.',
    linePays: PAYS_V1,
    scatterPays: SCATTER_PAYS_V1,
    baseReels: reels(BASE_OUTER_V1, BASE_INNER_V1),
    freeSpinReels: reels(FS_OUTER_V1, FS_INNER_V1),
    layoutSeed: 1,
  },
  {
    id: 'v2',
    note: 'v1 gave RTP 40% with hit rate 38.8%: wins are too small. Double all line pays.',
    linePays: PAYS_V2,
    scatterPays: SCATTER_PAYS_V1,
    baseReels: reels(BASE_OUTER_V1, BASE_INNER_V1),
    freeSpinReels: reels(FS_OUTER_V1, FS_INNER_V1),
    layoutSeed: 1,
  },
  {
    id: 'v3',
    note: 'v2 is linear as expected (78%). FS pays too little per spin (1.2x bet). More wilds on base and FS reels 2-4, larger scatter pays.',
    linePays: PAYS_V2,
    scatterPays: SCATTER_PAYS_V3,
    baseReels: reels(BASE_OUTER_V1, BASE_INNER_V3),
    freeSpinReels: reels(FS_OUTER_V1, FS_INNER_V3),
    layoutSeed: 1,
  },
  {
    id: 'v4',
    note: 'v3 overshoots (120.6%): the 3rd base wild is too coarse a step (+27 pts). Back to 2 base wilds with small low-symbol pay bumps; 5 wilds on FS reels 2-4.',
    linePays: PAYS_V4,
    scatterPays: SCATTER_PAYS_V3,
    baseReels: reels(BASE_OUTER_V1, BASE_INNER_V1),
    freeSpinReels: reels(FS_OUTER_V1, FS_INNER_V4),
    layoutSeed: 1,
  },
  {
    id: 'v5',
    note: 'v4: base is on target (61.0% lines, 38.8% hits), FS short by ~6 pts. Shorter FS outer reels (fewer Q/J).',
    linePays: PAYS_V4,
    scatterPays: SCATTER_PAYS_V3,
    baseReels: reels(BASE_OUTER_V1, BASE_INNER_V1),
    freeSpinReels: reels(FS_OUTER_V5, FS_INNER_V4),
    layoutSeed: 1,
  },
  {
    id: 'v6',
    note: 'v5: 92.5%, FS still ~3 pts short. v3->v4 showed ~8% FS change per wild per reel, so add one wild on the centre FS reel only.',
    linePays: PAYS_V4,
    scatterPays: SCATTER_PAYS_V3,
    baseReels: reels(BASE_OUTER_V1, BASE_INNER_V1),
    freeSpinReels: [FS_OUTER_V5, FS_INNER_V4, FS_CENTER_V6, FS_INNER_V4, FS_OUTER_V5],
    layoutSeed: 1,
  },
  {
    id: 'v7',
    note: 'v6: 95.94% is in range but at the top edge, and hits are 38.8%. Swap PUFFER for A on base reels 1/5: more frequent, cheaper wins.',
    linePays: PAYS_V4,
    scatterPays: SCATTER_PAYS_V3,
    baseReels: reels(BASE_OUTER_V7, BASE_INNER_V1),
    freeSpinReels: [FS_OUTER_V5, FS_INNER_V4, FS_CENTER_V6, FS_INNER_V4, FS_OUTER_V5],
    layoutSeed: 1,
  },
  {
    id: 'v8',
    note: 'v7: hits 39.2% but RTP 96.32% is over the range. Lower the 3-scatter pay from 3x to 2x.',
    linePays: PAYS_V4,
    scatterPays: SCATTER_PAYS_V8,
    baseReels: reels(BASE_OUTER_V7, BASE_INNER_V1),
    freeSpinReels: [FS_OUTER_V5, FS_INNER_V4, FS_CENTER_V6, FS_INNER_V4, FS_OUTER_V5],
    layoutSeed: 1,
  },
];
