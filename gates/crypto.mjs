// Gate: no weak or hand-rolled crypto in the app, and no Math.random() near anything that looks like a
// token, secret, invite/pairing code or nonce. Those need crypto.getRandomValues().
import { read, report, srcFiles } from '../lib.mjs';

const BANNED = /\b(md5|sha1|createCipheriv|createDecipheriv|createCipher|createDecipher)\b/i;
const TOKENISH = /token|secret|nonce|passw|session|csrf|otp|salt|api_?key|auth|code|invite|pair|\bref\b/i;
const problems = [];
for (const f of srcFiles()) {
  const lines = read(f).split('\n');
  lines.forEach((l, i) => {
    if (BANNED.test(l)) problems.push(`${f}:${i + 1}: ${l.match(BANNED)[0]}`);
    if (/Math\.random\s*\(/.test(l) && lines.slice(Math.max(0, i - 3), i + 4).some(x => TOKENISH.test(x))) problems.push(`${f}:${i + 1}: Math.random() next to token, code or secret handling; use crypto.getRandomValues()`);
  });
}
report('crypto', problems);
