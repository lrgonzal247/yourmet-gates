// Gate: package.json depends on exactly the packages in security/deps-allowlist.json.
// A new dependency is new code from a stranger; adding it to the allowlist makes that a reviewed, visible change.
import { readJson, report } from '../lib.mjs';

const pkg = readJson('package.json'), allow = readJson('security/deps-allowlist.json'), problems = [];
for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  const have = Object.keys(pkg[kind] || {}).sort(), want = [...(allow[kind] || [])].sort();
  have.filter(n => !want.includes(n)).forEach(n => problems.push(`${kind}: ${n} is not in security/deps-allowlist.json`));
  want.filter(n => !have.includes(n)).forEach(n => problems.push(`${kind}: ${n} is allowlisted but not in package.json; remove it from the allowlist`));
}
report('deps', problems);
