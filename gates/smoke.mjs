// Gate (after the build): run the built Worker locally (wrangler dev, workerd) with throwaway test secrets and
// check the edge behaviour end to end: the page renders with the CSP, admin paths 404 on the public Worker,
// user routes need a token, the webhook rejects a bad signature and accepts a good one, body caps hold, and the
// admin Worker refuses a request that has no Access JWT. Nothing leaves the machine.
import { spawn } from 'node:child_process';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJson, report, ROOT } from '../lib.mjs';

const headers = readJson('security/headers.json');
const problems = [];
const tmp = mkdtempSync(join(tmpdir(), 'ym-smoke-'));
const WHSEC = 'whsec_smoke_test_only_not_a_real_secret';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = { type: 'service_account', project_id: 'demo-yourmet', private_key_id: 'smoke', client_email: 'smoke@demo-yourmet.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const envFile = join(tmp, 'smoke.env');
writeFileSync(envFile, `GCP_SA_KEY_JSON=${JSON.stringify(JSON.stringify(sa))}\nSTRIPE_WEBHOOK_SECRET=${WHSEC}\nFIREBASE_PROJECT_ID=demo-yourmet\n`);

async function withDev(env, port, fn) {
  const args = ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--env-file', envFile, '--inspector-port', String(port + 1),
    '--show-interactive-dev-session=false', ...(env ? ['--env', env] : [])];
  const child = spawn('npx', args, { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  try {
    const t0 = Date.now();
    for (;;) {
      if (/Ready on http/.test(log)) break;
      if (child.exitCode !== null || Date.now() - t0 > 90000) throw new Error(`wrangler dev (${env || 'app'}) did not start:\n${log.slice(-2000)}`);
      await new Promise(r => setTimeout(r, 300));
    }
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
    await new Promise(r => setTimeout(r, 500));
  }
}

const expect = async (label, p, want, check) => {
  let res;
  try { res = await p; } catch (e) { problems.push(`${label}: request failed (${e.message})`); return; }
  const line = `${label} -> ${res.status}`;
  console.log(`     ${line}`);
  if (res.status !== want) problems.push(`${line}, expected ${want}`);
  if (check) { const msg = await check(res); if (msg) problems.push(`${label}: ${msg}`); }
};
const sign = (body, t = Math.floor(Date.now() / 1000), secret = WHSEC) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const port = 18000 + Math.floor(Math.random() * 2000);

try {
  await withDev('', port, async base => {
    const post = (path, body, hs = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...hs }, body });
    await expect('GET /', fetch(base + '/'), 200, res => res.headers.get('content-security-policy') === headers.all['Content-Security-Policy'] ? null : 'CSP header missing or different from security/headers.json');
    await expect('GET /admin (public)', fetch(base + '/admin'), 404);
    await expect('GET /api/insights (public)', fetch(base + '/api/insights'), 404);
    await expect('GET /api/%69nsights (public)', fetch(base + '/api/%69nsights'), 404);
    await expect('POST /api/tester-gate (public)', post('/api/tester-gate', '{}'), 404);
    await expect('POST /api/log-view without a token', post('/api/log-view', '{"kind":"place","placeId":"x"}'), 401,
      res => res.headers.get('cache-control') === 'no-store' ? null : 'no Cache-Control: no-store');
    const evt = JSON.stringify({ id: 'evt_smoke1', type: 'customer.created', created: 1, data: { object: { id: 'cus_1' } } });
    await expect('POST /api/stripe-webhook bad signature', post('/api/stripe-webhook', evt, { 'stripe-signature': sign(evt, undefined, 'whsec_wrong') }), 400);
    await expect('POST /api/stripe-webhook good signature', post('/api/stripe-webhook', evt, { 'stripe-signature': sign(evt) }), 200);
    await expect('POST /api/log-view 20 KB body', post('/api/log-view', 'x'.repeat(20 * 1024)), 413);
  });
  await withDev('admin', port + 10, async base => {
    await expect('GET /admin (admin Worker, no Access JWT)', fetch(base + '/admin'), 403);
    await expect('GET / (admin Worker, forged JWT)', fetch(base + '/', { headers: { 'cf-access-jwt-assertion': 'eyJhbGciOiJub25lIn0.e30.' } }), 403);
  });
} catch (e) {
  problems.push(e.message);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
report('smoke (wrangler dev, local)', problems);
