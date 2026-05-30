import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { a11yBaseline } from './a11y-baseline';

// Hauptseiten — statische/Index-Routen.
const PAGES = ['/', '/about', '/projects', '/blog', '/guides'];

// Gate-Schwelle: nur echte Blocker zählen.
const BLOCKING_IMPACTS = ['critical', 'serious'];

for (const path of PAGES) {
  test(`a11y: ${path} keine neuen critical/serious Violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();

    const blocking = results.violations.filter(
      v => v.impact && BLOCKING_IMPACTS.includes(v.impact),
    );
    const nonBlocking = results.violations.filter(
      v => !v.impact || !BLOCKING_IMPACTS.includes(v.impact),
    );

    // Baseline: bekannte, bewusst tolerierte Verstöße für diese Seite.
    const baseline = a11yBaseline[path] ?? [];
    const knownDebt = blocking.filter(v => baseline.includes(v.id));
    const regressions = blocking.filter(v => !baseline.includes(v.id));

    if (knownDebt.length > 0) {
      console.log(
        `[a11y][${path}] ${knownDebt.length} bekannt (baseline, toleriert):`,
        knownDebt.map(v => `${v.id} (${v.impact}, ${v.nodes.length} Knoten)`).join(', '),
      );
    }
    if (nonBlocking.length > 0) {
      console.log(
        `[a11y][${path}] ${nonBlocking.length} non-blocking:`,
        nonBlocking.map(v => `${v.id} (${v.impact})`).join(', '),
      );
    }

    // Nur Verstöße außerhalb der Baseline brechen das Gate.
    expect(
      regressions,
      `NEUE (nicht-baseline) critical/serious a11y Violations auf ${path}:\n` +
        regressions.map(v => `- ${v.id}: ${v.help} (${v.nodes.length} Knoten)`).join('\n'),
    ).toEqual([]);
  });
}
