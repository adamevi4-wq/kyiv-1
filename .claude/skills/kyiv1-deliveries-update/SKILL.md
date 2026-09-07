---
name: kyiv1-deliveries-update
description: Update the "Доставки" tab on the Kyiv-1 dashboard (repo adamevi4-wq/kyiv-1, index.html) from a new monthly JYSK-wide delivery-cost export, and/or reconcile per-store contractor invoice files against what's on the site. Use this whenever the district manager sends (a) a company-wide delivery/replacement-cost file (.xls/.xlsx, one row per delivery, covers many districts) to load a new month onto the site, and/or (b) one or more per-store contractor invoice files (.xlsx, one sheet per store, columns Дата/Водитель/Сумма/Доставка-занос/км/Итого) to check against the site's numbers. Always ship data updates through a real branch+PR+merge, and always hand back a comparison table in chat for contractor files — never edit the site from contractor numbers alone.
---

# Kyiv-1 "Доставки" — monthly update + contractor reconciliation

The "Доставки" tab on the Kyiv-1 dashboard (`index.html`, `DELIVERIES` /
`DELIVERIES_MONTH` constants) shows delivery/replacement costs for this
district's stores. There are two independent inputs the district manager
(Adam) sends, on his own schedule, and this skill covers both:

1. **The company-wide export** ("файл кинь", "загальна таблиця") — JYSK's
   own delivery-cost tracker, dumped as one table covering the *whole
   network* (~70 stores across many districts) for one month. This is the
   source of truth that goes onto the site.
2. **Contractor invoice files** — one `.xlsx` per store, from the courier
   company, listing what *they* are billing for that store's deliveries.
   These never get written to the site — they're only for catching
   discrepancies, and the output is a comparison table back to Adam.

A message can bring either one alone, or both together. Don't wait for both
before acting: load a company export as soon as it arrives, and diff
contractor files against whatever the site already has as soon as they
arrive.

## 0. Orient yourself

```bash
cd /home/user/kyiv-1
git fetch origin main && git checkout main && git pull origin main
```

Read the current `DELIVERIES_MONTH` and `DELIVERIES` constants and the
`STORE_MANAGERS` map in `index.html` (`grep -n "DELIVERIES\|STORE_MANAGERS ="`)
so you know the current month on the site and this district's store codes
(10 stores as of this writing — don't hardcode the list, re-read it each
time in case stores are added/removed).

## 1. Company-wide export → new month on the site

These files show up disguised as `.xls` but are actually an HTML `<table>`
(Excel's "web page" export) — `file <path>` will say "HTML document". Don't
try to open them as a real spreadsheet; parse the HTML table directly
(Python + `re`, as done previously — see below). A single file normally
covers one month only (one `<th colspan='11' ...>Mon YYYY</th>` header); if
a file ever has more than one such header, treat it as covering more than
one month and repeat this section per month.

**Parse:**

```python
import re, html
content = open(path, encoding='utf-8').read()
rows = re.findall(r'<tr[^>]*>(.*?)</tr>', content, re.S)
data_rows = [r for r in rows if '<td' in r]
def clean(cell):
    cell = re.sub(r'<br\s*/?>', ' | ', cell)
    cell = re.sub(r'<[^>]+>', '', cell)
    return html.unescape(cell).strip()
```

Columns in order: Магазин, Дата заміни, Iнформацiя про артикул, Причина,
Адреса заміни, Назва ФОП, Км. від Києва, Поверх, Пiдйом, Лiфт, Вартість
заміни (11 columns — skip rows with fewer `<td>`s, they're header rows).

**Filter** to this district's store codes only (from `STORE_MANAGERS` in
`index.html`) — the export covers many other districts, which are not this
district's business and must not leak onto the site or into chat.

**Clean before embedding:**
- Multi-item article lists (`X X ###### - Name |...`) can run to dozens of
  items on furniture-moving jobs. Keep the first 2-3 items verbatim and
  summarize the rest as `та ще N позицій <асортимент>` — count the *actual*
  remaining items (total items minus how many you kept verbatim); this was
  gotten wrong once before by eyeballing it, so compute the count in code,
  don't guess.
- Drop obvious test/placeholder rows if you spot one (e.g. an article
  literally named "Test article ######") — replace with a short honest
  label like "Обладнання магазину" if the reason field makes the real
  intent clear; never invent details you can't see in the row's own reason/
  address.
- A reason field that's just noise (a stray number, empty) — leave it
  empty rather than fabricating a plausible-sounding reason.
- Escape `'` and newlines for embedding into a single-quoted JS string
  (`reason.replace(/\n/g, ' ')`, escape `'` as `\'`).

**Write into `index.html`:**
- Replace the `DELIVERIES_MONTH` string and the whole `DELIVERIES` array
  (both live right after `DEFAULT_STORES`, before `const POSITIONS`).
  Overwrite wholesale — don't try to append/merge with a previous month's
  array; each month replaces the last (the tab has always shown "this
  month", not a running history — check with Adam before changing that
  assumption).
- Each entry: `{ store, day (int, for sorting), date ('DD.MM.YYYY' display
  string), article, reason, address, cost (number) }` — this is the shape
  `renderDeliveriesTab()` already expects; don't change the tab's rendering
  code for a routine data refresh.

**Validate before shipping** (this repo's own convention — see
`.claude/skills/kyiv1-daily-check` for the same pattern applied to the
Telegram bot):

```bash
node --check <extracted <script type="module"> block>
```

Then actually render the tab — don't skip this, a broken template literal
or an unescaped quote won't show up in `node --check` alone. Extract
`styleTag()`'s CSS plus `escapeHtml`, `round2`, `pluralUA`, `heroBannerHtml`,
`heroUpdatedLabel`, `HERO_MONTH_NAMES_UA`, `STORE_MANAGERS`, `STORE_NAMES`,
`STORE_STAFFING`, `DEFAULT_STORES`, `DELIVERIES_MONTH`, `DELIVERIES`, and
`renderDeliveriesTab` into a standalone HTML file, stub `stores =
DEFAULT_STORES`, `deliveriesStoreFilter = "all"`, `deliveriesPanelOpen =
false`, and screenshot it with Playwright's pre-installed Chromium
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
`NODE_PATH="$(npm root -g)" node <script>` — the `playwright` package is
only installed globally in this sandbox). Confirm the KPI numbers, the bar
chart, and a few comment cards look right before pushing.

