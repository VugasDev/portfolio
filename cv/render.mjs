// Rendert die Web-Fassungen des Lebenslaufs (DE + EN) als PDF für vugas.de/cv und /en/cv.
// Aufruf aus dem Repo-Root: node cv/render.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const downloads = path.join(dir, '..', 'public', 'downloads');
const jobs = [
  ['lebenslauf-web.html', 'Lebenslauf_Lars_Stuhlmacher.pdf'],
  ['lebenslauf-web.en.html', 'Resume_Lars_Stuhlmacher.pdf'],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, pdf] of jobs) {
  const out = path.join(downloads, pdf);
  await page.goto('file://' + path.join(dir, src), { waitUntil: 'networkidle' });
  await page.pdf({ path: out, format: 'A4', preferCSSPageSize: true, printBackground: true });
  console.log('geschrieben:', out);
}
await browser.close();
