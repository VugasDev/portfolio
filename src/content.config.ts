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
    order: z.number().optional(),    // Für Serien: Kapitel-Reihenfolge
    series: z.string().optional(),   // Für Serien: Serie-Name
    draft: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/projects' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    status: z.enum(['aktiv', 'in Arbeit', 'Planung', 'archiviert']),
    github: z.string().url().optional(),
    url: z.string().url().optional(),
  }),
});

export const collections = { blog, guides, projects };
