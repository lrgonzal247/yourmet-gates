// Gate (after the build): the bundled Worker (what wrangler uploads, for each Worker) is under the size limit.
// The limit is 3 MiB gzip, the Workers Free figure the owner chose to hold to; the uncompressed size is checked
// against 64 MiB. Uses `wrangler deploy --dry-run --outdir`, which deploys nothing.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { report, ROOT } from '../lib.mjs';

const GZIP_LIMIT = Number(process.env.GATES_SIZE_LIMIT_BYTES || 3 * 1024 * 1024);
const RAW_LIMIT = 64 * 1024 * 1024;
const problems = [], lines = [];
for (const env of ['', 'admin']) {
  const out = mkdtempSync(join(tmpdir(), 'ym-size-'));
  const args = ['wrangler', 'deploy', '--dry-run', '--outdir', out, ...(env ? ['--env', env] : [])];
  const r = spawnSync('npx', args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  if (r.status !== 0) { problems.push(`wrangler dry run (${env || 'app'}) failed:\n${(r.stderr || r.stdout).slice(-2000)}`); continue; }
  let raw = 0, gz = 0;
  for (const f of readdirSync(out).filter(f => /\.(m?js|wasm)$/.test(f))) {
    const b = readFileSync(join(out, f)); raw += b.length; gz += gzipSync(b, { level: 9 }).length;
  }
  rmSync(out, { recursive: true, force: true });
  const mib = n => (n / 1048576).toFixed(2);
  lines.push(`${env || 'app'}: ${mib(gz)} MiB gzip (limit ${mib(GZIP_LIMIT)}), ${mib(raw)} MiB raw (limit 64)`);
  if (gz > GZIP_LIMIT) problems.push(`${env || 'app'}: ${mib(gz)} MiB gzip is over ${mib(GZIP_LIMIT)} MiB`);
  if (raw > RAW_LIMIT) problems.push(`${env || 'app'}: ${mib(raw)} MiB is over the 64 MiB Worker size limit`);
}
lines.forEach(l => console.log(`     ${l}`));
report('size', problems);
