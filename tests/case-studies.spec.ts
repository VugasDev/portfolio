import { test, expect } from '@playwright/test';

const SLUGS = ['mediastack', 'cortex', 'mcp-stack'];
const BASE = 'https://vugas.de';

for (const slug of SLUGS) {
  test(`Case-Study /projects/${slug}: rendert + Mermaid-SVG + SEO`, async ({ page }) => {
    const res = await page.goto(`/projects/${slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();

    // build-time Mermaid -> inline-SVG vorhanden
    await expect(page.locator('article svg').first()).toBeVisible();

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe(`${BASE}/projects/${slug}/`);

    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toBe(`${BASE}/og/projects-${slug}.png`);

    expect(await page.locator('meta[name="twitter:card"]').getAttribute('content'))
      .toBe('summary_large_image');
  });
}

test('Projekt-Cards verlinken auf die Case-Studies', async ({ page }) => {
  await page.goto('/projects');
  const hrefs = await page.locator('a[href^="/projects/"]').evaluateAll(els =>
    els.map(e => e.getAttribute('href')),
  );
  expect(hrefs).toEqual(
    expect.arrayContaining(['/projects/mediastack', '/projects/cortex', '/projects/mcp-stack']),
  );
});
