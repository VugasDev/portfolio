import { getProjects, getCaseStudies, hasDetailPage } from './projects';
import { publishedBlog, publishedGuides } from './translations';

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
  { slug: 'en-blog',   title: 'Notes from the Lab', kicker: 'LOG' },
  { slug: 'en-guides', title: 'Guides',             kicker: 'GUIDES' },
  { slug: 'cv',       title: 'Auf einen Blick',    kicker: 'FÜR ARBEITGEBER' },
  { slug: 'en',          title: 'Homelab · Self-Hosting · AI Agents', kicker: 'VUGAS.DE / UNIT-01' },
  { slug: 'en-about',    title: 'Operator',      kicker: 'OPERATOR' },
  { slug: 'en-projects', title: 'What I build',  kicker: 'PROJECTS' },
  { slug: 'en-cv',       title: 'At a glance',   kicker: 'FOR EMPLOYERS' },
  { slug: 'impressum',   title: 'Impressum',   kicker: 'LEGAL' },
  { slug: 'datenschutz', title: 'Datenschutz', kicker: 'LEGAL' },
];

async function projectEntries(prefix: string, lang: 'de' | 'en'): Promise<OgEntry[]> {
  const [caseStudies, projects] = await Promise.all([getCaseStudies(lang), getProjects(lang)]);
  const studySlugs = new Set(caseStudies.map(c => c.id));
  return [
    ...caseStudies.map(c => ({ slug: `${prefix}projects-${c.id}`, title: c.data.title, kicker: 'CASE STUDY' })),
    ...projects
      .filter(p => !studySlugs.has(p.id) && hasDetailPage(p, studySlugs))
      .map(p => ({ slug: `${prefix}projects-${p.id}`, title: p.data.name, kicker: 'PROJECT' })),
  ];
}

export async function getAllOgEntries(): Promise<OgEntry[]> {
  const [{ de: blog, en: blogEn }, { de: guides, en: guidesEn }, projectsDe, projectsEn] = await Promise.all([
    publishedBlog(),
    publishedGuides(),
    projectEntries('', 'de'),
    projectEntries('en-', 'en'),
  ]);
  return [
    ...STATIC_PAGES,
    ...blog.map(p => ({ slug: `blog-${p.id}`, title: p.data.title, kicker: 'LOG' })),
    ...guides.map(g => ({ slug: `guides-${g.id}`, title: g.data.title, kicker: 'GUIDES' })),
    ...blogEn.map(p => ({ slug: `en-blog-${p.id}`, title: p.data.title, kicker: 'LOG' })),
    ...guidesEn.map(g => ({ slug: `en-guides-${g.id}`, title: g.data.title, kicker: 'GUIDES' })),
    ...projectsDe,
    ...projectsEn,
  ];
}
