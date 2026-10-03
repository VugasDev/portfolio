// Zweisprachigkeit: Deutsch ist die Hauptsprache (Pfade ohne Präfix), Englisch liegt unter /en/...
// Zweisprachig sind Startseite, Projekte, Blog, Guides, About und CV; Impressum und Datenschutz
// bleiben rein deutsch.
export type Lang = 'de' | 'en';

export const LANGS: Lang[] = ['de', 'en'];

/** Pfad einer Seite in der gewünschten Sprache ('/' wird zu '/en'). */
export function localePath(lang: Lang, path: string): string {
  if (lang === 'de') return path;
  return path === '/' ? '/en' : `/en${path}`;
}

/** Sprachfassungen einer zweisprachigen Seite, für hreflang und den Sprachumschalter. */
export function bothLangs(path: string): { lang: Lang; href: string }[] {
  // Startseite: /en/ mit Slash, passend zur Canonical-URL des statischen Builds.
  return [{ lang: 'de', href: path }, { lang: 'en', href: path === '/' ? '/en/' : localePath('en', path) }];
}

const statusEn: Record<string, string> = {
  aktiv: 'active',
  'in Arbeit': 'in progress',
  Planung: 'planned',
  archiviert: 'archived',
};

export function statusLabel(value: string, lang: Lang): string {
  return lang === 'en' ? statusEn[value] ?? value : value;
}

export function formatDate(date: Date, lang: Lang, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE', opts);
}

const difficultyEn: Record<string, string> = {
  Einsteiger: 'Beginner',
  Fortgeschritten: 'Intermediate',
  Experte: 'Expert',
};

export function difficultyLabel(value: string, lang: Lang): string {
  return lang === 'en' ? difficultyEn[value] ?? value : value;
}

export const t = {
  de: {
    switchLabel: 'Read in English',
    blogDescription: 'Posts über Homelab, Self-Hosting und AI Agents.',
    blogLead: 'Was funktioniert, was nicht, und warum. Manchmal ein Sprint, manchmal ein Essay.',
    guidesDescription: 'Anleitungen für Self-Hosting, Homelab und AI.',
    guidesLead: 'Anleitungen zu Setups, die ich selbst betreibe — getestet, dokumentiert, reproduzierbar.',
    chapters: 'Kapitel',
    chapter: 'Kapitel',
    indexSwitch: 'English version',
  },
  en: {
    switchLabel: 'Auf Deutsch lesen',
    blogDescription: 'Posts about homelab, self-hosting and AI agents.',
    blogLead: 'What works, what doesn’t, and why. Sometimes a sprint, sometimes an essay.',
    guidesDescription: 'Guides for self-hosting, homelab and AI.',
    guidesLead: 'Guides to setups I run myself — tested, documented, reproducible.',
    chapters: 'Chapters',
    chapter: 'Chapter',
    indexSwitch: 'Deutsche Fassung',
  },
} as const;
