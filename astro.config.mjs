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
    // Mermaid im Dark-Theme: dunkle Nodes + helle Labels — sonst rendert das
    // Default-Theme helle Nodes, deren Labels durch unsere Prose-Farben hell
    // werden (hell-auf-hell, unlesbar).
    rehypePlugins: [[rehypeMermaid, { strategy: 'inline-svg', mermaidConfig: { theme: 'dark' } }]],
    syntaxHighlight: { type: 'shiki', excludeLangs: ['mermaid'] },
    // github-dark-default: hellerer Kommentar-Token (#8b949e) — erfüllt AA auf
    // unserem dunklen Code-Hintergrund (#120E1C); das alte Default github-dark
    // hatte #6a737d → nur 3.94:1.
    shikiConfig: { theme: 'github-dark-default' },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
