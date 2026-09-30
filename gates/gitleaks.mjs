// Gate: no secrets in the committed tree. Runs a pinned gitleaks binary whose tarball is checked against a
// pinned SHA-256 before use, over a copy of the tracked files only. (ci.yml also scans the full git history;
// Workers Builds clones shallow, so this covers the tree.)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { report, ROOT } from '../lib.mjs';

const VERSION = '8.30.1';
const SHA256 = {
  'darwin_arm64': 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
  'darwin_x64': 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  'linux_arm64': 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  'linux_x64': '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
};
const plat = `${process.platform}_${process.arch === 'x64' ? 'x64' : process.arch}`;
if (!SHA256[plat]) report('gitleaks', [`no pinned gitleaks build for ${plat}`]);
const dir = join(tmpdir(), `gitleaks-${VERSION}-${plat}`), bin = join(dir, 'gitleaks');
if (!existsSync(bin)) {
  const res = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_${plat}.tar.gz`);
  if (!res.ok) report('gitleaks', [`download failed: ${res.status}`]);
  const tgz = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha256').update(tgz).digest('hex');
  if (got !== SHA256[plat]) report('gitleaks', [`gitleaks tarball sha256 ${got} does not match the pinned ${SHA256[plat]}`]);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'g.tgz'), tgz);
  const x = spawnSync('tar', ['xzf', 'g.tgz', 'gitleaks'], { cwd: dir });
  if (x.status !== 0) report('gitleaks', ['could not unpack gitleaks']);
}
// Tracked files only (node_modules and build output are not ours to scan).
const ls = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
if (ls.status !== 0) report('gitleaks', ['not a git checkout: cannot list tracked files']);
const work = mkdtempSync(join(tmpdir(), 'ym-leaks-'));
for (const f of ls.stdout.split('\0').filter(Boolean)) {
  if (!existsSync(join(ROOT, f))) continue;
  mkdirSync(dirname(join(work, f)), { recursive: true });
  cpSync(join(ROOT, f), join(work, f));
}
const config = fileURLToPath(new URL('../gitleaks.toml', import.meta.url));
const r = spawnSync(bin, ['dir', work, '--config', config, '--redact', '--no-banner', '--no-color', '--exit-code', '1'], { encoding: 'utf8' });
rmSync(work, { recursive: true, force: true });
const out = (r.stdout + r.stderr).trim();
if (r.status !== 0) console.error(out);
report(`gitleaks ${VERSION} (tracked tree)`, r.status === 0 ? [] : ['gitleaks found possible secrets (redacted findings above)']);
