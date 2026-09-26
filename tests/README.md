# Tests

`smoke.mjs` is a headless Playwright pass over `index.html`, run
automatically on every push/PR by `.github/workflows/test.yml`. It replaces
the manual "load it in a headless browser and check for console errors"
pass that used to happen by hand before shipping any change.

What it does:
- Swaps `index.html`'s real Firebase imports for `tests/fbstub/` (an
  in-memory stand-in — no network, no real Firestore project touched).
- Seeds nothing, so the app falls back to its own built-in
  `DEFAULT_USERS`/`DEFAULT_STORES`/`DEFAULT_ZONES`/`ADMIN_DEFAULT_PASSWORD`
  constants — the same thing a genuinely empty Firestore project would show.
- Logs in as both a manager and the admin, clicks every top-level tab,
  every KPI subtab, every Vacancies subtab, and opens the main modals
  (own-password, add-vacancy, admin panel).
- Fails if any of that produces a `console.error` or an uncaught page
  error.

Run it locally:

```bash
npm ci
npx playwright install chromium   # skip if already installed
npm test
```

It then opens a second, separately-seeded browser context (`KPI_SEED_*`
constants near the top of the file, `window.__SEED__` — see
`tests/fbstub/firebase-firestore.js`) and drives all 7 "Звіти та
показники" subtabs (Використання 7-го коду, Комплексні продажі, Click &
Collect, Енерджи, Мобіліті, Розпродаж, Швидкі показники) with two
realistic periods each, asserting the populated-data markup actually
rendered (`#kpi-subtab-content .empty-state` must be absent) — not just
"no console errors", which the empty-state fallback would also satisfy.
This closes what used to be this suite's one documented scope gap: those
report render functions (`renderKpiBenchmarkCard`,
`renderKpiMobilityCard`, `renderKpiClearanceCard`,
`renderKpiClickCollectCard`) previously only ran against an empty
Firestore project here, and a real regression in their populated-data path
needed a one-off manual QA script to catch. If a report's shape changes
(see `kyiv1-kpi-update`), update the matching `KPI_SEED_*` constant to
match — `node --check tests/smoke.mjs` plus a normal `npm test` run will
tell you if the fixture and the render code have drifted apart.
