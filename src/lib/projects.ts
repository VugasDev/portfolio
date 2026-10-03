import { getCollection, type CollectionEntry } from 'astro:content';
import { localePath, type Lang } from './i18n';

export type Project = CollectionEntry<'projects'> | CollectionEntry<'projectsEn'>;
export type CaseStudy = CollectionEntry<'caseStudies'> | CollectionEntry<'caseStudiesEn'>;

/**
 * Projekte in der gewünschten Sprache. Englisch enthält nur Einträge, die es auch auf Deutsch
 * gibt (gleiche id), damit die beiden Verzeichnisse nicht auseinanderlaufen.
 */
export async function getProjects(lang: Lang): Promise<Project[]> {
  const de = await getCollection('projects');
  if (lang === 'de') return de;
  const deIds = new Set(de.map(p => p.id));
  return (await getCollection('projectsEn')).filter(p => deIds.has(p.id));
}

/** Veröffentlichte Case Studies; englische nur, wenn die deutsche ebenfalls veröffentlicht ist. */
export async function getCaseStudies(lang: Lang): Promise<CaseStudy[]> {
  const de = await getCollection('caseStudies', ({ data }) => !data.draft);
  if (lang === 'de') return de;
  const deIds = new Set(de.map(s => s.id));
  return getCollection('caseStudiesEn', ({ id, data }) => !data.draft && deIds.has(id));
}

/** Slugs aller veröffentlichten Case Studies. */
export async function getCaseStudySlugs(lang: Lang = 'de'): Promise<Set<string>> {
  return new Set((await getCaseStudies(lang)).map(s => s.id));
}

/** Detailseite nur bei Substanz: Case Study, Markdown-body oder GitHub-/Live-Link. */
export function hasDetailPage(p: Project, studySlugs: Set<string>): boolean {
  return studySlugs.has(p.id) || !!p.body?.trim() || !!p.data.github || !!p.data.url;
}

export function detailHref(p: Project, studySlugs: Set<string>, lang: Lang = 'de'): string | undefined {
  return hasDetailPage(p, studySlugs) ? localePath(lang, `/projects/${p.id}`) : undefined;
}

export interface DetailProps {
  study: CaseStudy | null;
  project: Project | null;
  /** Pfad der anderen Sprachfassung, falls es dort dieselbe Detailseite gibt. */
  altHref?: string;
}

async function detailSlugs(lang: Lang) {
  const studies = await getCaseStudies(lang);
  const studyBySlug = new Map(studies.map(s => [s.id, s]));
  const studySlugs = new Set(studyBySlug.keys());
  const entries = new Map<string, { study: CaseStudy | null; project: Project | null }>();
  for (const project of await getProjects(lang)) {
    if (!hasDetailPage(project, studySlugs)) continue;
    entries.set(project.id, { study: studyBySlug.get(project.id) ?? null, project });
  }
  // Case Studies ohne Projekt-Eintrag (Sicherheitsnetz, Verhalten wie bisher)
  for (const study of studies) {
    if (!entries.has(study.id)) entries.set(study.id, { study, project: null });
  }
  return entries;
}

/** Statische Pfade für /projects/[slug] bzw. /en/projects/[slug]. */
export async function projectDetailPaths(lang: Lang) {
  const own = await detailSlugs(lang);
  const other = await detailSlugs(lang === 'de' ? 'en' : 'de');
  const otherLang: Lang = lang === 'de' ? 'en' : 'de';
  return [...own].map(([slug, entry]) => ({
    params: { slug },
    props: {
      ...entry,
      altHref: other.has(slug) ? localePath(otherLang, `/projects/${slug}/`) : undefined,
    } satisfies DetailProps,
  }));
}
