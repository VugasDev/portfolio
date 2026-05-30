// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import readingTime from 'reading-time';
import { toString as mdastToString } from 'mdast-util-to-string';
import rehypeMermaid from 'rehype-mermaid';

/** Remark plugin: attach reading-time to frontmatter at build time */
function remarkReadingTime() {
  return function (tree, { data }) {
    const text  = mdastToString(tree);
    const stats = readingTime(text);
    data.astro.frontmatter.minutesRead = Math.max(1, Math.round(stats.minutes));
    data.astro.frontmatter.wordCount   = stats.words;
  };
}

export default defineConfig({
  site: 'https://vugas.de',
  integrations: [mdx(), sitemap({ filter: (page) => !page.includes('/og/') })],
  markdown: {
    remarkPlugins: [remarkReadingTime],
    rehypePlugins: [[rehypeMermaid, { strategy: 'inline-svg' }]],
    syntaxHighlight: { type: 'shiki', excludeLangs: ['mermaid'] },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
