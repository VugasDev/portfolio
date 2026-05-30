import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.resolve('node_modules/.cache/og-fonts');

export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 500;
  style: 'normal';
}

// Ohne User-Agent liefert die Google-Fonts-css2-API format('truetype') (.ttf),
// was satori benötigt. Mit Browser-UA käme woff2 — daher KEIN UA-Header setzen.
async function fetchTTF(cssUrl: string, cacheKey: string): Promise<Buffer> {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.ttf`);
  if (existsSync(cachePath)) return readFile(cachePath);

  const css = await fetch(cssUrl).then(r => {
    if (!r.ok) throw new Error(`OG-Font CSS-Fetch fehlgeschlagen (${r.status}): ${cssUrl}`);
    return r.text();
  });
  const ttfUrl = css.match(/url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
  if (!ttfUrl) throw new Error(`Keine TTF-URL in Google-Fonts-CSS gefunden: ${cssUrl}`);

  const data = Buffer.from(
    await fetch(ttfUrl).then(r => {
      if (!r.ok) throw new Error(`OG-Font TTF-Fetch fehlgeschlagen (${r.status}): ${ttfUrl}`);
      return r.arrayBuffer();
    }),
  );

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, data);
  return data;
}

export async function loadOgFonts(): Promise<OgFont[]> {
  const [display, mono] = await Promise.all([
    fetchTTF('https://fonts.googleapis.com/css2?family=Archivo+Black', 'archivo-black-400'),
    fetchTTF('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500', 'jetbrains-mono-500'),
  ]);
  return [
    { name: 'Archivo Black', data: display, weight: 400, style: 'normal' },
    { name: 'JetBrains Mono', data: mono, weight: 500, style: 'normal' },
  ];
}
