// Gate: GitHub Actions are pinned to a full commit SHA (a moved tag cannot change what runs), each workflow
// starts from read-only permissions, checkouts do not keep the token, and Dependabot watches npm and the actions.
import { exists, read, report, walk } from '../lib.mjs';

const problems = [];
const flows = walk('.github/workflows').filter(f => /\.ya?ml$/.test(f));
if (!flows.length) problems.push('no workflows found');
for (const f of flows) {
  const lines = read(f).split('\n');
  const perm = lines.findIndex(l => /^permissions:/.test(l)), jobs = lines.findIndex(l => /^jobs:/.test(l));
  if (perm < 0 || perm > jobs) problems.push(`${f}: no top-level permissions block before jobs`);
  else if (!/^permissions:\s*(read-all|\{\s*contents:\s*read\s*\})\s*$/.test(lines[perm]) && !/^\s+contents:\s*read\s*$/.test(lines[perm + 1] || '')) problems.push(`${f}: top-level permissions must be contents: read`);
  lines.forEach((l, i) => {
    const m = l.match(/^\s*-?\s*uses:\s*([^\s#]+)\s*(#.*)?$/); if (!m || m[1].startsWith('./')) return;
    if (!/@[0-9a-f]{40}$/.test(m[1])) problems.push(`${f}:${i + 1}: ${m[1]} is not pinned to a full commit SHA`);
    else if (!/#\s*v\d/.test(m[2] || '')) problems.push(`${f}:${i + 1}: ${m[1]} needs its version tag in a comment (# vX.Y.Z)`);
    if (/actions\/checkout@/.test(m[1])) {
      const block = lines.slice(i + 1, i + 6).join('\n');
      if (!/persist-credentials:\s*false/.test(block)) problems.push(`${f}:${i + 1}: actions/checkout must set persist-credentials: false`);
    }
  });
  if (/pull_request_target\b/.test(lines.join('\n'))) problems.push(`${f}: pull_request_target runs branch code with secrets; not allowed`);
}
const dep = exists('.github/dependabot.yml') ? read('.github/dependabot.yml') : '';
['npm', 'github-actions'].forEach(e => { if (!new RegExp(`package-ecosystem:\\s*["']?${e}["']?`).test(dep)) problems.push(`.github/dependabot.yml does not watch ${e}`); });
report(`workflows (${flows.length})`, problems);
