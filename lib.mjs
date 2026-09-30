// Shared helpers for the Yourmet gates. A gate prints what is wrong and exits 1.
// Gates run from the app repo's root (the current directory), or from
// GATES_APP_ROOT when set. Nothing here reads or needs a secret.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve(process.env.GATES_APP_ROOT || process.cwd());
export const read = f => readFileSync(join(ROOT, f), 'utf8');
export const exists = f => existsSync(join(ROOT, f));
export const readJson = f => JSON.parse(read(f));

/** Print the result. Any problem fails the gate. */
export function report(name, problems) {
  if (problems.length) {
    console.error(`FAIL ${name}: ${problems.length} problem${problems.length > 1 ? 's' : ''}`);
    problems.forEach(p => console.error('  - ' + p));
    process.exit(1);
  }
  console.log(`ok   ${name}`);
}

const SKIP = new Set(['node_modules', '.git', '.next', '.open-next', '.wrangler']);
/** Every file under a folder (relative paths); missing folders give []. */
export function walk(dir) {
  if (!existsSync(join(ROOT, dir))) return [];
  return readdirSync(join(ROOT, dir)).flatMap(n => {
    if (SKIP.has(n)) return [];
    const f = join(dir, n);
    return statSync(join(ROOT, f)).isDirectory() ? walk(f) : [f];
  });
}

/** App source folders the code gates look at. */
export const SRC_DIRS = ['components', 'pages', 'lib', 'app', 'worker'];
export const srcFiles = (re = /\.(m?js|jsx|ts|tsx)$/) => SRC_DIRS.flatMap(d => walk(d)).filter(f => re.test(f));

/** JSON with // and /* comments and trailing commas (wrangler.jsonc). Strings are left alone. */
export function jsonc(text) {
  let out = '', i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') { const m = text.slice(i).match(/^"(?:\\.|[^"\\])*"/); out += m[0]; i += m[0].length; }
    else if (text.startsWith('//', i)) { while (i < text.length && text[i] !== '\n') i++; }
    else if (text.startsWith('/*', i)) { i = text.indexOf('*/', i + 2) + 2; }
    else { out += c; i++; }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/** Parse a Cloudflare _headers file into { pathPattern: { lower-case name: value } }. */
export function parseHeadersFile(text) {
  const rules = {};
  let cur = null;
  text.split('\n').forEach(l => {
    if (!l.trim() || l.trim().startsWith('#')) return;
    if (!/^\s/.test(l)) { cur = rules[l.trim()] = {}; return; }
    const m = l.trim().match(/^([^:]+):\s*(.*)$/); if (cur && m) cur[m[1].toLowerCase()] = m[2];
  });
  return rules;
}
