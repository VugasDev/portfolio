import { test, expect } from '@playwright/test';

// Alle veröffentlichten Case Studies (Cortex/MCP-Stack 2026-10 entfernt, Cortex steht im Blogpost ki-setup-drei-anlaeufe).
const SLUGS = ['mediastack', 'netzwerk-upgrade', 'firewall', 'ccna-lernplattform', 'dns-schulung'];
const BASE = 'https://vugas.de';

for (const slug of SLUGS) for (const prefix of ['', '/en']) {
  test(`Case-Study ${prefix}/projects/${slug}: rendert + Mermaid-SVG + SEO`, async ({ page }) => {
    const res = await page.goto(`${prefix}/projects/${slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();

    // build-time Mermaid -> inline-SVG vorhanden
    await expect(page.locator('article svg').first()).toBeVisible();

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe(`${BASE}${prefix}/projects/${slug}/`);

    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toBe(`${BASE}/og/${prefix ? 'en-' : ''}projects-${slug}.png`);
    expect((await page.request.get(og!.replace(BASE, ''))).status()).toBe(200);

    expect(await page.locator('meta[name="twitter:card"]').getAttribute('content'))
      .toBe('summary_large_image');
  });
}

test('Projekt-Detailseite /projects/minecraft-modpack: rendert + GitHub-Link + SEO', async ({ page }) => {
  const res = await page.goto('/projects/minecraft-modpack');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();

  // GitHub-Link wohnt auf der Detailseite (nicht mehr auf der Karte)
  await expect(page.locator('a[href="https://github.com/VugasDev/gaia-awakening"]').first()).toBeVisible();

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toBe(`${BASE}/projects/minecraft-modpack/`);

  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(og).toBe(`${BASE}/og/projects-minecraft-modpack.png`);
});

test('Projekt-Cards verlinken auf die Detailseiten', async ({ page }) => {
  await page.goto('/projects');
  const hrefs = await page.locator('a[href^="/projects/"]').evaluateAll(els =>
    els.map(e => e.getAttribute('href')),
  );
  expect(hrefs).toEqual(
    expect.arrayContaining([
      '/projects/mediastack', '/projects/netzwerk-upgrade', '/projects/firewall',
      '/projects/ccna-lernplattform', '/projects/minecraft-modpack',
    ]),
  );
});
