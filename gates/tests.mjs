// Gate: the unit tests pass (vitest, no network: Google and Stripe are faked in-test).
import { spawnSync } from 'node:child_process';
import { report, ROOT } from '../lib.mjs';

const r = spawnSync('npx', ['vitest', 'run'], { cwd: ROOT, encoding: 'utf8' });
const tail = (r.stdout + r.stderr).trim().split('\n').slice(-6).join('\n');
console.log(tail.replace(/^/gm, '     '));
report('tests', r.status === 0 ? [] : ['vitest failed (output above)']);
