import { getCollection } from 'astro:content';

// Englische Fassungen erscheinen nur, wenn sie selbst UND die deutsche Fassung veröffentlicht sind.
// So geht ein Beitrag nie zuerst auf Englisch live.

export async function publishedBlog() {
  const de = await getCollection('blog', ({ data }) => !data.draft);
  const deIds = new Set(de.map(p => p.id));
  const en = await getCollection('blogEn', ({ id, data }) => !data.draft && deIds.has(id));
  return { de, en, enIds: new Set(en.map(p => p.id)), deIds };
}

export async function publishedGuides() {
  const de = await getCollection('guides', ({ data }) => !data.draft);
  const deIds = new Set(de.map(g => g.id));
  const en = await getCollection('guidesEn', ({ id, data }) => !data.draft && deIds.has(id));
  return { de, en, enIds: new Set(en.map(g => g.id)), deIds };
}
