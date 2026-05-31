// scripts/consistency-check.mjs — the portfolio CONSISTENCY CONTRACT.
// An automated brand/structure linter: flags the kinds of drift that look
// fine in isolation but break consistency across the site (heading levels,
// metric overflow, un-highlightable code fences, dangling lineage/section/
// engine references, duplicate orders, missing frontmatter).
//
// Run:  npm run consistency        (exit 1 if any ERROR-severity check fails)
//
// Add a check here whenever a new "looks inconsistent" bug is found, so it
// can never silently come back.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PROJ_DIR = join(ROOT, 'src', 'content', 'projects');
const SECTIONS_TS = join(ROOT, 'src', 'data', 'sections.ts');
const ENGINES_TS = join(ROOT, 'src', 'lib', 'ascii-engines.ts');

const SECTION_IDS = ['quant', 'drones', 'motorsport', 'music', 'other'];
const REQUIRED_FM = ['title', 'tagline', 'order', 'section', 'buckets', 'stack', 'metrics', 'role', 'status', 'repo', 'dates'];
// languages Astro's bundled Shiki highlights (others fall back to plaintext)
const SAFE_FENCE_LANGS = new Set([
  '', 'text', 'txt', 'verilog', 'glsl', 'python', 'py', 'rust', 'rs', 'cpp', 'c',
  'bash', 'sh', 'shell', 'ts', 'typescript', 'js', 'javascript', 'jsx', 'tsx',
  'json', 'toml', 'yaml', 'yml', 'diff', 'html', 'css', 'md', 'markdown', 'sql',
]);
const METRIC_VALUE_MAX = 26;  // chars — longer values risk overflowing a chip
const TAGLINE_MIN = 40;
const TAGLINE_MAX = 340;

// ── load projects ────────────────────────────────────────────────────────────
const files = readdirSync(PROJ_DIR).filter((f) => f.endsWith('.md'));
const projects = files.map((f) => {
  const raw = readFileSync(join(PROJ_DIR, f), 'utf8');
  const { data, content } = matter(raw);
  return { slug: f.replace(/\.md$/, ''), file: `src/content/projects/${f}`, data, content };
});
const projectSlugs = new Set(projects.map((p) => p.slug));

const sectionsSrc = existsSync(SECTIONS_TS) ? readFileSync(SECTIONS_TS, 'utf8') : '';
const enginesSrc = existsSync(ENGINES_TS) ? readFileSync(ENGINES_TS, 'utf8') : '';

