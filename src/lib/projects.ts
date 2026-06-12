import { getCollection, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'projects'>;

/** Slugs aller veröffentlichten Case Studies. */
export async function getCaseStudySlugs(): Promise<Set<string>> {
  const studies = await getCollection('caseStudies', ({ data }) => !data.draft);
  return new Set(studies.map(s => s.id));
}

/** Detailseite nur bei Substanz: Case Study, Markdown-body oder GitHub-/Live-Link. */
export function hasDetailPage(p: Project, studySlugs: Set<string>): boolean {
  return studySlugs.has(p.id) || !!p.body?.trim() || !!p.data.github || !!p.data.url;
}

export function detailHref(p: Project, studySlugs: Set<string>): string | undefined {
  return hasDetailPage(p, studySlugs) ? `/projects/${p.id}` : undefined;
}
