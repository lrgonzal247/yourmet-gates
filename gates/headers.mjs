// Gate: security/headers.json holds the security headers and a strict Content-Security-Policy; public/_headers
// repeats them exactly (static assets), and the Worker wrapper imports the same file and applies it.
import { read, readJson, report, parseHeadersFile } from '../lib.mjs';

const cfg = readJson('security/headers.json'), cfgPublic = readJson('config/public.json'), problems = [];
const lower = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k.toLowerCase(), v]));
const all = lower(cfg.all);
const need = (h, ok, want) => { const v = all[h]; if (v == null) problems.push(`headers.json "all" is missing ${h}`); else if (!ok(v)) problems.push(`${h} is "${v}", expected ${want}`); };
need('x-frame-options', v => v === 'DENY', 'DENY');
need('x-content-type-options', v => v === 'nosniff', 'nosniff');
need('referrer-policy', v => v === 'strict-origin-when-cross-origin', 'strict-origin-when-cross-origin');
if (/\.workers\.dev$/.test(new URL(cfgPublic.appOrigin).hostname)) need('x-robots-tag', v => /\bnoindex\b/.test(v), 'noindex while the app is on workers.dev');
need('permissions-policy', v => ['geolocation=(self)', 'camera=()', 'microphone=()', 'payment=()'].every(p => v.split(/,\s*/).includes(p)), 'geolocation=(self), camera=(), microphone=(), payment=()');
need('content-security-policy', () => true, 'a policy');

const csp = Object.fromEntries((all['content-security-policy'] || '').split(';').map(d => d.trim().split(/\s+/)).filter(d => d[0]).map(([k, ...v]) => [k, v]));
const authDomain = cfgPublic.firebase && cfgPublic.firebase.authDomain;
const exact = {
  'default-src': ["'self'"], 'script-src': ["'self'"], 'object-src': ["'none'"], 'base-uri': ["'none'"], 'frame-ancestors': ["'none'"], 'form-action': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 'font-src': ['https://fonts.gstatic.com'], 'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'", 'https://firestore.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com'],
  'frame-src': [`https://${authDomain}`], 'worker-src': ["'self'"], 'manifest-src': ["'self'"],
};
Object.entries(exact).forEach(([k, v]) => { if ((csp[k] || []).join(' ') !== v.join(' ')) problems.push(`CSP ${k} is "${(csp[k] || []).join(' ') || '(missing)'}", expected "${v.join(' ')}"`); });
Object.keys(csp).filter(k => !(k in exact)).forEach(k => problems.push(`CSP has an unreviewed directive ${k}`));
Object.entries(csp).forEach(([k, v]) => v.forEach(s => {
  if (s === '*' || s.startsWith('*') || s === 'http:' || s === 'https:') problems.push(`CSP ${k} allows any host (${s})`);
  if (s.startsWith('http://')) problems.push(`CSP ${k} allows plain http (${s})`);
  if (s === "'unsafe-eval'" || (s === "'unsafe-inline'" && k !== 'style-src')) problems.push(`CSP ${k} allows ${s}`);
}));

// public/_headers must say exactly what headers.json says.
const file = parseHeadersFile(read('public/_headers'));
const want = { '/*': lower(cfg.all), ...Object.fromEntries(Object.entries(cfg.paths || {}).map(([p, h]) => [p, lower(h)])) };
for (const [p, hs] of Object.entries(want)) {
  const got = file[p] || {};
  for (const [k, v] of Object.entries(hs)) if (got[k] !== v) problems.push(`public/_headers ${p} ${k} is "${got[k] ?? '(missing)'}", security/headers.json says "${v}"`);
  for (const k of Object.keys(got)) if (!(k in hs)) problems.push(`public/_headers ${p} has ${k}, which is not in security/headers.json`);
}
for (const p of Object.keys(file)) if (!(p in want)) problems.push(`public/_headers has a block for ${p} that security/headers.json does not`);

// The wrapper must import the same file and apply "all" to every response.
const w = read('worker/wrapper.js');
if (!/from\s+["']\.\.\/security\/headers\.json["']/.test(w)) problems.push('worker/wrapper.js does not import security/headers.json');
if (!/Object\.entries\(HEADERS\.all\)/.test(w)) problems.push('worker/wrapper.js does not apply HEADERS.all');
if (!/Cache-Control["'],\s*["']no-store/.test(w)) problems.push('worker/wrapper.js does not set Cache-Control: no-store (for /api/*)');
if (!/\/_next\/static\//.test(Object.keys(cfg.paths || {}).join(' ')) || !/immutable/.test(lower((cfg.paths || {})['/_next/static/*'])['cache-control'] || '')) problems.push('/_next/static/* is missing its long immutable Cache-Control');
if (lower((cfg.paths || {})['/service-worker.js'])['cache-control'] !== 'no-cache') problems.push('/service-worker.js must be Cache-Control: no-cache');
report('headers', problems);
