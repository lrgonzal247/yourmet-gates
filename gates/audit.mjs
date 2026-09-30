// Gate: no high or critical advisories in the dependencies that ship (npm audit --omit=dev --audit-level=high).
import { spawnSync } from 'node:child_process';
import { report, ROOT } from '../lib.mjs';

const r = spawnSync('npm', ['audit', '--omit=dev', '--audit-level=high'], { cwd: ROOT, encoding: 'utf8' });
if (r.status !== 0) { process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); }
report('audit (omit=dev, level=high)', r.status === 0 ? [] : ['npm audit found high or critical advisories (listed above)']);
