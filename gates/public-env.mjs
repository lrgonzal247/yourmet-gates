// Gate: NEXT_PUBLIC_* values are inlined into the browser bundle. Every one the code uses must be listed in
// security/public-env.json, no listed name may look like a secret, and server-only names must never appear in
// browser code.
import { read, readJson, report, srcFiles } from '../lib.mjs';

const cfg = readJson('security/public-env.json'), listed = new Set(cfg.names || []), problems = [];
const SECRETISH = /SECRET|TOKEN|PRIVATE|PASSWORD|WEBHOOK|KEY/;
for (const n of listed) if (SECRETISH.test(n) && n !== 'NEXT_PUBLIC_FIREBASE_API_KEY') problems.push(`${n} looks like a secret; it must not be NEXT_PUBLIC_`);
const files = [...srcFiles(), 'next.config.mjs'];
const used = new Map();
for (const f of files) {
  let s; try { s = read(f); } catch { continue; }
  for (const m of s.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) if (!used.has(m[0])) used.set(m[0], f);
}
for (const [n, f] of used) {
  if (!listed.has(n)) problems.push(`${f}: ${n} is not in security/public-env.json`);
  if (SECRETISH.test(n) && n !== 'NEXT_PUBLIC_FIREBASE_API_KEY') problems.push(`${f}: ${n} looks like a secret; it must not be NEXT_PUBLIC_`);
}
const browser = f => /^components\//.test(f) || /^lib\/client\//.test(f) || (/^pages\//.test(f) && !/^pages\/api\//.test(f)) || f === 'lib/firebaseClient.js';
for (const f of srcFiles().filter(browser)) {
  const s = read(f);
  for (const n of cfg.serverOnly || []) if (new RegExp(`\\b${n}\\b`).test(s)) problems.push(`${f}: server-only ${n} appears in browser code`);
  if (/(from\s+|import\s*\(\s*)["'][^"']*lib\/server\//.test(s)) problems.push(`${f}: browser code imports lib/server`);
}
report(`public-env (${used.size} names used)`, problems);
