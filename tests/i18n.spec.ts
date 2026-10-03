import { test, expect } from '@playwright/test';

const BASE = 'https://vugas.de';

for (const section of ['blog', 'guides'] as const) {
  test(`/en/${section}: jede englische Seite rendert, mit hreflang in beide Richtungen`, async ({ page, request }) => {
    const res = await page.goto(`/en/${section}`);
    expect(res?.status()).toBe(200);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');

    const enLinks = await page.locator(`main a[href^="/en/${section}/"]`).evaluateAll(els =>
      Array.from(new Set(els.map(e => e.getAttribute('href')!.replace(/\/?$/, '/')))),
    );
    expect(enLinks.length).toBeGreaterThan(0);

    for (const href of enLinks) {
      const r = await page.goto(href);
      expect(r?.status(), `Status für ${href}`).toBe(200);
      expect(await page.locator('html').getAttribute('lang'), `lang auf ${href}`).toBe('en');
      await expect(page.locator('nav.toc')).not.toContainText('Auf dieser Seite');

      const de = await page.locator('link[rel="alternate"][hreflang="de"]').getAttribute('href');
      const en = await page.locator('link[rel="alternate"][hreflang="en"]').getAttribute('href');
      expect(en).toBe(`${BASE}${href}`);
      expect(de).toBe(`${BASE}${href.replace(/^\/en/, '')}`);

      // Sprachwechsel führt auf die deutsche Fassung, und die verweist zurück.
      const switchHref = await page.locator('[data-lang-switch]').first().getAttribute('href');
      expect((await request.get(switchHref!)).status()).toBe(200);
      await page.goto(switchHref!);
      expect(await page.locator('[data-lang-switch]').first().getAttribute('href')).toBe(href);
    }
  });

  test(`/${section}: jeder veröffentlichte deutsche Beitrag hat eine englische Fassung`, async ({ page, request }) => {
    await page.goto(`/${section}`);
    const deLinks = await page.locator(`main a[href^="/${section}/"]`).evaluateAll(els =>
      Array.from(new Set(els.map(e => e.getAttribute('href')!.replace(/\/?$/, '/')))),
    );
    expect(deLinks.length).toBeGreaterThan(0);
    for (const href of deLinks) {
      const r = await request.get(`/en${href}`);
      expect(r.status(), `englische Fassung für ${href} fehlt`).toBe(200);
    }
  });
}
