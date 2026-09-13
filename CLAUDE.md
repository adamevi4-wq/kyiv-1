# Kyiv-1 district dashboard — project notes

This repo is `index.html` (single-file dashboard, GitHub Pages + Firebase
Firestore) plus `telegram-bot/worker.js` (Cloudflare Worker) for the JYSK
Ukraine "Kyiv-1" district manager, Adam. Project-specific workflow, house
style, and recurring tasks are captured as skills under `.claude/skills/` —
read those first (`site-and-document-craft`, `visual-design-principles`,
`jysk-dashboard-report`, `kyiv1-kpi-update`, `kyiv1-deliveries-update`,
`kyiv1-daily-check`, the bot-tuning skills) rather than re-deriving the
process here.

## Reference data

`reference/kyiv1-fy2025-26-baseline.json` — Adam's own district's actuals
for the district's 10 stores (J009, J015, J027, J029, J035, J050, J104,
J109, J120, J121) for roughly the last fiscal year, extracted from two SAP
BI exports he sent (customer traffic + conversion, and complex/complementary
sales value), each also compared against the whole JYSK Ukraine network
total. Kept as a compact JSON (not the raw xlsx exports, which cover all
~140 stores nationwide) so it's available for later use — e.g. a
year-over-year comparison once this year's equivalent numbers come in —
without re-parsing the original files or asking Adam to resend them.

Two things to know before using it:
- **Period mapping — confirmed.** The sheets label periods "1" through "12"
  plus an "Overall Result" column, not calendar months. Adam confirmed
  period 1 = September 2025 and period 12 = August 2026 (JYSK fiscal year).
- **These metrics don't map 1:1 onto an existing "Звіти та показники" KPI
  subtab.** "Compl. Sales" is close to the "Комплексні продажі" subtab in
  spirit, but that subtab tracks a network-benchmark *percentage* per
  period, while this data is a raw monthly currency value (thousand UAH,
  itself an accumulated/absolute figure per Adam, not a ratio) per store.
  Customer traffic / conversion ("Sales per customer") has no existing
  subtab at all. Don't force either into `kyiv1-kpi-update`'s
  append-a-period flow without checking the shapes actually line up —
  ask Adam first if a new report type or metric seems warranted.

## Published artifacts

- [Kyiv-1 · Магазини](https://claude.ai/code/artifact/e73d3e83-fc50-4999-8207-3bfca256adb5)
  — a standalone dashboard (Claude Artifact, not part of this site) built
  from `reference/kyiv1-fy2025-26-baseline.json`: a metric toggle
  (Покупці / Середній чек / Комплексні продажі) that redraws a small
  month-by-month chart for each of the district's 10 stores, plus
  district-vs-network stat tiles. Republish the same artifact (pass its
  URL) rather than creating a new one if it ever needs updating — e.g. once
  next fiscal year's numbers come in.
