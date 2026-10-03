import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Mehrsprachigkeit: Die deutsche Fassung liegt in <slug>.md, die englische daneben in
// <slug>.en.md (Sveltia-i18n "multiple_files"). Deutsche Collections schließen *.en.md aus,
// die englischen lesen nur diese; die id ist in beiden Fällen der Slug ohne Sprachkürzel.
const DE = ['**/*.md', '!**/*.en.md'];
const EN = '**/*.en.md';
const idWithoutLocale = ({ entry }: { entry: string }) => entry.replace(/(\.en)?\.mdx?$/, '');

const blogSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});

const blog = defineCollection({
  loader: glob({ pattern: DE, base: './src/content/blog', generateId: idWithoutLocale }),
  schema: blogSchema,
});

const blogEn = defineCollection({
  loader: glob({ pattern: EN, base: './src/content/blog', generateId: idWithoutLocale }),
  schema: blogSchema,
});

const guideSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),           // Veröffentlichungsdatum: steuert Featuring/Sortierung
  difficulty: z.enum(['Einsteiger', 'Fortgeschritten', 'Experte']),
  tags: z.array(z.string()).default([]),
  order: z.number().nullish(),     // Für Serien: Kapitel-Reihenfolge (Decap schreibt null statt undefined)
  series: z.string().nullish().transform(v => v || undefined),   // Für Serien: Serie-Name (Decap schreibt '' statt undefined)
  draft: z.boolean().default(false),
});

const guides = defineCollection({
  loader: glob({ pattern: DE, base: './src/content/guides', generateId: idWithoutLocale }),
  schema: guideSchema,
});

const guidesEn = defineCollection({
  loader: glob({ pattern: EN, base: './src/content/guides', generateId: idWithoutLocale }),
  schema: guideSchema,
});

const projectSchema = z.object({
  name: z.string(),
  description: z.string(),
  details: z.string().optional(),   // README-Kurzfassung fürs Hover-Overlay
  tags: z.array(z.string()).default([]),
  status: z.enum(['aktiv', 'in Arbeit', 'Planung', 'archiviert']),
  github: z.string().url().optional(),
  url: z.string().url().optional(),
});

const projects = defineCollection({
  loader: glob({ pattern: DE, base: './src/content/projects', generateId: idWithoutLocale }),
  schema: projectSchema,
});

const projectsEn = defineCollection({
  loader: glob({ pattern: EN, base: './src/content/projects', generateId: idWithoutLocale }),
  schema: projectSchema,
});

const caseStudySchema = z.object({
  title: z.string(),
  description: z.string(),
  status: z.enum(['aktiv', 'in Arbeit', 'Planung', 'archiviert']),
  tags: z.array(z.string()).default([]),
  stack: z.array(z.string()).default([]),
  github: z.string().url().optional(),
  screenshots: z.array(z.object({ src: z.string(), alt: z.string() })).default([]),
  draft: z.boolean().default(false),
});

const caseStudies = defineCollection({
  loader: glob({ pattern: ['**/*.mdx', '!**/*.en.mdx'], base: './src/content/case-studies', generateId: idWithoutLocale }),
  schema: caseStudySchema,
});

const caseStudiesEn = defineCollection({
  loader: glob({ pattern: '**/*.en.mdx', base: './src/content/case-studies', generateId: idWithoutLocale }),
  schema: caseStudySchema,
});

export const collections = { blog, blogEn, guides, guidesEn, projects, projectsEn, caseStudies, caseStudiesEn };
