import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    difficulty: z.enum(['Einsteiger', 'Fortgeschritten', 'Experte']),
    tags: z.array(z.string()).default([]),
    order: z.number().nullish(),     // Für Serien: Kapitel-Reihenfolge (Decap schreibt null statt undefined)
    series: z.string().nullish().transform(v => v || undefined),   // Für Serien: Serie-Name (Decap schreibt '' statt undefined)
    draft: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/projects' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    details: z.string().optional(),   // README-Kurzfassung fürs Hover-Overlay
    tags: z.array(z.string()),
    status: z.enum(['aktiv', 'in Arbeit', 'Planung', 'archiviert']),
    github: z.string().url().optional(),
    url: z.string().url().optional(),
  }),
});

const caseStudies = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/case-studies' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    status: z.enum(['aktiv', 'in Arbeit', 'Planung', 'archiviert']),
    tags: z.array(z.string()).default([]),
    stack: z.array(z.string()).default([]),
    github: z.string().url().optional(),
    screenshots: z.array(z.object({ src: z.string(), alt: z.string() })).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog, guides, projects, caseStudies };
