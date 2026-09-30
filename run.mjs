// Yourmet gates runner. Run from the app repo root:
//   node <gates>/run.mjs pre    before the build (source, config, deps, tests, secrets)
//   node <gates>/run.mjs post   after `npx opennextjs-cloudflare build` (shipped assets, size, local smoke)
//   node <gates>/run.mjs <gate> [<gate> ...]   run named gates only
// Every gate runs even if an earlier one fails; the exit code is 1 if any failed.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PRE = ['deps', 'lockfile', 'workflows', 'sinks', 'crypto', 'headers', 'wrangler', 'api-auth', 'public-env', 'webhook', 'admin-claim', 'sw', 'rules', 'tests', 'audit', 'gitleaks'];
export const POST = ['dist', 'size', 'smoke'];
const args = process.argv.slice(2);
const gates = args[0] === 'pre' ? PRE : args[0] === 'post' ? POST : args;
if (!gates.length || gates.some(g => ![...PRE, ...POST].includes(g))) {
  console.error(`usage: node run.mjs pre|post|<gate>...\n  gates: ${[...PRE, ...POST].join(', ')}`);
  process.exit(2);
}
const failed = gates.filter(g => spawnSync(process.execPath, [fileURLToPath(new URL(`gates/${g}.mjs`, import.meta.url))], { stdio: 'inherit' }).status !== 0);
if (failed.length) { console.error(`\n${failed.length} gate(s) failed: ${failed.join(', ')}`); process.exit(1); }
console.log(`\nall ${gates.length} gate(s) passed`);
