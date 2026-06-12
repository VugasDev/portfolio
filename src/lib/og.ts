import { getCollection } from 'astro:content';
import { hasDetailPage } from './projects';

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
  { slug: 'impressum',   title: 'Impressum',   kicker: 'LEGAL' },
  { slug: 'datenschutz', title: 'Datenschutz', kicker: 'LEGAL' },
];

export async function getAllOgEntries(): Promise<OgEntry[]> {
  const [blog, guides, caseStudies, projects] = await Promise.all([
    getCollection('blog', ({ data }) => !data.draft),
    getCollection('guides', ({ data }) => !data.draft),
    getCollection('caseStudies', ({ data }) => !data.draft),
    getCollection('projects'),
  ]);
  const studySlugs = new Set(caseStudies.map(c => c.id));
  return [
    ...STATIC_PAGES,
    ...blog.map(p => ({ slug: `blog-${p.id}`, title: p.data.title, kicker: 'LOG' })),
    ...guides.map(g => ({ slug: `guides-${g.id}`, title: g.data.title, kicker: 'GUIDES' })),
    ...caseStudies.map(c => ({ slug: `projects-${c.id}`, title: c.data.title, kicker: 'CASE STUDY' })),
    ...projects
      .filter(p => !studySlugs.has(p.id) && hasDetailPage(p, studySlugs))
      .map(p => ({ slug: `projects-${p.id}`, title: p.data.name, kicker: 'PROJECT' })),
  ];
}
