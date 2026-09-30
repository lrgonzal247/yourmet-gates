// Gate: every package in package-lock.json comes from the public npm registry and has an integrity hash,
// so npm ci installs exactly the reviewed bytes and nothing from a git URL, tarball link or other registry.
import { readJson, report } from '../lib.mjs';

const lock = readJson('package-lock.json'), problems = [];
if (lock.lockfileVersion < 2) problems.push(`lockfileVersion ${lock.lockfileVersion}: regenerate with npm 7 or newer`);
const pkgs = Object.entries(lock.packages || {}).filter(([k, v]) => k && !v.link);
for (const [k, v] of pkgs) {
  if (!String(v.resolved || '').startsWith('https://registry.npmjs.org/')) problems.push(`${k}: resolved from ${v.resolved || '(nowhere)'}`);
  if (!/^sha512-/.test(v.integrity || '')) problems.push(`${k}: no sha512 integrity hash`);
}
report(`lockfile (${pkgs.length} packages)`, problems);