// slugs referenced inside sections.ts `slugs: [...]` arrays
const sectionSlugRefs = new Set();
for (const m of sectionsSrc.matchAll(/slugs:\s*\[([^\]]*)\]/g)) {
  for (const s of m[1].matchAll(/['"]([a-z0-9-]+)['"]/g)) sectionSlugRefs.add(s[1]);
}
// engine keys defined in ascii-engines.ts (quoted map keys + _default)
const engineKeys = new Set();
for (const m of enginesSrc.matchAll(/^\s*['"]([a-z0-9-]+)['"]\s*:/gm)) engineKeys.add(m[1]);
const hasDefaultEngine = /(^|\s)_default\s*:/.test(enginesSrc);

// ── check registry ───────────────────────────────────────────────────────────
const results = [];
function check(id, severity, fn) {
  const violations = [];
  fn((location, detail) => violations.push({ location, detail }));
  results.push({ id, severity, violations });
}

// 1. heading levels — all project section headings must be h2 (##), never ###/####
check('heading-level-h2', 'error', (flag) => {
  for (const p of projects) {
    for (const line of p.content.split('\n')) {
      const m = /^(#{3,})\s+(.*)/.exec(line);
      if (m) flag(p.file, `"${m[2].slice(0, 40)}" is h${m[1].length} — section headings must be h2 (##)`);
    }
  }
});

// 2. required frontmatter fields present
check('frontmatter-required', 'error', (flag) => {
  for (const p of projects) {
    for (const key of REQUIRED_FM) {
      if (p.data[key] === undefined || p.data[key] === null) flag(p.file, `missing frontmatter: ${key}`);
    }
    if (Array.isArray(p.data.stack) && p.data.stack.length === 0) flag(p.file, 'stack is empty');
    if (Array.isArray(p.data.metrics) && p.data.metrics.length === 0) flag(p.file, 'metrics is empty');
    if (p.data.repo && !p.data.repo.kind) flag(p.file, 'repo.kind missing');
  }
});

// 3. section is one of the 5 valid ids
check('section-valid', 'error', (flag) => {
  for (const p of projects) {
    if (p.data.section && !SECTION_IDS.includes(p.data.section)) flag(p.file, `section "${p.data.section}" not in ${SECTION_IDS.join('|')}`);
  }
});

// 4. order values are unique
check('order-unique', 'error', (flag) => {
  const seen = new Map();
  for (const p of projects) {
    const o = p.data.order;
    if (seen.has(o)) flag(p.file, `order ${o} duplicates ${seen.get(o)}`);
    else seen.set(o, p.slug);
  }
});

// 5. metric values short enough to not overflow a chip
check('metric-value-length', 'warn', (flag) => {
  for (const p of projects) {
    for (const m of p.data.metrics ?? []) {
      if (typeof m.value === 'string' && m.value.length > METRIC_VALUE_MAX) {
        flag(p.file, `metric value "${m.value}" is ${m.value.length} chars (> ${METRIC_VALUE_MAX})`);
      }
    }
  }
});

// 6. code-fence languages are highlightable (else silent plaintext fallback)
check('fence-lang-highlightable', 'error', (flag) => {
  for (const p of projects) {
    for (const m of p.content.matchAll(/^```([a-zA-Z0-9+#-]*)/gm)) {
      const lang = m[1].toLowerCase();
      if (!SAFE_FENCE_LANGS.has(lang)) flag(p.file, `code fence \`\`\`${m[1]} is not in Astro's Shiki bundle → renders as plaintext`);
    }
  }
});

// 7. lineage slugs resolve to a real project
check('lineage-resolves', 'error', (flag) => {
  for (const p of projects) {
    for (const l of p.data.lineage ?? []) {
      if (!projectSlugs.has(l.slug)) flag(p.file, `lineage → "${l.slug}" does not exist`);
    }
  }
});

// 8. sections.ts ↔ projects coverage
check('sections-coverage', 'error', (flag) => {
  for (const ref of sectionSlugRefs) {
    if (!projectSlugs.has(ref)) flag(SECTIONS_TS.replace(ROOT + '/', ''), `lists "${ref}" which has no project file`);
  }
});
check('sections-orphans', 'warn', (flag) => {
  for (const p of projects) {
    if (!sectionSlugRefs.has(p.slug)) flag(p.file, `not listed in any sections.ts group (unreachable via section pages)`);
  }
});

// 9. every project has a bespoke ASCII engine (no silent _default fallback)
check('ascii-engine-coverage', 'error', (flag) => {
  for (const p of projects) {
    if (!engineKeys.has(p.slug)) flag('src/lib/ascii-engines.ts', `no engine for "${p.slug}" → falls back to _default`);
  }
  if (!hasDefaultEngine) flag('src/lib/ascii-engines.ts', 'missing _default engine fallback');
});

// 10. tagline length within a consistent band
check('tagline-length', 'warn', (flag) => {
  for (const p of projects) {
    const t = String(p.data.tagline ?? '');
    if (t.length < TAGLINE_MIN) flag(p.file, `tagline only ${t.length} chars (< ${TAGLINE_MIN})`);
    if (t.length > TAGLINE_MAX) flag(p.file, `tagline ${t.length} chars (> ${TAGLINE_MAX})`);
  }
});

// ── report ───────────────────────────────────────────────────────────────────
let errors = 0, warns = 0;
console.log('\nCONSISTENCY CONTRACT — portfolio');
console.log('='.repeat(50));
for (const r of results) {
  const n = r.violations.length;
  if (n === 0) {
    console.log(`  ✓ ${r.id.padEnd(26)} ok`);
  } else {
    const tag = r.severity === 'error' ? '✗ ERROR' : '! warn ';
    console.log(`  ${tag} ${r.id.padEnd(26)} ${n} issue${n > 1 ? 's' : ''}`);
    for (const v of r.violations) console.log(`        - ${v.location}: ${v.detail}`);
    if (r.severity === 'error') errors += n; else warns += n;
  }
}
console.log('='.repeat(50));
console.log(`RESULT: ${errors} error${errors !== 1 ? 's' : ''}, ${warns} warning${warns !== 1 ? 's' : ''}  (${projects.length} projects checked)\n`);
process.exit(errors > 0 ? 1 : 0);
