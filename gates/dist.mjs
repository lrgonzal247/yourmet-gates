// Gate (after the build): what ships to browsers (.open-next/assets and .next/static) has no source maps, no
// key-shaped secrets, no Firebase web key other than the committed public one, no server-only code, and the
// HTML carries no inline script (CSP script-src is 'self').
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, report, walk, ROOT } from '../lib.mjs';

const problems = [];
if (!existsSync(join(ROOT, '.open-next/assets'))) report('dist', ['.open-next/assets is missing: run npx opennextjs-cloudflare build first']);
const files = [...walk('.open-next/assets'), ...walk('.next/static')];
const publicKey = readJson('config/public.json').firebase.apiKey;
const KEYS = [
  ['Stripe live key', /\b(sk|rk)_live_[0-9A-Za-z]{10,}/], ['Stripe webhook secret', /whsec_[A-Za-z0-9]{20,}/], ['service-account key JSON', /"private_key"\s*:/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/], ['GitHub token', /\bgh[pousr]_[0-9A-Za-z]{36}\b/], ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
];
// Strings that only lib/server uses. (accounts:lookup is not one: the Firebase Auth browser SDK calls it too.)
const SERVER_ONLY = ['oauth2.googleapis.com/token', 'jwt-bearer', 'GCP_SA_KEY', 'documents:commit', 'STRIPE_WEBHOOK_SECRET', 'private_key_id'];
const text = f => readFileSync(join(ROOT, f), 'latin1');
for (const f of files) {
  if (f.endsWith('.map')) { problems.push(`${f}: source map in the shipped assets`); continue; }
  if (!/\.(js|mjs|css|html|json|txt|webmanifest|xml)$/.test(f) && !/BUILD_ID$|_headers$/.test(f)) continue;
  const s = text(f);
  KEYS.forEach(([name, re]) => { const m = s.match(re); if (m) problems.push(`${f}: ${name} (${m[0].slice(0, 8)}...)`); });
  for (const m of s.matchAll(/\bAIza[0-9A-Za-z_-]{35}\b/g)) if (m[0] !== publicKey) problems.push(`${f}: a Google API key that is not the public Firebase key in config/public.json`);
  if (/\.(m?js)$/.test(f)) SERVER_ONLY.forEach(k => { if (s.includes(k)) problems.push(`${f}: server-only marker "${k}" in a browser chunk`); });
}
// Pre-rendered app pages: only <script src> and JSON data blocks. 404.html/500.html are excluded: with the App
// Router present (the webhook route) Next renders them with inline flight-data scripts; under the CSP those
// scripts are blocked and the page still shows its static "not found" text, which is all it needs to do.
for (const f of walk('.next/server/pages').filter(f => f.endsWith('.html') && !/(^|\/)(404|500)\.html$/.test(f))) {
  [...text(f).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].forEach(([, attrs, body]) => {
    if (/type=["']application\/json["']/.test(attrs)) return;
    if (!/\bsrc=/.test(attrs) || body.trim()) problems.push(`${f}: inline <script> (blocked by CSP script-src 'self')`);
  });
}
report(`dist (${files.length} files)`, problems);
