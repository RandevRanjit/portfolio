// pdf/export-projects.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

export function loadProjects(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => matter(readFileSync(join(dir, f), 'utf8')).data)
    .sort((a, b) => a.order - b.order);
}

// CLI: write JSON for Typst
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = join(here, '..', 'src', 'content', 'projects');
  const out = join(here, 'data');
  mkdirSync(out, { recursive: true });
  const projects = loadProjects(src);
  writeFileSync(join(out, 'projects.json'), JSON.stringify({ projects }, null, 2));
  console.log(`wrote ${projects.length} projects -> pdf/data/projects.json`);
}
