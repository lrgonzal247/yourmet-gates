// Gate: no place where text becomes HTML or code, anywhere in the app source. Frozen at zero: a new one
// must be removed, or this gate changed on purpose in the owner's gates repo after review.
import { read, report, srcFiles } from '../lib.mjs';

const PATTERNS = {
  dangerouslySetInnerHTML: /dangerouslySetInnerHTML/g, innerHTML: /\.innerHTML\b/g, outerHTML: /\.outerHTML\b/g,
  insertAdjacentHTML: /insertAdjacentHTML/g, 'document.write': /document\.write/g, 'eval(': /(^|[^.\w])eval\s*\(/g,
  'new Function': /new\s+Function\s*\(/g, srcdoc: /\bsrcDoc\b|\bsrcdoc\b/g,
};
const problems = [];
const files = srcFiles();
for (const f of files) {
  const s = read(f);
  for (const [name, re] of Object.entries(PATTERNS)) {
    const n = (s.match(re) || []).length;
    if (n) problems.push(`${f}: ${name} x${n}`);
  }
}
report(`html sinks (${files.length} files)`, problems);
