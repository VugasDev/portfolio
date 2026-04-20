import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));

  console.log('Navigating to https://vugas.de/admin...');
  await page.goto('https://vugas.de/admin');
  
  await page.waitForLoadState('networkidle');
  console.log('Title:', await page.title());

  // Suche nach dem Login-Button
  const loginButton = page.locator('button:has-text("Sign in with GitHub")');
  if (await loginButton.count() > 0) {
    console.log('Login button found. Clicking...');
    // Wir klicken nicht wirklich, da wir kein echtes GitHub-Fenster handhaben wollen,
    // aber wir prüfen die Attribute.
    const buttonHtml = await loginButton.evaluate(el => el.outerHTML);
    console.log('Button HTML:', buttonHtml);
  } else {
    console.log('Login button NOT found. Checking body content...');
    const body = await page.innerText('body');
    console.log('Body snippet:', body.slice(0, 200));
  }

  await browser.close();
})();
