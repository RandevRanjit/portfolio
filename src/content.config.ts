// src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    order: z.number(),
    buckets: z.array(z.enum(['hardware', 'systems', 'control', 'graphics'])),
    section: z.enum(['quant', 'drones', 'motorsport', 'music', 'other']),
    lineage: z.array(z.object({ note: z.string(), slug: z.string() })).default([]),
    stack: z.array(z.string()),
    metrics: z.array(z.object({ label: z.string(), value: z.string(), source: z.string() })),
    role: z.string(),
    status: z.enum(['working', 'case-study', 'archived']),
    repo: z.object({ kind: z.enum(['public', 'private', 'case-study']), url: z.string().optional() }),
    images: z.array(z.object({ src: z.string(), alt: z.string(), caption: z.string().optional() })).default([]),
    dates: z.string(),
  }),
});

export const collections = { projects };
