// Bekannte, bewusst tolerierte a11y-Schuld (Baseline, Stand 2026-05-30).
//
// Das a11y-Gate blockt nur NEUE serious/critical-Verstöße, deren Rule-ID hier
// NICHT für die jeweilige Seite gelistet ist. Bekannte Verstöße werden geloggt,
// aber toleriert, damit das Pre-Push-Gate nutzbar bleibt.
//
// TODO(a11y): `color-contrast` site-weit fixen (Punchlist „A11y" / „Dark-Mode
// konsistent") — gedämpfte Grautöne auf Fast-Schwarz erreichen WCAG-AA 4.5:1
// nicht. Sobald gefixt, die jeweiligen Einträge hier entfernen, damit das Gate
// wieder scharf greift.
export const a11yBaseline: Record<string, string[]> = {
  '/':         ['color-contrast'],
  '/about':    ['color-contrast'],
  '/projects': ['color-contrast'],
  '/blog':     ['color-contrast'],
  '/guides':   ['color-contrast'],
};
