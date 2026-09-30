// Gate: the service worker only handles same-origin GETs, never /api/, has no hand-written cache version
// (the name comes from the build id in its URL), and keeps the legacy-origin kill-switch.
import { read, report } from '../lib.mjs';

const s = read('public/service-worker.js'), code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), problems = [];
if (!/method\s*!==\s*["']GET["']/.test(code)) problems.push('no same-method check: only GET may be handled');
if (!/origin\s*!==\s*self\.location\.origin/.test(code)) problems.push('no same-origin check: cross-origin requests must not be handled');
if (!/startsWith\(\s*["']\/api\/["']\s*\)\)?\s*return false/.test(code)) problems.push('/api/ requests are not excluded');
if (/["'`][^"'`]*\/api\/[^"'`]*["'`]/.test(code.replace(/startsWith\(\s*["']\/api\/["']\s*\)/g, ''))) problems.push('the service worker handles /api/ URLs');
if (/CACHE_NAME\s*=\s*["'`]/.test(code) || /caches\.open\(\s*["'`]/.test(code)) problems.push('a hand-written cache name remains; derive it from the build id');
if (!/searchParams/.test(code) || !/\.get\(\s*["']v["']\s*\)/.test(code)) problems.push('the cache name is not derived from the ?v= build id');
if (!/registration\.unregister\(\)/.test(code) || !/legacy/.test(code)) problems.push('the legacy-origin kill-switch is missing');
if (/cache\.put\(\s*req\s*,/.test(code) && !/res\.ok\s*&&\s*res\.type\s*===\s*["']basic["']/.test(code)) problems.push('responses are cached without checking res.ok && res.type === "basic"');
const app = read('pages/_app.js');
if (!/service-worker\.js\?v=/.test(app)) problems.push('pages/_app.js does not register the service worker with ?v=<build id>');
report('sw', problems);
