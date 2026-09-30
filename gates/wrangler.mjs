// Gate: wrangler.jsonc matches config/public.json and the hosting design (plan B1/B4/B5):
// two Workers (top level "app" and env "admin"), no preview URLs, workers.dev on exactly while the origins are
// workers.dev, the wrapper as main, the required compatibility flags, rate limits, gated paths reaching the
// wrapper first, and Access placeholders only in the admin env.
import { jsonc, read, readJson, report } from '../lib.mjs';

const w = jsonc(read('wrangler.jsonc')), cfg = readJson('config/public.json'), problems = [];
const host = o => new URL(o).hostname;
const onWorkersDev = o => host(o).endsWith('.workers.dev');
const envs = Object.keys(w.env || {});
if (envs.join(',') !== 'admin') problems.push(`the only env allowed is "admin", found ${JSON.stringify(envs)}`);
const admin = (w.env || {}).admin || {};

if (w.main !== 'worker/entry.ts') problems.push(`main is ${JSON.stringify(w.main)}; it must be worker/entry.ts (the wrapper)`);
if (w.name !== 'app') problems.push(`top-level name is ${w.name}; expected "app"`);
if (admin.name !== 'admin') problems.push(`env.admin.name is ${admin.name}; expected "admin"`);
const flags = w.compatibility_flags || [];
['nodejs_compat', 'global_fetch_strictly_public'].forEach(f => { if (!flags.includes(f)) problems.push(`compatibility_flags is missing ${f}`); });
if (!/^\d{4}-\d{2}-\d{2}$/.test(w.compatibility_date || '')) problems.push('compatibility_date must be a pinned date');
if (admin.compatibility_flags || admin.compatibility_date || admin.main) problems.push('env.admin must not override main or compatibility settings');

for (const [label, e, origin] of [['app', w, cfg.appOrigin], ['admin', admin, cfg.adminOrigin]]) {
  if (e.preview_urls !== false) problems.push(`${label}: preview_urls is ${JSON.stringify(e.preview_urls)}; it must be false`);
  const wd = onWorkersDev(origin);
  if (e.workers_dev !== wd) problems.push(`${label}: workers_dev is ${JSON.stringify(e.workers_dev)} but ${origin} ${wd ? 'is' : 'is not'} a workers.dev origin`);
  if (wd) {
    if (host(origin) !== `${label === 'app' ? w.name : admin.name}.${host(origin).split('.').slice(1).join('.')}`) problems.push(`${label}: ${origin} does not match the Worker name`);
    if ((e.routes || []).length) problems.push(`${label}: routes must be empty while the origin is workers.dev`);
  } else {
    const r = e.routes || [];
    if (r.length !== 1 || r[0].pattern !== host(origin) || r[0].custom_domain !== true) problems.push(`${label}: routes must be exactly the custom domain ${host(origin)}`);
  }
  if (!e.observability || e.observability.enabled !== true) problems.push(`${label}: observability must be enabled`);
  const rl = (e.ratelimits || []).map(r => r.name).sort().join(',');
  if (rl !== 'RL_IP_PAIR,RL_IP_WRITE') problems.push(`${label}: ratelimits must be RL_IP_PAIR and RL_IP_WRITE, got ${rl || '(none)'}`);
  const self = (e.services || []).find(s => s.binding === 'WORKER_SELF_REFERENCE');
  if (!self || self.service !== (label === 'app' ? w.name : admin.name)) problems.push(`${label}: WORKER_SELF_REFERENCE must point at itself`);
}
const nsIds = [...(w.ratelimits || []), ...(admin.ratelimits || [])].map(r => r.namespace_id);
if (new Set(nsIds).size !== nsIds.length) problems.push('ratelimit namespace_ids must be unique across both Workers');

const rwf = (w.assets || {}).run_worker_first;
if (!Array.isArray(rwf) || !['/admin*', '/api/*'].every(p => rwf.includes(p))) problems.push(`app: assets.run_worker_first must include /admin* and /api/*, got ${JSON.stringify(rwf)}`);
if (!admin.assets || admin.assets.run_worker_first !== true) problems.push('admin: assets.run_worker_first must be true (every request passes the Access check)');

const v = w.vars || {}, av = admin.vars || {};
if (v.SURFACE !== 'public') problems.push(`app: vars.SURFACE must be "public", got ${JSON.stringify(v.SURFACE)}`);
if (av.SURFACE !== 'admin') problems.push(`admin: vars.SURFACE must be "admin", got ${JSON.stringify(av.SURFACE)}`);
if ('ACCESS_AUD' in v || 'ACCESS_TEAM' in v) problems.push('app: ACCESS_* belong only in env.admin');
const placeholder = s => typeof s === 'string' && /PLACEHOLDER/.test(s);
if (!(placeholder(av.ACCESS_TEAM) || /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(av.ACCESS_TEAM || ''))) problems.push(`admin: ACCESS_TEAM ${JSON.stringify(av.ACCESS_TEAM)} is neither a team domain nor the placeholder`);
if (!(placeholder(av.ACCESS_AUD) || /^[0-9a-f]{64}$/.test(av.ACCESS_AUD || ''))) problems.push(`admin: ACCESS_AUD ${JSON.stringify(av.ACCESS_AUD)} is neither an AUD tag nor the placeholder`);
if (placeholder(av.ACCESS_TEAM) || placeholder(av.ACCESS_AUD)) console.log('note wrangler: ACCESS_TEAM/ACCESS_AUD are placeholders; the admin Worker answers 403 to everything until they are set');
if (!/^[0-9a-f]{32}$/.test(w.account_id || '')) problems.push('account_id must be set (the dedicated Yourmet account)');
for (const k of ['secrets', 'kv_namespaces', 'r2_buckets', 'd1_databases', 'durable_objects']) if (w[k] || admin[k]) problems.push(`${k} is present; add it to this gate first`);
report('wrangler', problems);
