import { test, expect } from '@playwright/test';

test('Startseite lädt mit sichtbarem Heading', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();
});

test('alle internen Nav-Links rendern eine Zielseite', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.locator('nav a[href^="/"]').evaluateAll(els =>
    Array.from(new Set(els.map(e => e.getAttribute('href')!))),
  );
  expect(hrefs).toEqual(
    expect.arrayContaining(['/', '/projects', '/blog', '/guides', '/about', '/cv']),
  );
  for (const href of hrefs) {
    const res = await page.goto(href);
    expect(res?.status(), `Status für ${href}`).toBe(200);
    await expect(page.locator('h1').first(), `h1 auf ${href}`).toBeVisible();
    await expect(page).not.toHaveTitle(/not found/i);
  }
});

test('Projektübersicht rendert alle Projekt-Cards', async ({ page }) => {
  await page.goto('/projects');
  const totalText = await page.locator('dl.stat', { hasText: 'Total' })
    .locator('dd').innerText();
  const expectedCount = parseInt(totalText.trim(), 10);
  expect(expectedCount).toBeGreaterThan(0);
  await expect(page.locator('article.card')).toHaveCount(expectedCount);
});

test('jede Blog-Detailseite rendert', async ({ page }) => {
  await page.goto('/blog');
  const hrefs = await page.locator('a[href^="/blog/"]').evaluateAll(els =>
    Array.from(new Set(els.map(e => e.getAttribute('href')!))),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const res = await page.goto(href);
    expect(res?.status(), `Status für ${href}`).toBe(200);
    await expect(page.locator('article'), `article auf ${href}`).toBeVisible();
    await expect(page.locator('h1').first(), `h1 auf ${href}`).toBeVisible();
  }
});

test('jede Guide-Detailseite rendert', async ({ page }) => {
  await page.goto('/guides');
  const hrefs = await page.locator('a[href^="/guides/"]').evaluateAll(els =>
    Array.from(new Set(els.map(e => e.getAttribute('href')!))),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const res = await page.goto(href);
    expect(res?.status(), `Status für ${href}`).toBe(200);
    await expect(page.locator('h1').first(), `h1 auf ${href}`).toBeVisible();
  }
});

test('unbekannte URL rendert die 404-Seite', async ({ page }) => {
  const res = await page.goto('/diese-route-existiert-nicht-xyz');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('404').first()).toBeVisible();
  await expect(page.locator('h1')).toContainText(/not found/i);
});

for (const path of ['/cv', '/en/cv']) test(`Arbeitgeber-Seite ${path}: Lebenslauf-PDF erreichbar, Belege ohne tote Links`, async ({ page, request }) => {
  const res = await page.goto(path);
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();

  const pdf = await page.locator('a[download]').first().getAttribute('href');
  const pdfRes = await request.get(pdf!);
  expect(pdfRes.status()).toBe(200);
  expect((await pdfRes.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const internal = await page.locator('main a[href^="/"]:not([download])').evaluateAll(els =>
    Array.from(new Set(els.map(e => e.getAttribute('href')!))),
  );
  for (const href of internal) {
    const r = await request.get(href);
    expect(r.status(), `Status für ${href}`).toBe(200);
  }
});

for (const prefix of ['', '/en']) test(`Status-Panel ${prefix || '/'}: Zahlen entsprechen den Übersichtsseiten`, async ({ page }) => {
  await page.goto(prefix || '/');
  const stat = async (key: string) => Number(await page.locator(`[data-stat="${key}"] span`).nth(1).textContent());
  const [projects, log, guides] = [await stat('projects'), await stat('log'), await stat('guides')];

  await page.goto(`${prefix}/projects`);
  expect(await page.locator('main article h3').count()).toBe(projects);
  await page.goto(`${prefix}/blog`);
  const posts = await page.locator(`main a[href^="${prefix}/blog/"]`).evaluateAll(els => new Set(els.map(e => e.getAttribute('href'))).size);
  expect(posts).toBe(log);
  await page.goto(`${prefix}/guides`);
  const gs = await page.locator(`main a[href^="${prefix}/guides/"]`).evaluateAll(els => new Set(els.map(e => e.getAttribute('href'))).size);
  expect(gs).toBe(guides);
});
