// pdf/test/export-projects.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProjects } from '../export-projects.mjs';

test('loads + sorts projects by order with required fields', () => {
  const projects = loadProjects(new URL('../../src/content/projects/', import.meta.url).pathname);
  assert.ok(projects.length >= 12, 'expects all project entries');
  // sorted ascending by order
  for (let i = 1; i < projects.length; i++) assert.ok(projects[i].order >= projects[i - 1].order);
  const p = projects[0];
  for (const k of ['title', 'tagline', 'order', 'stack', 'metrics', 'role']) assert.ok(k in p, `missing ${k}`);
  // every metric has a source (claims-ledger discipline)
  for (const m of p.metrics) assert.ok(m.source && m.source.length > 0, 'metric missing source');
});
