import rss from '@astrojs/rss';
import { publishedBlog } from '../../lib/translations';

// Englischer Feed: nur Beiträge, deren englische UND deutsche Fassung veröffentlicht sind.
export async function GET(context) {
  const { en } = await publishedBlog();
  const posts = en.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: 'VUGAS.DE / LOG (English)',
    description: 'Notes from the Lab — homelab, self-hosting, AI agents.',
    site: context.site,
    items: posts.map(p => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: `/en/blog/${p.id}/`,
      categories: p.data.tags,
    })),
    customData: `<language>en-gb</language>`,
    stylesheet: false,
  });
}
