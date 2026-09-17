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

What it does **not** cover: the KPI report tabs (Benchmarks, Clearance,
Click & Collect, Mobility) only get exercised in their empty state here —
seeding realistic report data for all of them would mean maintaining a
synthetic fixture in lockstep with shapes that have changed often (see
`kyiv1-kpi-update`). A change to one of those render functions still needs
the same kind of manual headless check (real data, via a Firestore anon
token) this test suite was built to reduce, not eliminate, for that
specific slice.
