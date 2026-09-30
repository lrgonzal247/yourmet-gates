// Gate: the Stripe webhook verifies the signature over the raw bytes before anything parses them, keeps its
// timestamp tolerance and numeric-t check, and its tests cover the failure cases.
import { read, report, exists } from '../lib.mjs';

const problems = [];
const route = read('app/api/stripe-webhook/route.js');
if (!/handleStripeWebhook\s*\(\s*request\s*\)/.test(route)) problems.push('app/api/stripe-webhook/route.js must hand the raw Request to handleStripeWebhook');
if (/\.json\s*\(|JSON\.parse/.test(route)) problems.push('app/api/stripe-webhook/route.js parses the body itself');
const lib = read('lib/server/stripeWebhook.js');
const fn = lib.slice(lib.indexOf('export async function handleStripeWebhook'));
const at = re => { const m = re.exec(fn); return m ? m.index : -1; };
const rawRead = at(/request\.(arrayBuffer|text)\s*\(/), verify = at(/verifyStripeSignature\s*\(/), parse = at(/JSON\.parse\s*\(|request\.json\s*\(/);
if (fn.length === lib.length || rawRead < 0) problems.push('handleStripeWebhook must read the raw body with request.arrayBuffer() or request.text()');
if (verify < 0) problems.push('handleStripeWebhook never calls verifyStripeSignature');
if (parse >= 0 && verify >= 0 && parse < verify) problems.push('handleStripeWebhook parses the body before verifying the signature');
if (!/if\s*\(\s*!sig\.ok\s*\)\s*return/.test(fn)) problems.push('handleStripeWebhook must return early when the signature is not ok');
const s = read('lib/server/stripe.js');
if (!/Math\.abs\(\s*now\s*-\s*ts\s*\)\s*>\s*toleranceSec/.test(s.replace(/\/\/.*$/gm, ''))) problems.push('lib/server/stripe.js: the timestamp tolerance check is missing');
if (!/\/\^\\d\{1,12\}\$\/\.test\(t\)/.test(s)) problems.push('lib/server/stripe.js: t must be checked as digits only');
if (!/timingSafeEqualBytes/.test(s)) problems.push('lib/server/stripe.js: signatures must be compared in constant time');
if (!exists('tests/webhook.test.js')) problems.push('tests/webhook.test.js is missing');
else {
  const t = read('tests/webhook.test.js');
  [['valid signature', /valid signature -> 200/], ['tampered body', /tampered body -> 400/], ['stale timestamp', /stale timestamp -> 400/],
   ['non-numeric t', /non-numeric t -> 400/], ['missing secret', /missing secret/], ['duplicate event', /duplicate event is a 200/],
   ['unmapped subscription', /unmapped subscription -> 500/]].forEach(([n, re]) => { if (!re.test(t)) problems.push(`tests/webhook.test.js has no "${n}" case`); });
}
report('webhook', problems);
