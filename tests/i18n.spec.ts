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

// Seiten, die es in beiden Sprachen gibt: hreflang in beide Richtungen und ein Sprachumschalter
// in der Navigation, der auf die jeweils andere Fassung zeigt.
const PAGES = ['/', '/projects/', '/about/', '/cv/'];
for (const path of PAGES) {
  test(`${path} und /en${path}: zweisprachig verknüpft`, async ({ page }) => {
    const enPath = path === '/' ? '/en/' : `/en${path}`;
    for (const [self, other, lang] of [[path, enPath, 'de'], [enPath, path, 'en']] as const) {
      const r = await page.goto(self);
      expect(r?.status(), `Status für ${self}`).toBe(200);
      expect(await page.locator('html').getAttribute('lang')).toBe(lang);
      expect(await page.locator(`link[rel="alternate"][hreflang="${lang}"]`).getAttribute('href')).toBe(`${BASE}${self}`);
      expect(await page.locator(`link[rel="alternate"][hreflang="${lang === 'de' ? 'en' : 'de'}"]`).getAttribute('href')).toBe(`${BASE}${other}`);
      expect(await page.locator('[data-nav-lang-switch]').getAttribute('href')).toBe(other);
    }
  });
}

test('englische Seiten verlinken intern nur englische Seiten (außer Impressum/Datenschutz/Downloads)', async ({ page }) => {
  for (const path of ['/en', '/en/projects/', '/en/about/', '/en/cv/']) {
    await page.goto(path);
    const hrefs = await page.locator('a[href^="/"]:not([data-nav-lang-switch])').evaluateAll(els =>
      els.map(e => e.getAttribute('href')!),
    );
    const german = hrefs.filter(h => !/^\/(en(\/|$)|impressum|datenschutz|downloads\/|rss\.xml)/.test(h));
    expect(german, `deutsche Links auf ${path}`).toEqual([]);
  }
});

test('/projects: jedes Projekt hat eine englische Fassung', async ({ page }) => {
  await page.goto('/projects');
  const de = await page.locator('main article h3').count();
  await page.goto('/en/projects');
  expect(await page.locator('main article h3').count()).toBe(de);
  const enDetail = await page.locator('main a[href^="/en/projects/"]').evaluateAll(els =>
    Array.from(new Set(els.map(e => e.getAttribute('href')!))),
  );
  for (const href of enDetail) {
    const r = await page.goto(href);
    expect(r?.status(), `Status für ${href}`).toBe(200);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
  }
});

test('englischer RSS-Feed: nur englische Beitragslinks, gleiche Anzahl wie der deutsche', async ({ request }) => {
  const de = await (await request.get('/rss.xml')).text();
  const en = await (await request.get('/en/rss.xml')).text();
  expect(en).toContain('<language>en-gb</language>');
  const links = [...en.matchAll(/<link>([^<]+)<\/link>/g)].map(m => m[1]).filter(l => l.includes('/blog/'));
  expect(links.length).toBeGreaterThan(0);
  for (const l of links) expect(l).toContain(`${BASE}/en/blog/`);
  expect((en.match(/<item>/g) ?? []).length).toBe((de.match(/<item>/g) ?? []).length);
});

test('Sitemap verknüpft Sprachpaare per hreflang, rein deutsche Seiten ohne', async ({ request }) => {
  const xml = await (await request.get('/sitemap-0.xml')).text();
  expect(xml).toContain(`<loc>${BASE}/about/</loc><xhtml:link rel="alternate" hreflang="de-DE" href="${BASE}/about/"/><xhtml:link rel="alternate" hreflang="en-GB" href="${BASE}/en/about/"/>`);
  expect(xml).toContain(`<loc>${BASE}/impressum/</loc></url>`);
  expect(xml).not.toContain('/404');
});

test('englische 404-Seite', async ({ page }) => {
  await page.goto('/en/404/');
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
  await expect(page.locator('h1')).toContainText(/not found/i);
  expect(await page.locator('main a.btn-primary').getAttribute('href')).toBe('/en');
});
