// Rendert die Web-Fassung des Lebenslaufs als PDF für vugas.de/cv.
// Aufruf aus dem Repo-Root: node cv/render.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '..', 'public', 'downloads', 'Lebenslauf_Lars_Stuhlmacher.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + path.join(dir, 'lebenslauf-web.html'), { waitUntil: 'networkidle' });
await page.pdf({ path: out, format: 'A4', preferCSSPageSize: true, printBackground: true });
await browser.close();
console.log('geschrieben:', out);
