import { fileURLToPath } from 'node:url';

/**
 * Locations used by the math scripts, independent of the directory they are run from
 * (repo root via `npm run math:*`, or the package via `npm run -w @deep-reef/math`).
 */
const fromHere = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export const REPO_ROOT = fromHere('../../../../');
/** Generated docs live at the repo root so the README can link them. */
export const DOCS_DIR = fromHere('../../../../docs/');
/** Raw simulation output (git-ignored). */
export const SIM_OUTPUT_DIR = fromHere('../../../../sim-output/');
/** Frozen game definition written by `tune --write`. */
export const DEEP_REEF_CONFIG = fromHere('../../src/config/deepReef.ts');
