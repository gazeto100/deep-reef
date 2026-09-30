import { verifyGame } from '../src/math/analysis/verify';
import { DEEP_REEF } from '../src/math/config/deepReef';

const started = performance.now();
const { checks } = verifyGame(DEEP_REEF);

for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed in ${((performance.now() - started) / 1000).toFixed(1)} s`);
if (failed.length > 0) process.exitCode = 1;
