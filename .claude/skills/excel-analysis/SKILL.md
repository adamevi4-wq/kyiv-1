---
name: excel-analysis
description: Excel/Power Query/Power Pivot/VBA/DAX expertise for Adam's own spreadsheet work — modern dynamic-array formulas (XLOOKUP, FILTER, UNIQUE, SORT, LET, LAMBDA) over legacy ones, Excel Tables and Power Query for real data processing, clean commented VBA macros, DAX measures for Power Pivot, correct number formatting and locale (Ukrainian: comma decimal, semicolon formula separator). Use this whenever Adam asks for an Excel formula, wants a spreadsheet problem solved or optimized, asks for a VBA macro, Power Query M-code, or a DAX measure, pastes a formula that errors or runs slow, or shares a real JYSK SAP BW export (.xlsb/.xlsx — Sales, Productivity, Stock Adj., etc.) to analyze or pull numbers from — including as source data for a jysk-presentations deck. Not for actually creating/editing a .xlsx file end-to-end (that's `anthropic-skills:xlsx`) — this skill is the formula/query/macro/DAX expertise and JYSK-export know-how that feeds into that work.
---

# Excel / Power Query / VBA / DAX expertise

Adam (JYSK Ukraine district manager) does real analysis work in Excel —
his own formulas, the SAP BW "District Manager Follow up" export
(RSPE.xlsb and similar), monthly KPI files, ad-hoc store comparisons.
This skill is the standing ruleset for that work: which Excel features
to reach for, how to write them well, and how to read JYSK's own export
files correctly. Like the other skills in this repo, it's a living
document — when Adam corrects an approach or shows a new kind of file,
capture the lesson here rather than re-deriving it next time.

**Division of labor with other skills**: this skill is about getting a
formula, macro, query, or measure *right* — the logic and the code.
Actually creating or editing a `.xlsx` file from scratch is
`anthropic-skills:xlsx`'s job; use that skill's tooling for the file
I/O and come back here for how the formulas/VBA/DAX inside it should be
written. When the end goal is a presentation built from Excel data, this
skill covers reading and understanding the source data — the actual
deck-building (tables, conditional-formatting colors, the official JYSK
layouts) is `jysk-presentations`, specifically its pivot-table recipe
(`scripts/pivot_table_helpers.py`) for SAP BW-sourced decks.

## Modern functions by default

Reach for Excel 365/2021+ dynamic-array functions before the legacy
ones — not as a style preference, but because they solve real problems
the old functions have:

- **XLOOKUP** instead of VLOOKUP/HLOOKUP: no fragile column-index
  counting, searches in any direction, has a clean built-in
  "not found" argument instead of wrapping everything in IFERROR.
- **FILTER / UNIQUE / SORT** instead of array formulas or helper
  columns: they spill results automatically, stay readable, and update
  live as source data changes — exactly the kind of "give me all stores
  below plan, sorted" task that comes up constantly with district data.
- **LET** to name intermediate values inside a formula instead of
  repeating the same sub-expression (and recomputing it) multiple times.
  This is also what makes a complex formula *readable* — a formula with
  named steps explains itself; a formula with the same XLOOKUP typed out
  four times does not.
- **LAMBDA** (+ named ranges, i.e. custom functions) when the same
  multi-step logic needs to be reused across many formulas or files —
  worth it once something stops being a one-off.

Still reach for **INDEX/MATCH** or plain **SUMIFS** when they're
genuinely simpler for the task (a single clean aggregation doesn't need
LET-wrapping) — the point is picking the right tool, not maximizing
novelty. Prefer **Excel Tables** (Ctrl+T) over bare ranges for anything
that will grow (new months, new stores) so formulas and charts extend
automatically, and reach for **Power Query** instead of formulas once
the task is really "reshape/clean/combine data" rather than "calculate
a value" — merging multiple store files, unpivoting a wide monthly
export, or cleaning a messy paste are Power Query problems, not
500-row-SUMIFS problems.

### Formula style
Wrap non-trivial formulas in `LET`, break them across lines with
indentation so the structure is visible, and walk through the logic
step by step when presenting one — what each named value represents and
why, not just the final syntax. Example shape:

```
=LET(
    план,       [E2],
    факт,       [D2],
    різниця,    факт - план,
    відсоток,   ЯКЩО(план=0; ""; ОКРУГЛ(різниця/план*100; 1)),
    відсоток
)
```

## Power Query (M) and VBA

**Power Query** for anything ETL-shaped: pulling several sheets/files
into one table, unpivoting a wide month-by-month export into a tidy
long table, cleaning inconsistent store-name spellings. Give the M-code
and, if useful, the UI click-path (Adam may prefer doing it by hand in
Excel rather than pasting M-code into the Advanced Editor).