**Ship it**: branch off `main`, commit, push, open a PR, and merge it —
same flow as any other change to this repo (see `.claude/skills/kyiv1-daily-check`
step 2's shipping instructions; skip its "ask before risky changes" gate,
since a routine monthly data refresh on a tab that's already reviewed and
shipped once is not that). Tell Adam in chat what changed (new month, how
many deliveries, total cost, any rows you had to drop/clean and why) —
don't just silently merge.

## 2. Contractor files → comparison table (never onto the site)

Each contractor file is a real `.xlsx` (not disguised), one sheet named
after the store code (e.g. sheet `"009"` = store `J009`). Columns: Дата |
Водитель | безкоштовна/повернення | адрес (or Заказ) | Сумма, грн |
Доставка, грн → занос | (unlabeled) → км | Итого, | Итого остаток. Read
with `openpyxl` (`pip install openpyxl` if missing — the sandbox usually
doesn't have it preinstalled):

```python
import openpyxl
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb.worksheets[0]  # sheet title is the store code, e.g. "009"
rows = list(ws.iter_rows(values_only=True))
```

Row shape: `(date, driver, None, address, сумма, занос, км, итого, итого_остаток)`.
The last row is a "Итого" total row — use it as a cross-check on your own
sum, don't rely on it alone (it has been internally consistent so far, but
verify).

**Match each contractor row to a site `DELIVERIES` entry** for the same
store, primarily by **address** (fuzzy — contractor addresses are
abbreviated, e.g. "Кільцева,4 +34км" vs the site's "Вул. Кільцева 4";
strip house-number/street noise and compare the distinctive part) since
**dates frequently do not match between the two sources** (seen already:
same delivery dated 20.08 on the site vs 09.08 on the contractor's
invoice) — don't use date equality as your matching key, only as a
tiebreaker among address matches.

**Report per store, in a markdown table back to Adam in chat** (not as a
file, not onto the site):
- Site total vs contractor total (Итого), and the difference.
- For each contractor row that has a plausible site match: site cost vs
  contractor Итого, and if they differ, say why when the columns make it
  obvious (a "км" or "занос" surcharge on the contractor's side with no
  counterpart on the site's "Вартість заміни" — this has been the
  recurring pattern so far, but verify per-row rather than assuming it).
- Any contractor row with **no plausible site match** — flag it, and check
  whether it actually matches a *different* store's site entry (same
  date+address as another store's row) before concluding it's simply
  missing — this has already caught one real misallocation (a J109
  delivery billed on J027's invoice).
- Any site entry for that store with **no contractor row at all** — flag
  as "not invoiced by contractor" (could be a different contractor, or a
  genuine gap).

Do not "fix" the site's numbers from the contractor's invoice on your own
judgment — the two sources disagree for reasons that need a human call
(which fee structure is correct, whether a misallocated delivery should
move stores). Present the table, name the discrepancies plainly, and let
Adam decide. If he later asks you to correct a specific misallocation or
add a missing entry, that's a small manual edit to `DELIVERIES` — ship it
the same way as section 1 (branch, validate, PR, merge).
