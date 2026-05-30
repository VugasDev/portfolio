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
    expect.arrayContaining(['/', '/projects', '/blog', '/guides', '/about']),
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
