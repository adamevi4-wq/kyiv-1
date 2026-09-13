---
name: kyiv1-kpi-update
description: Load a new KPI update (screenshot or xlsx export) the district manager sends for one of the network-benchmark reports under "Звіти та показники" — Використання 7-го коду, Комплексні продажі, Енерджи, Click & Collect, Розпродажні залишки, or a brand-new report type — onto the Kyiv-1 dashboard (repo adamevi4-wq/kyiv-1). Use this whenever Adam sends a new period's data for one of these reports. Always append as a new period (never overwrite history), verify with a render check before shipping, and always reply in chat with a Ukrainian summary of his own district's stores vs the network — including explicit top/antitop callouts and dynamics vs the previous period.
---

# Kyiv-1 KPI updates — "Звіти та показники" network reports

The **"📊 Звіти та показники"** tab (`index.html`) holds a row of report
tabs (`KPI_SUBTABS`): **Використання 7-го коду**, **Комплексні продажі**,
**Click & Collect**, **Енерджи**, **Розпродаж**, plus **🚚 Доставки** (its
own skill, `kyiv1-deliveries-update`) and **Швидкі показники** (free-form
numbers, not covered here — those go straight into `kyiv1/kpi-reports` as
`{id, period, metrics:[{label,value}], note, addedAt}`).

Each network report already supports **history and dynamics out of the
box**: entries for the same report accumulate in one Firestore array, a row
of period buttons (`kpiPeriodSelectorHtml`) lets Adam pick any past period,
and every district/store row shows a small ▲/▼/• delta against the period
immediately before it (`kpiDeltaHtml`, matched by district name or store
code). **This means a routine update is a pure data append — read the
current array, add one new entry, write it back. No code change, no PR,
no site redeploy needed**, exactly like `storeMembers` linking in
`kyiv1-daily-check`. A code change is only needed for a genuinely new report
*shape* (section 5).

## 0. Orient yourself

```bash
cd /home/user/kyiv-1 && git fetch origin main && git log origin/main --oneline -5
```

Re-read the live schema before writing anything — it's the actual source of
truth, and this file's copy of it can drift:

```bash
grep -n "let kpiBenchmarks\|let kpiClearance\|let kpiClickCollect\|const KPI_SUBTABS" index.html
```

Kyiv-1's own 10 stores (re-verify against `kyiv1/staffing-stores` in
Firestore if a store might have been added/removed since):
`J009` Terminal Brovary, `J015` SkyMall Kyiv, `J027` Kvadrat Kyiv, `J029`
Prospect Kyiv, `J035` Hollywood Chernihiv, `J050` TSUM Chernihiv, `J104`
Pohreby, `J109` Livoberezhna Kyiv, `J120` Rayon Kyiv, `J121` Inzhur Park
Brovary.

## 1. Identify which report this update belongs to

Match the screenshot/file's own title or column headers against what's
already on the site:

| Report (site title)          | Firestore doc              | Shape       |
|-------------------------------|-----------------------------|-------------|
| Використання 7-го коду         | `kyiv1/kpi-benchmarks` (filter by `title`) | benchmark |
| Комплексні продажі             | `kyiv1/kpi-benchmarks` (filter by `title`) | benchmark |
| Енерджи                        | `kyiv1/kpi-benchmarks` (filter by `title`) | benchmark |
| Click & Collect                | `kyiv1/kpi-click-collect`   | click-collect |
| Розпродаж (Розпродажні залишки)| `kyiv1/kpi-clearance`       | clearance   |

The three "benchmark" reports share **one array** (`kyiv1/kpi-benchmarks`)
and are told apart purely by their `title` field, which `index.html`'s
`KPI_SUBTABS` dispatcher filters on — a new `title` value with no matching
filter in `index.html` just won't show up anywhere, so an entirely new
benchmark-shaped report still needs a small code addition (a new `if
(kpiSubTab === "...")` block copy-pasted from the "energy" one, plus a
`KPI_SUBTABS` row) even though the data shape itself needs nothing new. If
the file doesn't match any of these five and isn't benchmark/clearance/CC
-shaped either, treat it as genuinely new — see section 5.

## 2. Extract the data — file over screenshot, transcribe honestly

If Adam sends an `.xlsx`, treat it as ground truth over any screenshot sent
alongside it — parse it directly (`openpyxl`, `data_only=True`) rather than
reading numbers off the picture. **Double-check column indices before
trusting a whole report**: sheets in these exports often have a different
number of leading label columns between a "district" summary sheet and a
"stores" detail sheet (this cost real debugging time on the Energy import —
the ratio column was at index 6 on one sheet and index 9 on the other).
Sanity-check by recomputing 2-3 spot values by hand and comparing against
whatever screenshot or on-screen ranking Adam also sent — the ranking order
and the top-of-list values are the cheapest tell that a column is
misaligned.

If only a screenshot is available, transcribe only what's legible. Do not
guess a blurry number or an ambiguous district label — ask, or note the gap
plainly in your summary, the same way the district-label ambiguity on the
first "Використання 7-го коду" import was flagged rather than guessed.

**Coverage gaps are normal, not an error** — a report's underlying export
may only cover some of the district's 10 stores (different RM-region
boundaries than DM-district boundaries, or a store simply had no
qualifying orders that period). Always state the true count
(`ownStoresInDistrict` for benchmark reports, `storesInDistrict` +
`storesInScope` for clearance/CC) rather than padding to 10 or silently
dropping the missing stores from view.

