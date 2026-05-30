import { getCollection } from 'astro:content';

export interface OgEntry {
  slug: string;
  title: string;
  kicker: string;
}

// Pfad -> flacher OG-Slug. Muss exakt mit getAllOgEntries übereinstimmen.
export function pathToOgSlug(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '');
  if (clean === '' || clean === '/') return 'index';
  return clean.replace(/^\//, '').replace(/\//g, '-');
}

const STATIC_PAGES: OgEntry[] = [
  { slug: 'index',    title: 'Homelab · Self-Hosting · AI Agents', kicker: 'VUGAS.DE / UNIT-01' },
  { slug: 'about',    title: 'Operator',           kicker: 'OPERATOR' },
  { slug: 'projects', title: 'What I build',       kicker: 'PROJECTS' },
  { slug: 'blog',     title: 'Notes from the Lab', kicker: 'LOG' },
  { slug: 'guides',   title: 'Guides',             kicker: 'GUIDES' },
];

export async function getAllOgEntries(): Promise<OgEntry[]> {
  const [blog, guides, caseStudies] = await Promise.all([
    getCollection('blog', ({ data }) => !data.draft),
    getCollection('guides', ({ data }) => !data.draft),
    getCollection('caseStudies', ({ data }) => !data.draft),
  ]);
  return [
    ...STATIC_PAGES,
    ...blog.map(p => ({ slug: `blog-${p.id}`, title: p.data.title, kicker: 'LOG' })),
    ...guides.map(g => ({ slug: `guides-${g.id}`, title: g.data.title, kicker: 'GUIDES' })),
    ...caseStudies.map(c => ({ slug: `projects-${c.id}`, title: c.data.title, kicker: 'CASE STUDY' })),
  ];
}
