// Gate: Firestore rules live in the repo, default-deny, with nothing public except reading config/testerGate,
// and emulator tests cover the attacks from plan A2 (the tests themselves run in ci.yml, which has Java).
import { exists, read, report } from '../lib.mjs';

const problems = [];
if (!exists('firestore.rules')) report('rules', ['firestore.rules is missing']);
const r = read('firestore.rules'), code = r.replace(/\/\/.*$/gm, '');
if (!/match\s*\/\{document=\*\*\}\s*\{\s*allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;\s*\}/.test(code)) problems.push('the catch-all deny (match /{document=**} { allow read, write: if false; }) is missing');
const lines = code.split('\n');
lines.forEach((l, i) => {
  if (/if\s+true\b/.test(l)) {
    const ctx = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
    if (!(/match\s*\/config\/testerGate\s*\{/.test(ctx) && /allow\s+get\s*:\s*if\s+true\s*;/.test(l))) problems.push(`firestore.rules:${i + 1}: "if true" outside the config/testerGate get`);
  }
  if (/allow\s+[^:]*\b(write|create|update|delete)\b/.test(l) && !/if\s+false/.test(l)) problems.push(`firestore.rules:${i + 1}: a client write rule; all writes go through /api`);
  if (/allow\s+[^:]*\blist\b/.test(l) || /allow\s+read\s*:/.test(l) && !/if\s+false/.test(l)) problems.push(`firestore.rules:${i + 1}: list/read (enumeration) allowed`);
});
if (!/rules_version\s*=\s*'2'/.test(code)) problems.push("rules_version = '2' is missing");
if (!exists('firebase.json') || JSON.parse(read('firebase.json')).firestore?.rules !== 'firestore.rules') problems.push('firebase.json must point firestore.rules at this file');
const tf = 'tests/rules/firestore.rules.test.js';
if (!exists(tf)) problems.push(`${tf} is missing`);
else {
  const t = read(tf);
  [[/unauthenticated read of users\/x is denied/, 'unauthenticated read of users'], [/stranger cannot read another user/, "stranger reading another user's doc"],
   [/stranger cannot write another user's partner fields/, 'stranger writing partner fields'], [/memberships\//, 'memberships'], [/analytics_/, 'analytics_*']]
    .forEach(([re, n]) => { if (!re.test(t)) problems.push(`${tf} has no test for ${n}`); });
}
report('rules', problems);
