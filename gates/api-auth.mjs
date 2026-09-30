// Gate: every API route checks who is calling. Each pages/api/** and app/api/** file must call requireUser or
// requireAdmin, or be listed in security/public-api.json with a reason. Every requireAdmin route must be in
// security/admin-paths.json "paths" (so the public Worker 404s it), and every /api entry there must be a
// requireAdmin route.
import { read, readJson, report, walk } from '../lib.mjs';

const pub = readJson('security/public-api.json').routes || {}, admin = readJson('security/admin-paths.json'), problems = [];
const files = [...walk('pages/api'), ...walk('app/api')].filter(f => /\.(m?js|ts)$/.test(f));
const urlOf = f => '/' + f.replace(/^pages\//, '').replace(/^app\//, '').replace(/\/route\.(m?js|ts)$/, '').replace(/\.(m?js|ts)$/, '').replace(/\/index$/, '');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const adminApi = (admin.paths || []).filter(e => /(^|\s)\/api\//.test(e)).map(e => e.split(/\s+/).pop());
const adminRoutes = [];
for (const f of files) {
  const s = strip(read(f));
  const user = /\brequireUser\s*\(/.test(s), adm = /\brequireAdmin\s*\(/.test(s);
  if (adm) adminRoutes.push(urlOf(f));
  if (!user && !adm && !pub[f]) problems.push(`${f}: calls neither requireUser nor requireAdmin and is not in security/public-api.json`);
  if (pub[f] && (typeof pub[f] !== 'string' || pub[f].length < 10)) problems.push(`${f}: security/public-api.json needs a reason`);
}
for (const k of Object.keys(pub)) if (!files.includes(k)) problems.push(`security/public-api.json lists ${k}, which does not exist`);
for (const r of adminRoutes) if (!adminApi.includes(r)) problems.push(`${r} calls requireAdmin but is not in security/admin-paths.json`);
for (const r of adminApi) if (!adminRoutes.includes(r)) problems.push(`security/admin-paths.json lists ${r}, which does not call requireAdmin`);
report(`api-auth (${files.length} routes)`, problems);
