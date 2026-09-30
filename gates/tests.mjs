// Gate: the unit tests pass (vitest, no network: Google and Stripe are faked in-test).
import { spawnSync } from 'node:child_process';
import { report, ROOT } from '../lib.mjs';

const r = spawnSync('npx', ['vitest', 'run'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
const out = (r.stdout + r.stderr).split('\n');
const failedNames = out.filter(l => /^\s*(FAIL|×)\s/.test(l)).map(l => l.trim()).slice(0, 20);
const summary = out.filter(l => /^\s*(Test Files|Tests)\s+\d/.test(l)).map(l => l.trim());
[...failedNames, ...summary].forEach(l => console.log(`     ${l}`));
report('tests', r.status === 0 ? [] : ['vitest failed (failing tests listed above)']);