**VBA**, when a macro is genuinely the right tool (repetitive manual
steps, something that needs to run on a button click): always

- `Option Explicit` and explicit `Dim` for every variable;
- turn off screen updating and switch to manual calculation before the
  heavy work, and **always restore both in all exit paths** (including
  the error handler) — `Application.ScreenUpdating = False` /
  `Application.Calculation = xlCalculationManual` at the top,
  restored to `True` / `xlCalculationAutomatic` before every `Exit Sub`
  and inside the error handler, never only at the bottom of the happy
  path;
- `On Error GoTo` with a real handler, not a silent `Resume Next` that
  hides a failure;
- comments in Ukrainian, explaining *why* a step exists, not just
  restating the line of code.

## DAX / Power Pivot

When Adam asks for a measure, write it as a named DAX measure (not an
ad-hoc calculated column, unless row-level granularity is actually what
he needs), and say briefly what filter context it depends on — a
measure that looks right in a totals row can read differently once it's
dropped into a pivot with a store/month slicer, and that's worth
flagging rather than assuming it'll behave the same everywhere.

## Number formatting and locale

Ukrainian Excel locale: **comma as the decimal separator, semicolon as
the formula argument separator**, and a space as the thousands
separator in display format (matches what JYSK's own SAP exports show,
e.g. `49 023,7`). When writing a formula for Adam to paste into his own
Excel, use semicolons between arguments, not commas — a formula typed
with comma separators will error in his locale. When formatting a
result cell, give the actual custom format code (e.g. `# ##0,0"%"` for
a one-decimal percentage with a space thousands separator) rather than
just saying "format it as a percentage."

## Reading JYSK's own SAP BW exports (.xlsb)

The district "Follow up" reports (e.g. `RSPE.xlsb`) are SAP BusinessObjects
exports, not plain spreadsheets — binary `.xlsb` format, dozens of
sheets, and a `Create Power Point` sheet that documents the macro which
auto-pastes several of these sheets straight into a PowerPoint deck
(that's *why* their visual style — Verdana 8pt pivot tables with
green/red conditional formatting — is the house style; see
`jysk-presentations` for the deck side of that).

- **Reading**: `.xlsb` isn't readable by `openpyxl`/pandas' normal
  Excel engine — `pip install pyxlsb` (not preinstalled) and use
  `from pyxlsb import open_workbook; wb.get_sheet(name).rows()`. Cell
  values come back as plain Python values (numbers/strings), not
  formulas — fine for reading, since these sheets are already
  calculated/cached by the SAP refresh.
- **Key sheets** (names seen so far — a new export may add more):
  `Sales` (per-store complete sales, index vs plan/prior year,
  customers — row = site code, with district/region/network rollup
  rows mixed into the same column, identified by their hierarchy code
  like `1017DISTR06`), `Sales by product area` (store × product-area
  index matrix), `Productivity`, `Stock Adj. by store`/`by reason`/`by
  prod. area`, `Sleeping`, `Click&Collect`, `Salary`, `Staff Turn`,
  `SAO`. The `prompts` sheet holds the SAP query's own filter values
  (period, district hierarchy code, sales org) — read it first to
  confirm which month/district an export actually covers, rather than
  assuming from the filename.
- **Gotcha**: at least one sheet (`Sales by product area`) has **two
  differently-shaped data blocks side by side** — a wide per-store
  table on the left and a separate narrower "chart source" block
  further right that isn't simply an offset copy of the left table.
  Don't assume a column's position implies its relationship to a
  neighboring block — print a labeled dict of `{col_index: value}` for
  a row or two and confirm what each column actually is before trusting
  it, the same way you'd sanity-check any unfamiliar spreadsheet.
- **Missing data is real, not zero**: a new or non-comparable store
  (opened too recently to have a prior-year figure) shows as a blank
  cell, which `pyxlsb` reads as `None` — report that as "no data" (an
  em dash, a stated exclusion), never as a 0% or a dropped row that
  silently vanishes from a count.
- **Site codes**: each store has a stable code like `J009`; district/
  region/network rollup rows are mixed into the same column using SAP
  hierarchy codes (`1017DISTR06` = Kyiv 1, `1017REG01` = Region 1,
  `101701` = whole sales org `1017` = JUA/Ukraine) — filter by exact
  code, don't guess by name matching ("Kyiv" alone would also catch
  Kyiv 2/3/4 and other Kyiv-area districts).

When the end goal is a deck, hand the cleaned/understood data to the
`jysk-presentations` skill's pivot-table builder rather than building a
chart or a stat card from it — that skill documents the confirmed
visual convention (and why it's the right one) in detail.
