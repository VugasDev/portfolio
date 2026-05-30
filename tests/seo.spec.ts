import { test, expect } from '@playwright/test';

const MAIN = ['/', '/about', '/projects', '/blog', '/guides'];
const BASE = 'https://vugas.de';

for (const path of MAIN) {
  test(`SEO-Tags auf ${path}`, async ({ page }) => {
    await page.goto(path);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    // Astro statischer Output erzeugt Trailing-Slash-Canonicals (/about/ statt /about)
    const expectedCanonical = BASE + path + (path === '/' ? '' : '/');
    expect(canonical).toBe(expectedCanonical);

    expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toBeTruthy();
    expect(await page.locator('meta[property="og:type"]').getAttribute('content')).toBeTruthy();

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toMatch(/^https:\/\/vugas\.de\/og\/.+\.png$/);

    expect(await page.locator('meta[name="twitter:card"]').getAttribute('content'))
      .toBe('summary_large_image');
  });
}

test('OG-Bild ist erreichbar und ein PNG', async ({ page }) => {
  await page.goto('/');
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  const localPath = new URL(ogImage!).pathname; // gegen den lokalen Preview testen
  const res = await page.request.get(localPath);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
});

test('JSON-LD Person auf der Startseite', async ({ page }) => {
  await page.goto('/');
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const parsed = blocks.map(b => JSON.parse(b));
  expect(parsed.some(o => o['@type'] === 'Person')).toBe(true);
});

test('JSON-LD BlogPosting auf einer Blog-Detailseite', async ({ page }) => {
  await page.goto('/blog');
  const href = await page.locator('a[href^="/blog/"]').first().getAttribute('href');
  await page.goto(href!);
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const parsed = blocks.map(b => JSON.parse(b));
  const posting = parsed.find(o => o['@type'] === 'BlogPosting');
  expect(posting).toBeTruthy();
  expect(posting.headline).toBeTruthy();
  expect(Number.isNaN(new Date(posting.datePublished).getTime())).toBe(false);
});
