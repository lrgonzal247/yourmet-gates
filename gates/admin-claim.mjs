// Gate: admin is a custom claim, never an email address. No ADMIN_EMAIL and no @yourmet.app anywhere in server
// code, and requireAdmin checks the claim, email_verified, the password provider, auth_time and revocation.
import { read, report, walk } from '../lib.mjs';

const problems = [];
const server = [...walk('lib/server'), ...walk('pages/api'), ...walk('app'), ...walk('worker'), ...walk('scripts')].filter(f => /\.(m?js|ts)$/.test(f));
for (const f of server) {
  const s = read(f);
  if (/ADMIN_EMAIL/.test(s)) problems.push(`${f}: mentions ADMIN_EMAIL`);
  if (/@yourmet\.app/i.test(s)) problems.push(`${f}: contains an @yourmet.app address`);
}
const g = read('lib/server/guards.js');
const fn = g.slice(g.indexOf('export async function requireAdmin'));
[[/decoded\.admin\s*!==\s*true/, 'the admin claim (decoded.admin !== true)'], [/email_verified\s*!==\s*true/, 'email_verified'],
 [/provider\s*!==\s*["']password["']/, 'sign_in_provider === "password"'], [/auth_time/, 'auth_time (session age)'],
 [/lookupUser\s*\(/, 'the Identity Toolkit lookup'], [/validSince/, 'revocation (validSince)'], [/disabled/, 'disabled accounts']]
  .forEach(([re, what]) => { if (!re.test(fn)) problems.push(`requireAdmin does not check ${what}`); });
report(`admin-claim (${server.length} server files)`, problems);