## 3. Build the entry — match the existing shape exactly

**Benchmark shape** (`kyiv1/kpi-benchmarks`, one array entry):
```
{ id, title, period, addedAt, unit, goodDirection: "high"|"low",
  storesInScope, districtsCount, networkAvg,
  best: {district, value}, worst: {district, value}, gap,
  districts: [{name, value}, ...12],
  ownDistrictName: "Kyiv 1", ownStoresInDistrict: 10,
  ownStores: [{name, code, value}, ...],
  topBest: [{name, code, district, value}, ...10],
  topWorst: [{name, code, district, value}, ...10] }
```
`goodDirection` matters: `"high"` when a bigger number is better (sales,
%), `"low"` when a more-negative number is better (e.g. "7-го коду", a
deviation metric where deeper negative = more usage). Get this wrong and
every delta arrow and the "найвищий/найнижчий" stat tiles invert.

**Clearance shape** (`kyiv1/kpi-clearance`):
```
{ id, period, periodRange, addedAt, storesInScope, storesInDistrict,
  currentShare, weekChange, growthCount,
  stores: [{name, code, share, weekChange}, ...],
  categories: [{label, value}, ...] }
```
Clearance already carries its own week-over-week `weekChange` per store
computed from the source file's own two-week columns — don't also try to
diff it against the previous upload for this one.

**Click & Collect shape** (`kyiv1/kpi-click-collect`):
```
{ id, period, addedAt, ordersTotal, storesInDistrict, ownDistrictName,
  onTime: {networkAvg, best, worst, districts, ownStores},
  attachment: {storesInScope, districts, ownStores (each may carry `count`)} }
```

Give the new entry a fresh, stable `id` (e.g. `energy-2026-w37`,
`click-collect-2026-09`) and an `addedAt` **later** than every existing
entry of the same title/collection — sort order and the delta computation
both key off it. Only reuse an existing `id` when Adam is explicitly
resending a correction for a period already on the site, and say so
plainly when you report back (same rule as the deliveries skill).

## 4. Append to Firestore — no PR needed

```bash
curl -sS "https://firestore.googleapis.com/v1/projects/district-tracker-ef4c6/databases/(default)/documents/kyiv1/<key>"
```
Parse `fields.value.stringValue` as JSON, **append** the new entry (don't
replace the array), then:
```bash
curl -sS -X PATCH \
  "https://firestore.googleapis.com/v1/projects/district-tracker-ef4c6/databases/(default)/documents/kyiv1/<key>?updateMask.fieldPaths=value" \
  -H "Content-Type: application/json" \
  --data-binary @patch_body.json   # {"fields":{"value":{"stringValue":"<full updated JSON as a string>"}}}
```
Re-fetch afterward and confirm every prior entry is still there untouched —
same read-modify-write discipline as `storeMembers` linking.

## 5. When it's a genuinely new report shape

Only then does this need a code change: add a `KPI_SUBTABS` entry, a
dispatch block in `renderKpiSubTabContent()`, and (reuse first — don't
invent a sixth visual style) a render function built from the existing
`kpiBarRow` / `kpiTop10ColumnHtml` / `heroBannerHtml` / `.stat-row` /
`.tg-card` pieces, matching how "Енерджи" was added: ship the empty
placeholder or full report through a real branch → `node --check` on the
extracted `<script type="module">` → a jsdom render check (stub the two
`gstatic.com` Firebase imports, eval the module, feed test data, assert no
stray `undefined`/`NaN`) → Playwright screenshot to confirm it visually
matches the other tabs → PR → squash-merge. Expect the merge to conflict
against `main` if another KPI PR merged in between (squash merges make
your branch's own earlier commits look divergent even though the content
is a strict superset) — resolve with `git checkout --ours index.html`
after confirming that really is the case (diff the conflict hunks first;
don't blindly take "ours" if the other side has changes you don't have).
Only *after* the shape exists does the new period's data get appended per
section 4.

## 6. Verify before shipping

For a pure data append, a quick jsdom render check is enough: stub the
Firebase imports, eval the module, set the relevant state array to the
updated data, call `render()` with `activeTab = "kpi"` and the right
`kpiSubTab`, and check the output contains the store/district names you
expect, the coverage note if any, a delta arrow if a previous period
exists, and no `undefined`/`NaN`. Reach for a Playwright screenshot too
when the report is visually new or you changed rendering code, not for
every routine append.

## 7. Always reply with a summary — never just "додав дані"

Every update gets a short Ukrainian reply in chat covering:

- **Own district's stores, ranked** best→worst with each's value.
- **Where the district sits nationally** — rank out of the district count
  (e.g. "5-й з 12 дистриктів"), vs the network average.
- **Top/antitop callouts** — name explicitly any of the district's own
  stores that appear in the report's network-wide `topBest` ("топ") or
  `topWorst` ("антитоп"/"потребують уваги") lists. This is the one thing
  easiest to silently miss — always scan both lists for this district's
  codes before writing the summary.
- **Dynamics vs the previous period**, if one already existed for this
  report — which stores/the district improved or declined and by how much
  (the site now shows this automatically via delta arrows, but say it in
  words too, since Adam may not open the site right away).
- **Any coverage gap** (fewer than all district stores present) — always
  disclosed, never silently dropped from the summary.
