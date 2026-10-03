---
name: jysk-presentations
description: JYSK Ukraine brand kit and workflow for building PowerPoint (.pptx) presentations for Adam (district manager, 10 stores) — real official JYSK template files (master deck, A3 career-ladder poster, A4 congratulations card, SoMe square card), the accumulated visual language (speech-bubble callouts, benefits icon set, TOP 5 store-readiness hand icon, circle badges), official brand colors/font, `scripts/deck-kit.js` (Adam's own Node/pptxgenjs design-system — the primary tool for a new general/topic deck, 14 layouts × 6 themes incl. a Verdana/navy `jysk` theme), `scripts/layout_helpers.py` (python-pptx custom layouts for the handful of patterns deck-kit doesn't cover), and how to turn it all into an actual deck via the pptx skill. Use this whenever Adam asks for a JYSK presentation/slides/poster/social card, says a deck looks plain/boring/needs to be more designer-attractive, or sends new brand elements (screenshots or files: templates, icons, bubbles, slogans, badges, reference slide layouts, deck-kit source) or new rules ("always/never do X") to add to the house style. Growing document — append new elements/rules to it rather than treating them as one-off instructions.
---

# JYSK presentation brand kit & workflow

This is the living brand kit for presentations/posters/social cards Adam
(JYSK Ukraine district manager) asks for. He builds it up by sending real
files and screenshots over multiple conversations — treat every such
message as an addition to this file (and `assets/`), not a one-off answer.
**This skill is the visual/brand execution layer.** For the underlying
numbers, use `excel-analysis`; for deciding what a slide's headline and
story should actually say (Action Titles, "So What?", MECE bullets,
chart-type fit), use `executive-insights` — then come back here for the
JYSK-specific build.

**The single most important thing in this skill: `assets/official/` holds
real, official JYSK PowerPoint template files** (not recreations — the
actual files Adam uses at work). Always check there first before building
anything from scratch or redrawing an approximation.

**A separate site, `kyiv-1.pages.dev`, also generates presentations "by
request"** per Adam — he says its output looks bad and wants decks built
here instead to look as good as the reference screenshots below. That
site is unrelated to this repo (no `pages.dev`/Cloudflare Pages config
anywhere in it) and this session's network egress proxy blocks the
domain outright (`EGRESS_BLOCKED`/`403` on both WebFetch and `curl`) —
don't spend time re-attempting to fetch it; it's simply not reachable
from here. Treat every deck request as building directly in this repo's
workflow, not as patching that other site.

## Official templates available (`assets/official/`)

| File | Format | What it's for |
|---|---|---|
| **`JYSK_main_template_FY27_indoor.pptx`** | 16:9 deck | **Adam's own live working file — start here for any general/monthly presentation.** He said explicitly: "Це головний шаблон файл для презентацій" (this is the main template file for presentations). Same JYSK master/layouts as the guide template below, but already populated with his real Kyiv-1 monthly district-review structure (12 slides): title ("Показники Вересня / Kyiv 1") → Agenda → "Результати [місяця] основні КРІ" → why revenue is the primary KPI → Sales Index Monthly Development (comparable stores by month/store, plan vs actual) → Performance District (by month) → Performance District by store (real store codes J015/J027/J029/J104/J109/J120/…) → Sales Performance by Product area → Productivity → Домовленості (agreements/commitments per DM/SM). **Reuse this exact section order for future monthly reports** — swap the month and numbers, keep the skeleton — rather than inventing a new structure. |
| `JYSK_official_template.pptx` | 16:9 deck | The generic staff master template (same master as above, no real content) — 23 layouts (title, agenda, standard content, statement slide, "Breaker Small Speech Bubble" 1–9, large breaker placeholders white/blue, iPad/phone mockup breakers, 2-column, headline-only, empty, content-with-headline) plus guide slides showing the click-paths for editing text/photo. Use when the FY27 file's existing content would get in the way (e.g. a one-off deck unrelated to the monthly report). |
| `JYSK_career_ladder_template.pptx` | A3 poster (print) | Career-path/promotion poster: a "ladder" of position bricks with white/blue directional bars; the achieved/current position highlighted, others made transparent; a photo of the person. Requirements baked into the guide: subject centered, calm (preferably white) background, sharp, good quality, smiling/open eyes/calm body language. Save-as-PDF for printing. |
| `JYSK_A4_template.pptx` | A4 portrait (print) | Personalized "**Proud to be JYSK**" congratulations/welcome card — "Dear \<Name\>, We're proud that you choose to be JYSK, #ProudToBeJYSK" + body text + photo. This is the source of the "Proud to be JYSK" speech-bubble motif. |
| `JYSK_SoMe_template.pptx` | Square (social media) | Same "#ProudToBeJYSK" congratulations format, sized for social posts. Works for an individual ("Dear Amalie, ... Store Manager Viby"), a store team ("Dear Team Viby"), or a whole district ("Dear District North") — swap subject line, photo, and role/scope text. |

Official brand colors and font (read from these files' real theme XML —
authoritative, don't guess new ones):
- **accent1 `#143C8A`** — primary JYSK navy (main brand color)
- **accent2 `#4BA4DF`**, **accent3 `#9CC3E5`** — medium/light blue (secondary, tints)
- **accent4 `#2E75B5`**, **accent5 `#48A1FA`**, **accent6 `#034A90`** — supporting blues (accent6 is the darkest, use for deep-navy fills like the speech bubbles)
- **dk1/dk2 `#565655`** — body text gray (not pure black)
- **lt2 `#D0CECE`** — light gray for hairlines/muted fills
- **Font: Verdana** (both major/minor in the theme — use it for all generated text; it's the real corporate font, not a guess)

## Official formatting rules (mandatory, verbatim from JYSK)

These came directly from JYSK's own template guidance — they are rules,
not style suggestions, and apply to every deck built from
`JYSK_official_template.pptx`:

- **Never modify the official layouts.** Use the layout that matches the
  slide's purpose as-is (title, agenda, standard, breaker variants, …).
  Don't restyle, resize placeholders, or change their structure.
- **Creative/hard-to-fit content** → base it on the **"Standard slide"**
  layout, not a custom one — but still don't change the font settings.
- **Font: Verdana, always.** Bold/italic/underline within body text are
  fine to emphasize points — just never a different typeface.
- **Font color: "Dark Grey, Text 2" — RGB 86,86,85 (`#565655`)** — this is
  the `dk1`/`dk2` theme color already noted above; use it for all body/
  title text, not pure black.
- **Font sizes by layout** (exact pt sizes — match these, don't eyeball):

  | Layout | Headline | Sub-headline / Body |
  |---|---|---|
  | Title slide | 28, bold | 18 (sub-headline) |
  | Agenda slide | 40 | 20 body (bullet indents shrink by 2pt per level, down to and including the 5th level — never smaller than that) |
  | Standard slide | 28, bold | 20 body (same indent rule as Agenda) |
  | Small speech-balloon breaker | 24 | — |
  | Breaker large placeholder | 28, bold | 18 (sub-headline) |
  | Breaker iPad placeholder | 28, bold | — (double-click the iPad icon to drop an image inside its frame — that's the intended way to place a photo on this layout, don't draw a separate picture over it) |

## Primary tool for SAP BW / data decks: pivot-table builds (`scripts/pivot_table_helpers.py`)

**As of 2026-10-03, this is the correct visual language for any deck
built from a JYSK SAP BW export (RSPE.xlsb-style: Sales, Sales by
product area, Productivity, Stock Adj., etc.) — not native pptx charts,
not big-number stat cards.** Two rounds of "це не то" led here. Round 1
(python-pptx micro-copy, below) was Adam asking for code over
deck-kit.js and less text — correct in principle, but round 2 showed the
actual expected look: he sent 3 of his own real reference decks
(`DM_SM_Monthly_Teams_Meeting_12-_2026.pptx`,
`SM_DM_..._08.04.2025.pptx`, `..._08.2025.pptx`). Since LibreOffice can't
render anything here, I unzipped them and read the **actual table cell
XML** (fills, fonts) directly with python-pptx rather than guessing from
appearance — found every data slide in all three is a **pasted Excel
pivot table**, not a chart or a card:

- **Font: Verdana 8pt**, black text, centered for numbers, left for
  store code/name — a real, confirmed exception to the 20pt "Standard
  slide" body-text rule above; dense pivot data needs to fit many rows/
  columns on one slide, exactly like the source SAP export itself.
- **Site code + name columns**: solid light-blue fill (`#C3D6EB`), no
  conditional color.
- **Absolute-value columns** (sales amount, customer count, UAH
  figures): no fill at all — white/inherited.
- **Every index/comparison column** (vs. plan, vs. prior year — anything
  that's a "100 = baseline" percentage): **conditional fill, green
  `#ABEDA5` when ≥100, red/salmon `#FF988C` when <100.** This is the one
  real design rule to apply, and it answers the earlier "don't assert a
  conclusion the data doesn't support" worry directly: coloring by the
  100% threshold is reporting a fact (above/below plan or prior year),
  not an invented value judgment — keep doing it, it's correct and
  expected.
- **Table sits on the real `JYSK_main_template_FY27_indoor.pptx` layout
  21, "Заголовок і текст"** (title + body placeholder) — this is the
  layout the SAP export macro itself uses; it isn't present in the
  generic `JYSK_official_template.pptx`.
- Missing/non-comparable data (a new store with no prior-year figure)
  renders as an em dash "—", never a fabricated 0 or blank cell that
  could be misread as a real zero.

**How to build**: use `scripts/pivot_table_helpers.py` —
`add_pivot_table(slide, left, top, width, height, headers, rows,
col_types)` where `col_types` is `'label'`/`'num'`/`'pct'` per column;
`pct_fill(v)`/`fmt(v)` are exported too if you need a one-off cell
outside the helper. A full worked example building 3 such tables
(district-by-store sales, sales by product area, productivity) from a
real RSPE.xlsb export is the shape to copy for the next SAP-data
request — ask Adam if he still has that build script if you need to see
it end-to-end; the reusable logic itself is all in the helper module.

**Reading the source `.xlsb`** (the general Excel/SAP-export expertise
now lives in the `excel-analysis` skill — consult it for formulas,
Power Query, VBA, or DAX on this same data; the summary below is just
the deck-building-relevant parts): `pip install pyxlsb` (not preinstalled),
`from pyxlsb import open_workbook`, `wb.get_sheet(name).rows()`. Key
sheets seen so far: `Sales` (per-store compl. sales, index vs plan/prior
year, customers — row = site code, district rollup row has the district
hierarchy code e.g. `1017DISTR06`), `Sales by product area` (store ×
product-area matrix, index vs prior year — careful: this sheet has two
differently-aligned data blocks, a wide per-store/per-article-code table
on the left and a separate district-only "chart source" block on the
right columns ~19-21 labeled Product area/Month/FY acc. — cross-check
any district-level total against both before trusting it), `Productivity`
(per-store productivity UAH/hour, index vs prior year — note some real
stores are simply absent from this sheet, e.g. newly-opened ones; don't
silently skip reporting that, say which codes are missing). The
`prompts` sheet holds the SAP query filter values (period, district
hierarchy code, sales org) — useful for confirming which month/district
a given export actually covers, not for content itself. A sheet named
literally `Create Power Point` is the macro's own documentation
(readable row by row) — read it if the export's own intended workflow
ever matters.

**When this does NOT apply** — the general `anthropic-skills:
designer-presentations`-style rules (micro-copy, one-idea-per-slide, big
stat cards, native charts) are still right for a deck that isn't
replicating a SAP BW export look: a plan-only outline, a one-off topic
deck, a congratulations card. Pivot-table-paste is specifically for
"this needs to look like the District Manager Follow-up report."

---

The two rules below (micro-copy, no fabricated conclusions) remain good
general practice for any data deck's *prose* slides (titles, KPI
headlines, closing) — just don't apply the "big number card" *visual*
to a table-shaped SAP metric; use the pivot table above instead.

1. **Micro-copy, no exceptions**: one slide = one idea. A slide is a
   short eyebrow label + a headline (≤10 words) + one big number/stat +
   at most one short thesis line — never a paragraph, never more than a
   couple of bullet-style items. If content doesn't compress to that,
   split it across more slides rather than cramming. This is stricter
   than the general "≤35 words, not a wall of text" rule in the
   `anthropic-skills:designer-presentations` workflow below — apply
   micro-copy on top of it for Adam's own working decks.
2. **Don't assert a conclusion the data doesn't support.** The clearance
   deck's actual content error: I framed a store's *rising* clearance
   share as something needing attention/a problem, without knowing
   whether rising or falling is the direction Adam actually wants — never
   confirmed. **State the fact (direction + magnitude) and stop there**
   unless Adam has told you which direction is good; don't invent a
   value judgment("потребує уваги", "проблема", "позитивна динаміка")
   on a metric whose target direction you don't actually know. Ask if it
   matters for the deck's framing, otherwise stay neutral.

**How to build**: open the official `JYSK_official_template.pptx` (its
"Empty" layout, index 21 in the current file — confirm with
`prs.slide_layouts[i].name` since a future template edit could renumber
it), strip its 6 built-in guide slides first (python-pptx has no public
slide-delete API — drop the `sldId` entries directly):
```python
def _delete_all_slides(prs):
    xml_slides = prs.slides._sldIdLst
    for sld_id in list(xml_slides):
        rId = sld_id.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        prs.part.drop_rel(rId)
        xml_slides.remove(sld_id)
```
then build every slide with `scripts/layout_helpers.py`'s primitives
(`blank_slide`, `_rect`, `_textbox`, `_run`, `_eyebrow`, `_headline`) for
simple full-bleed statement/stat slides, and its ready-made
`add_stat_bar_insight_slide`/`add_kpi_comparison_slide` for ranked-list
or before/after data — don't hand-roll a ranking chart when that
function already does it. A worked example (7-slide clearance-share
deck, title → headline stat → change → ranked bar chart → fact-only
growth-stores slide → data-scope caveat → closing) is the shape to copy
for the next raw-data request.

**QA note**: `validate.py` on `JYSK_official_template.pptx` itself (even
untouched) reports one `ppt/revisionInfo.xml` schema error — confirmed
pre-existing in the official file, not something a build introduces;
don't chase it as a bug in your own output. Geometry-bounds check still
applies as usual (see "No LibreOffice visual QA" below).

**When to still reach for `deck-kit.js`** (kept as a secondary tool, not
retired): Adam explicitly asks for a more visually rich/designed deck —
gradient-mesh backgrounds, native charts needing pptxgenjs's chart
engine, Lucide icon art — rather than a lean internal working deck. Ask
if unsure which style he wants; don't default to the heavier tool for a
quick data update.

### A full SAP workbook → full deck: dual-view structure, per sheet

When Adam hands over the whole `.xlsb` (many sheets — Sales, Sales by
product area, Productivity, Stock Adj., Sleeping, Click&Collect, Salary,
Staff Turn, SAO, ...) and says build the deck from it, this is the
shape he actually wants, confirmed 2026-10:

- **Audience is his own store managers** (SMs), not his boss — this is
  his team meeting deck, not a report going upward. Keep that in mind
  for tone (same "потребує уваги", never "найгірший" rule as elsewhere)
  and for what's worth calling out (what *they* can act on).
- **Build from every sheet in the workbook**, not a pre-filtered subset
  — he picks what to keep afterward together with you; don't silently
  drop a sheet because it seems minor.
- **Each metric gets a two-part view on ONE slide, side by side** —
  confirmed from a real reference screenshot Adam sent (not just
  "adjacent slides", an earlier guess this corrects): a narrow table on
  the left ranking every JYSK Ukraine district by the metric (Kyiv 1's
  row bold/highlighted, wherever it falls in the sort), and the wider
  Kyiv 1 store-by-store table on the right for that same metric — both
  visible in one look, "where we stand, then which of our stores drive
  it." The `Sales` sheet already has both: the district rows
  (`1017DISTR0x`, `1017REGxx`, etc.) mixed in with every other
  district's row, and the Kyiv 1 store rows — split that one sheet into
  exactly this left/right pair on a single slide. Mind the real
  `add_table` gotcha already documented below: a table renders at the
  *sum of its own column widths*, not the `width` argument — size the
  two tables' column widths to literally add up to what fits next to
  each other on the slide, and verify with the geometry-bounds check
  every time, don't trust the number you passed in.
- **Column headers are copied verbatim from the source sheet — English,
  exactly as JYSK's own SAP export spells them** (e.g. "Index compl.
  sales plan", not a Ukrainian paraphrase like "Індекс до плану").
  Confirmed directly with Adam after he flagged this: don't invent
  friendlier wording, even in Ukrainian decks — his own people already
  read these exact English labels in the source reports, and a
  paraphrase risks naming the wrong thing. Pull the literal header text
  (collapse its internal line breaks to spaces) from the sheet's own
  header row rather than composing a label from the metric's general
  meaning.
- **"Stock Adj. by reason" is the one sheet where the row LABEL should
  be the SAP code, not the English name** — Adam explicitly asked not
  to show "Scrap"/"Claims"/"Other corr."/etc. on the slide, use the
  numeric "Reason for Mvt." code instead (confirmed from the real sheet:
  111=Scrap, 112=Claims, 81=Other corr., 53=Stocktaking adj.,
  103=Changing when inventory — the sheet actually lists each reason
  twice under two sibling codes with identical values, e.g. both 111 and
  50 for Scrap; use the first/primary code of the pair). The "Overall
  Result" total row is not a reason code and keeps its text label. This
  is sheet-specific — don't extend "use the code" to other sheets whose
  row labels (Site, Product area, ...) are what they should be.
- **A short insight commentary goes under the two tables, in Ukrainian,
  using only real numbers** — this is `executive-insights`' So-What
  layer applied directly on the slide, not left to speaker notes: a
  bold opening fact (e.g. district's rank among all districts for this
  metric), then 2-3 plain lines calling out specific stores by code with
  their real figure — the ones pulling the number up, the ones below
  the 100 threshold, and a named opportunity if one is evident from the
  data. Never invent a store's commentary or a rank that isn't computed
  from the actual rows on the slide.
- **Read the source file's own conditional formatting before deciding
  whether to keep it** — don't assume the green-≥100/red-<100 rule
  found earlier is universal. A sheet may color by a different threshold
  (an attention cutoff that isn't 100), by rank, or flag specific
  outlier cells rather than a whole column — read each sheet's actual
  cell fills (same technique as the pivot-table reverse-engineering
  above: open the real file with python-pptx/openpyxl and read
  `cell.fill`, don't guess from the printed example) and figure out what
  rule produced them before replicating it. Where a sheet's coloring
  doesn't carry real meaning for the deck (or isn't worth the effort
  yet), it's fine to leave it plain — Adam said he'll color those in
  together afterward, this isn't a step to get perfect on the first pass.
- **Table slides should look genuinely polished**, not just a bare
  pivot-paste — the confirmed Verdana-8pt/light-blue-label/green-red
  convention is the right *data* treatment, but still dress the slide:
  a short Key Takeaway line per `executive-insights`, sensible spacing,
  maybe a callout number or small icon next to the headline metric —
  the table itself stays data-dense and exact, the slide around it
  shouldn't look bare.
- **Use whatever PowerPoint building blocks fit the content** — photos,
  icons, native charts, highlight callouts — not only tables. A sheet
  that's genuinely a single trend or a single ranked comparison may be
  clearer as a chart (see `executive-insights`' chart-type guide) than
  as a dense table; use judgment per sheet rather than forcing every
  sheet into the same table template.

### Tables as real embedded Excel objects, not pptx tables (`scripts/ole_table_helpers.py`)

Adam asked directly for this: take the data and put it on the slide as
a genuine, double-click-to-edit Excel worksheet (so he can tweak numbers
himself afterward in Excel, not fight PowerPoint's table editor) — not
a plain `a:tbl` pptx table like `pivot_table_helpers.py` builds. **He's
since confirmed the embed itself works** — a real PowerPoint screenshot
showed the table inserted and selected as an object — so this is no
longer "sandbox-unverified," only the fine visual polish is still being
iterated on. Use `scripts/ole_table_helpers.py`'s `add_ole_table(slide,
left, top, max_w_emu, max_h_emu, sheet_name, headers, rows, col_types,
png_path, col_decimals=None, highlight=None, emphasize_cols=None)` →
returns `(graphic_frame, width_emu, height_emu)`:

- **Thick outer frame + named-row highlighting**, both requested
  directly after Adam saw a real inserted table: every table now gets a
  navy outer border (`OUTER_BORDER`) distinct from the thin per-cell
  gridlines, drawn in both the real xlsx and the PNG preview. Pass
  `highlight={"J120": "potential", "J015": "attention", ...}` keyed by
  whatever's in the row's first column (site/district code) to bold and
  color that row's label cells and prepend a ★ (potential/leading) or ⚠
  (needs attention) marker to its name — reuse the exact same codes
  already named in that slide's insight bullets below the table, so the
  table and the prose agree rather than making the reader cross-reference.
- **Inner gridlines are a separate, darker color from the outer frame**
  (`INNER_GRID = "8CA4C4"`, was the near-invisible `B9C6D6`) — a real bug
  in the PNG preview specifically, caught after Adam looked at the
  rendered table and said he couldn't see internal borders at all: every
  per-cell gridline rectangle was drawn with PIL's default 1px outline,
  which doesn't scale with the preview's internal 3x render `scale`, so
  next to the outer frame's 9px-wide line it read as basically nothing.
  Fixed by drawing cell outlines at `grid_w = scale - 1` and darkening
  the color — now outer-vs-inner reads as a clear, deliberate hierarchy
  (thick navy boundary, visible but clearly thinner gray-blue grid)
  instead of outer-only.
- **`emphasize_cols`** (list of 0-based column indices, plain `'num'`
  columns only — a column already colored by `'pct'`/`'stockadj'`
  doesn't need this): the single highest value in that column, among
  non-bold/non-total rows, gets a light-gold fill (`TOP_FILL`) and bold
  navy text, so a standout number inside the table draws the eye on its
  own — Adam's ask after the border fix: "підсвіти якісь показники
  всередині таблиці... подумай, як звернути на них увагу загалом." Use
  it on a table's headline raw number (revenue, productivity, a
  write-off's absolute cost) — one column, not every numeric column, or
  the signal gets lost in too many gold cells. "Highest = best" holds
  for every column this has been used on so far (revenue/customer counts
  where bigger is obviously better, and signed deviation metrics like
  stock-adjustment cost or a stock-taking discrepancy where the least
  negative value is the best result) — don't reach for it on a column
  where highest is actually the worst case without re-checking that
  assumption first.

- It builds a real `.xlsx` (via openpyxl) with the same Verdana look
  (10pt data/headers, generous row height for readability — not the
  cramped 8pt it started at) and light-blue label columns, plus **real
  Excel conditional-formatting rules** (`CellIsRule`, ≥100 green / <100
  red — not a static fill, so the color updates live if Adam edits a
  number), embedded with python-pptx's own public
  `shapes.add_ole_object` API — a tested code path, not hand-rolled
  OOXML.
- It also renders a matching PNG "closed state" preview (what's visible
  before double-click), and strips the `showAsIcon="1"` attribute
  `add_ole_object` sets by default — confirmed from a real embedded
  object in one of Adam's own decks that the full-content-preview look
  (not a small icon badge) comes from omitting that attribute entirely.
- **Column widths are computed from real content, not passed in** —
  the function measures every header word and every formatted data
  value and sizes each column to the widest of the two, so font size
  stays identical across every cell (no more per-cell shrink-to-fit,
  which is what produced a real PowerPoint screenshot Adam sent back
  showing uneven, cramped text). Don't reintroduce a hand-guessed
  `col_w_px` list — that's exactly what produced the uneven version.
- **Watch unit-mixing when editing the width math**: the preview is
  drawn at 3x scale internally, but padding/positions get added back in
  pre-scale units in a couple of places — one real bug this surfaced:
  padding was added as `pad * 2` into an already-scaled width sum
  instead of `pad * scale * 2`, silently reserving a third of the
  intended margin and clipping "1017DISTR06" by one character. Caught
  by rendering the actual PNG and looking at it, not by reasoning about
  the numbers — keep doing that after any change here.
- **Size with `max_w_emu`/`max_h_emu`, never a fixed width+height
  pair** — the function fits the preview's real aspect ratio inside
  that box (like CSS `object-fit: contain`), so it can never stretch
  the image out of proportion or, going the other way, overflow the
  slide. A fixed-width-only version did exactly that once the font/row
  height grew for readability: height ended up derived from the old
  narrow-column aspect ratio and blew past the slide. For two tables
  side by side, give the left one a generous width budget, read back
  its *actual* placed width, then give the right one whatever's left
  (`TOTAL_CONTENT_W - actual_left_width - gap`) as its own budget —
  don't assume either table's requested budget is what it will use.
- Two separate OLE tables (district ranking + store detail) can sit
  side by side on one slide exactly like the `pivot_table_helpers.py`
  layout above — same positioning approach, just swap which function
  builds each table. Confirmed across a full deck (Sales, Sales incl.
  Online, Productivity, Click&Collect, SAO all built this way).
- **The ≥100/<100 color rule only applies to genuine "Index ... plan/
  prev." columns — a real bug, not a style nitpick, caught by actually
  rendering a preview and looking at it**: a raw percentage with no 100
  baseline (Acceptance rate, Share of orders picked within 30 min,
  In-stock %, a stock-adjustment % of value) is NOT an index, and
  coloring it by the same rule paints almost everything red since real
  values sit nowhere near 100 — one matrix table came out looking like
  a single block of red before this was caught. Mark those columns
  `'num'` (no fill), never `'pct'`, in `col_types`. When genuinely
  unsure whether a column is index-shaped, look at its actual value
  range first (clustered around 100 → index; clustered near 0 or in a
  0-100 band with no 100 anchor → plain percentage).
- **`col_decimals`** (list, one per column, default 1): small-magnitude
  percentages (a stock-adjustment % of a few tenths of a point) need 2
  decimals to stay distinguishable — at 1 decimal, `-0.05` and `-0.11`
  both round to the misleading same `-0.1`. Index-style values around
  100 are fine at the default 1.
- **`'stockadj'` col_type**: a stock-adjustment % of value column is
  NOT `'num'` (no color) and NOT `'pct'` (>=100 threshold — wrong, these
  values sit near 0/-1, never near 100). It has its own real FY27 target
  that is itself negative (-0.25%, from `fy27_targets.FY27_TARGETS` —
  see that section below), so it gets its own col_type: green if the
  value is >= the target (a smaller write-off than goal, or even
  positive), red if more negative than the target. Applies the same
  real conditional-formatting rule in the xlsx and the same direct fill
  in the PNG preview as `'pct'` does, just with `STOCK_ADJ_TARGET`
  instead of `100` as the threshold.
- **Embed confirmed working, visual polish still gets checked live**:
  the OLE mechanism itself is confirmed (real PowerPoint screenshot,
  object inserted and selectable) — what's still sandbox-unverifiable is
  purely cosmetic (exact spacing/alignment as PowerPoint renders it),
  since this environment has no PowerPoint/Excel to render against.
  Keep rendering and looking at the PNG preview after any layout change
  (it's what caught both real bugs above), and treat Adam's screenshots
  of the actual inserted result as the real ground truth over anything
  reasoned about from the numbers alone.

### FY27 Ukraine store KPI targets (`scripts/fy27_targets.py`)

Adam sent the official "Ключові цілі для магазинів в Україні на 2027
фінансовий рік" one-pager and asked that every future chart/table color
a metric against its REAL company target, not a guessed threshold.
`FY27_TARGETS` dict, one entry per metric:

| key | target | metric | direction |
|---|---|---|---|
| `sales_growth_comp_index` | 108.9% | Sales Growth Comp.Stores - Index (YoY) | bigger is better |
| `sleeping_growth_comp_index` | 108% | Acc. Sales Growth within Sleeping % - comp. stores (YoY) | bigger is better |
| `sales_per_customer_growth_index` | 111% | Sales/Customer growth % - Total Stores (YoY) | bigger is better |
| `customers_growth_index` | 105% | Acc. Customers growth Index - Comparable Stores (YoY) | bigger is better |
| `productivity_uah_per_hour` | 3250 грн | Acc. Productivity, Comparable Stores (cost-price sales/hour, a raw number, NOT a %) | bigger is better |
| `stock_adjustment_pct` | -0.25% | Stock adjustment, % of revenue (Storefront) | the target itself is negative — see below |
| `staff_turnover_pct_max` | 23% | Staff turnover 12 months | smaller is better (ceiling) |
| `sick_absence_pct_max` | 1% | Acc. Sick absence % short term | smaller is better (ceiling) |

Two distinctions that matter, both real mistakes this was written to
prevent:
1. **FY27 target index ≠ the generic ">=100 = grew" baseline.** A
   column already named "Index ... plan" (vs a store's own monthly
   plan) correctly uses 100 as its threshold — that's intrinsic to what
   "plan" means, nothing to do with FY27. The `FY27_TARGETS` growth
   indices (108.9%, 108%, 111%, 105%) are a different, higher bar: the
   company-wide ANNUAL growth goal. Use 100 for "did this grow at all
   vs last year / hit its own plan"; use the FY27 number for "is this on
   track for the FY27 goal."
2. **Stock adjustment's target is negative, and that's not a typo.**
   -0.25% is the expected, acceptable level of write-off — it is a
   ceiling on loss, not a floor to climb to 0 or above. A store at
   -0.10% is BETTER than target (small loss, fine). A store at -0.46% is
   WORSE than target (bigger loss than planned for). Never treat "any
   negative value" as bad, and never treat "closer to/above 0 is always
   better" either — judge only against -0.25%. This is wired into
   `ole_table_helpers.py`'s `'stockadj'` col_type and into
   `chart_helpers.py`'s `color_rule="stock_adj"`.

### Chart helpers for leftover slide space (`scripts/chart_helpers.py`)

Adam, after seeing the OLE tables: "якщо... залишається вільне місце, ти
можеш використати діаграму" — and later, generalizing it: "на всіх
діаграмах бажано використовувати сам показник і індекс цього показника,
якщо він є в тебе" (every chart should carry both the real-unit metric
and its index/%, when both exist, not force a pick between them). Two
functions, both native/editable pptx bar charts (`XL_CHART_TYPE.BAR_CLUSTERED`):

- `add_ranked_chart(slide, left, top, width, height, title, categories,
  values, companions=None, color_rule="growth", target=100.0,
  value_fmt="{:,.0f}", companion_fmt="{:.0f}%", font="Verdana")` — one
  bar per store. `values` is always the metric's own real-unit number
  (revenue, грн/год, a raw %) — never a bare index used as a stand-in,
  so the bars compare on a scale the reader actually recognizes.
  `companions`, when given, is that metric's own index/% folded into
  the data label alongside the raw value (`"7,017 (101%)"`), instead of
  picking one number and dropping the other.
  `color_rule` selects which FY27-target-aware rule colors each bar —
  `"growth"` (>=100, the plain YoY/plan baseline — colors off
  `companions[i]` when a companions list was passed, `values[i]`
  otherwise; a `None` companion colors gray, it is never silently
  swapped for the raw value), `"floor"` (>= target is good, e.g.
  productivity vs 3250), `"ceiling"` (<= target is good, e.g. turnover/
  sick absence vs their cap), `"stock_adj"` (>= a negative target is
  good), or `None` (flat navy, no threshold). See `fy27_targets.py` for
  which rule and target number fits which metric.
- `add_group_chart(slide, left, top, width, height, title, categories,
  series, font="Verdana")` — several series side by side for straight
  comparison (e.g. two product-group index series across the same
  stores), `series` a list of `(name, values)` tuples. This is NOT a
  per-bar good/bad call, so series get fixed colors (navy, then amber)
  instead of threshold colors.

Both are placed in whatever width is left over after an OLE table is
sized to its real content — which is often substantial, since
`add_ole_table`'s height budget (`max_h_emu`) binds well before the
width budget does once rows/font are sized for readability, so a table
asked for an 8.6M-EMU width budget can come back using under 5M. Always
read back the *actual* placed width from `add_ole_table`'s return value
and compute leftover space from that, never from the budget you asked
for — the gap is frequently much bigger than it looks from the numbers
alone (confirmed directly: several "no room for a chart" slides from an
earlier round actually had 2–7M EMU of untouched width once measured).

## Reference decks (`assets/reference_decks/`)

Real `.pptx` files Adam has sent across this chat, kept as actual files
(not just notes about them) specifically so a future session can open
and inspect them directly — see `assets/reference_decks/README.md` for
the full manifest (what each file is, and what's been pulled from it so
far). Highlights, confirmed from real files, not secondhand description:

- **The official company-wide DM/SM monthly meeting has a real blank
  template** (`HQ_DM_SM_monthly_meeting_template_2026-12.pptx`) whose
  tables show a **multi-month trend per site** (SEP/OCT/NOV/DEC/Total
  columns) and **month + FY-accumulated side by side** — our Kyiv-1 OLE
  deck so far is single-month only. Worth raising with Adam as a
  possible next iteration, not something to silently add.
- **Adam's own real Kyiv-1 monthly decks** (`real_SM_DM_meeting_Kyiv1_*`)
  show the actual AGENDA format (a 2-column Тема/Час time-budget table,
  not a bullet list), a "Виторг основна ціль" framing slide that states
  outright that revenue is the one goal and every other KPI is just an
  indicator/lever for it, and the real "Домовленості" format: concrete,
  channel-tagged action items ("...в групу DM\SM\DepSM"), not a vague
  "fill in during discussion" placeholder. See the reference-decks
  README for the exact pulled text. **Applied** — see "Real DM/SM
  monthly-meeting slide builders" below.
- **A peer district's topic deep-dive deck** on discounts/write-offs
  exists as a pattern for a narrower, single-topic deck if one is ever
  requested instead of a full monthly follow-up.
- **Two training decks** are the source for the visual-effects reference
  below — real JYSK lifestyle photography and a consistent flat icon
  set, not generic stock imagery.

### Real DM/SM monthly-meeting slide builders (`scripts/dm_meeting_helpers.py`)

The three patterns above, applied (Adam: "додай ці три елементи в наш
дек"), as reusable builders — not re-derived per deck, since every
monthly follow-up deck on the official template wants the same three:

- `agenda_table_slide(prs, items)` — `items` a list of `(topic,
  minutes)` tuples. Builds the real 2-column Тема/Час table in the
  Agenda layout's content placeholder plus a "РАЗОМ / N год M хв"
  duration callout in its small left box (computed from the items'
  minutes, not hand-typed — so it can't drift out of sync with the
  table like a hardcoded "ТРИ години" would). One real API gap found
  building this: the content placeholder is nominally an OBJECT/content
  placeholder, but the installed python-pptx (1.0.2) resolves it to a
  plain `SlidePlaceholder` with no `.insert_table()` — so this reads the
  placeholder's own `left/top/width/height` and adds a free table shape
  at that exact position instead of using the placeholder API, then
  leaves the now-empty placeholder alone (its "Click to edit..." prompt
  text is edit-mode-only chrome in PowerPoint, never rendered in the
  saved file or any export).
- `goal_statement_slide(prs, title, statement, bullets, add_bullets_fn)`
  — the "Виторг — основна ціль" framing slide, placed right after the
  results breaker and before the first KPI table. `add_bullets_fn` is
  passed in rather than imported because the actual bullet-box builder
  is deck-specific (e.g. `build_full_v7.py`'s `_add_bullets`, which
  already knows that deck's `LOGO_SAFE_Y` ceiling) — this module doesn't
  own slide-content safe zones, the calling deck does.
- The "Домовленості" closing slide itself stays a plain deck-specific
  textbox (not pulled into this module) since its real content is
  deck/month data, not a structural pattern — but see the reference-decks
  README for the five real standing items and reuse them as the starting
  point rather than a generic "fill in during discussion" placeholder.

Both builders assume the official
`assets/official/JYSK_main_template_FY27_indoor.pptx` layouts (Agenda =
layout 1, "Заголовок і текст" = layout 21) and their placeholder `idx`
values — same template every other OLE-table deck in this project is
built on, not a new assumption.

## Visual effects reference (from the training-deck samples)

Adam: "в ній використані і фото, і картинки, і візуальні різні ефекти...
використовуй їх за потреби." Pulled from the real OOXML of
`training_2day_expert_deck_sample.pptx` (confirmed by reading the actual
`<a:effectLst>`/`<a:prstGeom>` XML and sampling real embedded media, not
guessed) — these are techniques to reach for on a custom-canvas deck
(`layout_helpers.py` style), on top of what's already documented there:

- **The JYSK "card" recipe** (by far the single most common effect in
  that deck — 179 uses of the exact same shadow): a white
  `ROUNDED_RECTANGLE` (`adj`/corner radius around 6%), a thin
  `#C7D0E6` border, and a soft **navy-tinted** shadow — not a generic
  black shadow — `blurRad=76200 dist=19050 dir=5400000 algn="t"`, color
  `#143C8A` at only **14% alpha**. This is subtler and more on-brand than
  the designer-presentations skill's generic black/gray card shadow;
  prefer this exact recipe (color + the same low alpha) for a JYSK deck
  specifically. Implemented as `_add_soft_shadow(shape, ...)` in
  `layout_helpers.py` (and wired into `_rect(..., shadow=True)` as a
  one-liner) — not just described here, since python-pptx has no
  high-level API for a custom shape shadow and needs the same
  direct-XML approach as `_set_fill_alpha`. One real bug caught while
  building it: `shp.shadow.inherit = False` (already used elsewhere in
  this file) leaves an empty `<a:effectLst/>` behind, and OOXML only
  allows one `effectLst` per shape — appending a second one instead of
  replacing it produces a file PowerPoint flags for repair. Fixed by
  finding and removing any existing `effectLst` before adding the real
  one.
- **Photo framing, three variants depending on intent**: a plain `rect`
  (document/neutral, the large majority), a `roundRect` + a stronger
  black shadow (`blurRad=152400 alpha=25%`) for a "hero" feature photo,
  or a `roundRect` with a **solid colored border and no shadow** used as
  a correct/incorrect example callout in a training context (green
  `#469419` border = "this is the right way") — that last one is a
  training-specific pattern, not something to reuse for a KPI deck.
- **A thin full-width accent stripe along the slide's bottom edge**
  (a plain navy `#143C8A` rectangle, full slide width, a few pixels
  tall) as a simple footer accent — cheap, on-brand, worth using on a
  custom-canvas title/section slide.
- **Icon set**: flat, single-color, 256×256 PNG, white-on-brand-color-
  circle or plain colored silhouette (a checkmark-in-circle, a shop
  icon, a route/map-pin icon sampled directly) — same family as
  `scripts/make_icons.py` already generates; match this exact style
  (flat, single fill color, no gradient/outline) when generating a new
  icon rather than inventing a different style.
- **Process/flow shapes**: `chevron` (step arrows), `homePlate` (banner/
  next shapes), and `flowChartDisplay`/`flowChartConnector` for literal
  flowcharts — available `MSO_SHAPE` presets in python-pptx
  (`MSO_SHAPE.CHEVRON`, `MSO_SHAPE.HOME_PLATE`, etc.), not custom
  drawings; reach for these before hand-building a process diagram from
  rectangles and lines.
- **No gradients, no glow, reflection used exactly twice** (not a
  pattern worth adopting) — the deck's richness comes from real
  photography + shadow + icons, not from PowerPoint fill effects. Keep
  that restraint: a flat, photo-and-shadow-driven look reads as more
  premium than a gradient-heavy one for this brand.

## Alternate tool: `scripts/deck-kit.js`
Adam sent this file's full source directly (not a screenshot) — it's
almost certainly the actual engine behind `kyiv-1.pages.dev`, the site
he said generates presentations "by request" but that look bad. His
instruction: use it, only where it doesn't conflict with what's already
established in this skill. It's a Node/pptxgenjs design system: 6 themes
(`aurora`, `paper`, `sunset`, `forest`, `ocean`, `jysk`) × 14 layout
functions (`title`, `agenda`, `section`, `statement`, `cards`, `stats`,
`split`, `timeline`, `compare`, `chart`, `table`, `quote`, `gallery`,
`closing`), auto-generated gradient-mesh backgrounds and abstract art
(no photo needed), 1500+ Lucide icons rendered to on-brand-colored PNGs,
rounded/cover-fit photo handling, native (editable) PowerPoint charts
and tables, WCAG auto-contrast text-on-fill, and speaker notes.

**Always use the `jysk` theme for Adam's decks** — it's the only one of
the six set to Verdana; the other five use Georgia/Calibri/Cambria and
are explicitly commented in the file itself as approximations for
*non*-JYSK-branded use. The `jysk` theme's `primary`/`secondary` (`143C8A`,
`4BA4DF`) are exactly `accent1`/`accent2` from the real template theme
XML documented above — confirms it was built against the same source of
truth. Its `body.text` (`565655`) matches the official Dark-Grey-Text-2
rule too. Its `accent` (`E30613`) is a red not present in the official
template's accent1-6 — that's JYSK's actual public/retail brand red
(store signage, bags), not from the internal PowerPoint theme; reasonable
for an occasional sale/promo/warning accent, but don't treat it as
verified-from-the-same-source the way primary/secondary are.

**Setup** (packages are not preinstalled in this sandbox — the file's
own header comment claiming `NODE_PATH=$(npm root -g)` finds them is
wrong here; ignore it and just install locally):
```bash
npm init -y && npm install pptxgenjs sharp react react-dom react-icons
node your-deck.js   # plain `require('./deck-kit.js')`, no NODE_PATH needed
```
Icon names must be exact Lucide names (check `Object.keys(require('react-icons/lu'))`
if unsure — e.g. it's `ChartColumn` not `BarChart` in the installed
version) — a bad name throws immediately with a clear message rather
than silently rendering nothing.

**`scripts/demo.js`** — the upstream pptx-designer-kit project's own worked
example (Adam sent it, mislabeled with a `.pptx` extension — it's actually
this JS source). Run with `node demo.js jysk` for a realistic 13-slide
Q3/Q4 district-manager deck (generic store codes J101/J102/etc., not
Kyiv-1's real ones) exercising all 14 layouts end-to-end. Useful as a
sanity-check after any deck-kit.js edit, or as a copy-paste starting point
for a new deck's structure.

### Workflow for a deck-kit deck (Adam's own process)
Goal: not "title + bullets" but a design-studio-level deck — a real
story, visual hierarchy, one consistent design system, native (editable)
charts and tables. Follow this in order:

1. **Brief.** Establish: topic, audience, the action they should take
   afterward, length, language, brand/template. Missing something? Pick
   a sensible default, name the assumption in the first line of your
   reply, and keep going rather than stopping to ask. If Adam hands you
   a corporate `.pptx`/`.potx` (one of the official templates above),
   work inside it — its fonts/colors/layouts — and don't change its
   overall formatting; that's the **official-templates path**, not this
   one.
2. **The rest of this process — story structure, the 14-layout catalog,
   mandatory design rules (word counts, font sizes, margins, contrast,
   native charts), safe fonts, and the QA step — is the
   `anthropic-skills:designer-presentations` skill, verbatim.** Adam then
   sent the actual upstream project this all comes from — a small
   open-source kit called **pptx-designer-kit** — as four files:
   `deck-kit.js` itself, `README.md` (project overview, install, a
   minimal example, the custom-theme recipe, limitations), and
   `MASTER_PROMPT.md` (the same 3 portable prompts + a fuller pre-show
   checklist than what he'd pasted earlier). Its own `SKILL.md` is
   byte-for-byte the `anthropic-skills:designer-presentations` skill —
   confirms that skill *is* this project's Claude integration, not a
   coincidence. All three docs saved verbatim next to `deck-kit.js` in
   `scripts/` (`scripts/README.md`, `scripts/MASTER_PROMPT.md`) — read
   those for anything about the kit itself (custom themes, photo usage,
   limitations, alternatives); **invoke the
   `anthropic-skills:designer-presentations` skill** for the actual
   build process rather than duplicating it here. This file only needs
   the JYSK-specific deltas on top of both:
   - **Theme**: always `jysk` (see above), never the other five.
   - **QA step**: that skill's mandatory visual pass (`soffice` → PDF →
     `pdftoppm` → look at every slide) **fails outright in this sandbox**
     for any pptx (see "LibreOffice can't render any pptx" below).
     Substitute `validate.py` (no `--original`, not template-derived) +
     `markitdown` content QA + the geometry-bounds shape check. Tested:
     all 14 layouts on `jysk` produced zero out-of-bounds shapes and a
     clean `validate.py` pass — the kit's proportional layout math is
     more robust than hand-rolled EMU offsets, so this is more a
     regression guard here than an active bug-finder (unlike with
     `layout_helpers.py`, which it did catch real bugs in). If a real
     desktop PowerPoint/LibreOffice is available (e.g. Adam's own
     machine), that visual pass is still the better check — say plainly
     when it wasn't possible rather than implying one was done.
   - **No `deck-kit.js` in a session?** Fall back to `layout_helpers.py`,
     or that skill's own minimal single-theme inline snippet — same
     techniques, fewer layouts/themes built out.

**When to reach for `layout_helpers.py` instead**: two patterns from
Adam's reference screenshots that deck-kit's 14 layouts don't cover
precisely — the exact dark-full-height-sidebar-with-big-number look
(`example_sidebar_checklist.png`; deck-kit's `agenda()` is the closest
built-in but visually different) and the before/after KPI pill
comparison (`example_kpi_pill_comparison.png`; deck-kit's `compare()` is
a left/right layout, not a per-row pill). Use those two `layout_helpers.py`
functions for that specific look; otherwise prefer deck-kit for a new
deck — it's the more complete, actively-maintained tool of the two.

**When to use the official `.pptx` templates instead of either**: a deck
must literally *be* one of the real templates — continuing Adam's own
monthly-report file, an actual congratulations card/poster from the A4/
SoMe/career-ladder templates. Those carry real corporate structure
(and, for the FY27 file, live data) that a from-scratch deck-kit/
layout_helpers deck can't substitute for.

## Designer-quality custom layouts (`scripts/layout_helpers.py`)

The Official formatting rules above govern **placeholder text inside the
official templates** — a Standard-slide table of numbers is correct but
plain, and Adam explicitly flagged decks built that way as looking bad
("презентації виглядають погано... потрібно щоб вони були дизайнерсько
привабливі"). For town-hall / KPI-story / "here's what changed" decks, use
these richer, fully custom canvases instead — built once from five real
reference screenshots he sent (colors sampled from the actual pixels, not
guessed), saved in `assets/layout_examples/`:

| Function | Reference image | What it's for |
|---|---|---|
| `add_sidebar_checklist_slide` | `example_sidebar_checklist.png` | A dark-navy sidebar (big number + framing text) beside a numbered 01-05 checklist with a ✓ per completed item and a closing statement. Use for "here's what we did / here's the plan" recaps. |
| `add_kpi_comparison_slide` | `example_kpi_pill_comparison.png` | One row per KPI: a "before" pill, an arrow, an "after" pill colored by whether the change is good/bad/flat, plus a delta and a note. Use for target-vs-target-changed or period-over-period KPI stories — a much clearer alternative to a raw numbers table when the story is "did it get better or worse." |
| `add_stat_bar_insight_slide` | `example_stat_bar_insight.png` | Big stat-card number + intro sentence, a ranked horizontal bar list below, an optional photo on the right, and a bottom "Головне: ..." insight banner. This is the **same recipe as the `jysk-dashboard-report` skill's web dashboard** — use it whenever a slide would otherwise be "here's a ranked table," e.g. staffing coverage, vacancy age, KPI-vs-goal ranking. |
| `add_photo_statement_slide` | `example_photo_statement.webp` | Full-bleed photo (or navy fallback with no photo) with a semi-transparent card carrying a short bold statement. Use for section-opener "why this matters" slides. |
| `add_photo_diagram_card_slide` | `example_photo_diagram_banner.png` | A card holding a **real embedded screenshot/diagram** (org chart, process map — place the actual image, don't redraw it, same principle as the badges elsewhere in this skill) next to a navy "terms/timeline" card, over a photo or light background, with a bottom banner. Use for org-structure or process-change announcements. |

Palette used by these helpers (also defined as constants in the module) —
a deeper/richer set than the official theme's accent1-6, sampled from the
reference images, for emphasis on custom canvases specifically:
`HERO_NAVY #0B2E5C` (sidebars/banners/overlays) · `HEADLINE_NAVY #003B72`
(bold headlines/numbers) · `ACCENT_BLUE #2E6BE0` (bars/links) ·
`CHECK_NAVY #034A90` (icons — same as theme accent6) · `LIGHT_BLUE_BG
#EAF1FB` (stat cards, neutral "before" pills) · `SUCCESS_FILL/TEXT
#E7F3EC / #4C9A6E` · `WARN_FILL/TEXT #FBEAE5 / #E06A4E` (also the
attention-number color, e.g. a stat card's headline figure) ·
`NEUTRAL_FILL #EDEFF2` · `BODY_GRAY #565655` (secondary/description text —
still the official color even on a custom canvas).

Usage: `from layout_helpers import *`, call `blank_slide(prs, layout_idx)`
to get an empty slide (any layout works — these helpers never touch
inherited placeholders, they draw everything themselves), then call the
pattern function on it. Every function is plain shapes/textboxes — no
placeholder XML wrangling needed. Transparency (the photo-veil overlays,
the semi-transparent statement card) needs `_set_fill_alpha()` since
python-pptx has no public API for it — it pokes `<a:alpha>` into the
shape's `<a:srgbClr>` directly; reuse that helper rather than
reintroducing the same XML poke elsewhere.

**Mix, don't replace wholesale**: a deck can combine official-template
Standard slides (for dense per-store tables like vacancies/deliveries,
where a plain table is genuinely the clearest format) with these custom
slides (for the overview/insight/story slides) — that's exactly how the
reference screenshots' own source deck reads. Don't force every single
slide into one of these five patterns if a plain table serves the content
better; the goal is matching the visual bar Adam showed, not templating
for its own sake.

**No LibreOffice visual QA is possible in this sandbox for *any* pptx**
(confirmed broader than previously thought — even a blank default-template
deck with no JYSK content fails `soffice --headless --convert-to pdf`
with "source file could not be loaded"; this is an environment-wide
limitation, not specific to the JYSK template family noted elsewhere in
this file). Compensate by printing every shape's bounding box
(`shape.left/top/width/height`) after building and checking left≥0,
top≥0, right≤slide_width, bottom≤slide_height, and that nothing
unintentionally overlaps — this catches the layout math errors visual QA
would normally catch, just not sub-pixel spacing issues. **This is not
optional busywork**: running it on the first monthly-meeting deck built
with these helpers caught two real bugs before shipping — a KPI table
whose column widths summed to 1,000,000 EMU more than the width passed
to `add_table` (table silently renders at the *sum of its column
widths*, ignoring the width argument, and the excess ran off the right
edge of the slide) and a caption textbox positioned 42,000 EMU past the
bottom edge. Always run this check after building, on every slide, not
just the custom-canvas ones — a plain `add_table` call on an official
Standard slide is just as capable of this exact mismatch. Say plainly in
the handoff that visual QA wasn't possible, same as elsewhere in this file.

## Workflow for building a deck

1. **Pick the right official template first.** Monthly district
   report / general presentation → `JYSK_main_template_FY27_indoor.pptx`
   (Adam's own working file — reuse its existing section order for a
   monthly report). A one-off deck where that existing content would get
   in the way → `JYSK_official_template.pptx` (same master, blank).
   Career/promotion poster → career-ladder A3. Personal congratulations/
   welcome (new hire, work anniversary, recognition) → A4 print or SoMe
   square depending on where it'll be used.
   Open it with the `pptx` skill's tooling (python-pptx) and build on its
   actual layouts/master rather than a blank deck — this is the biggest
   quality difference between "looks like JYSK" and "is JYSK". Follow the
   **Official formatting rules** below exactly (layout choice, font,
   sizes) — they're mandatory, not stylistic defaults.
2. **Clarify before building** (if not already given): topic/audience/
   goal, rough slide count, and any data to pull in (Adam may point at the
   Kyiv-1 dashboard in this repo for real district numbers — don't
   fabricate figures, ask or pull real ones). For a congratulations
   card: who, their role/store, and the occasion.
3. **Apply the brand ruleset below** on top of the template — the extra
   motifs (icon set, TOP 5 badge, tone rules) that aren't already baked
   into the official files.
4. **When Adam sends a new element, rule, or template file**: capture it
   here (edit this file) and save any real file under the matching
   `assets/` subfolder, briefly confirm what was added/where, then
   continue with whatever deck was in progress.

## Adam's 10 stores (Kyiv 1)
Recurring reference list, confirmed across two real decks (the FY27
monthly template and the mobility analysis below) — use these codes to
filter any company-wide export down to "his" district rather than
re-deriving the list each time:

`J015` SkyMall (Kyiv) · `J027` Kvadrat (Kyiv) · `J029` Prospect (Kyiv) ·
`J104` Pohreby · `J109` LIvoberegna (Kyiv) · `J120` Rayon (Kyiv) ·
`J009` Terminal (Brovary) · `J035` Hollywood (Chernigiv) · `J050` TSUM /
MegaCenter (Chernihiv) · `J121` Inzhur Park / Inghur (Brovary).

If a new export uses a different district-name column instead of site
codes, note that JYSK's own formal district names (e.g. "Kyiv East",
"Kyiv South", "West", "Podil"...) don't include a "Kyiv 1" — that's
Adam's own dashboard nickname for this specific 10-store set, not an
official code. Filter by the site codes above, not by district name.
The site name for J050/J121 differs slightly from the corporate FY27
export (TSUM vs MegaCenter, Inzhur Park vs Inghur) — same store, two
systems' naming; when a deck is built **from the site**, use the site's
own name (it's the more current/authoritative one for that source), and
when built from a corporate export, use that export's name — don't
silently "correct" one to match the other.

## Data-driven analysis decks (KPI exports, mobility, etc.)
A second deck pattern besides the monthly report and congratulations
cards: Adam sends a company-wide `.xlsx` export (one row per store/
district) and asks for a short deck on **his** stores only, with
comments. Recipe (built once for a MYJYSK/StoreFront mobile-usage
export — reuse the shape for the next KPI export):

1. **Filter to his 10 stores** (list above) by site code — never by
   guessing which rows "look like Kyiv".
2. **Understand the sheet's real column layout before trusting any
   header.** A JYSK export's row-1 headers can be a merged group title
   that doesn't line up 1:1 with the data columns below it (this bit us
   once: a column literally headed "Module StoreFront" turned out to
   hold each store's *name*, not a StoreFront percentage — the real
   metric columns were the ones after it). Print a few raw data rows
   next to both header rows before deciding what column N means, and
   check row 2 for a units row (`%`, blank, ...) as a sanity cross-check.
   A file can also carry two *similarly-named but distinct* KPIs (this
   export had "Share of Mobile usage" — overall, goal 85% — on one
   sheet, and 12 separate StoreFront sub-action percentages — goal 75%
   per Adam's own brief, no single combined column — on another). Don't
   conflate them in the deck; label each with which sheet/goal it's from.
3. **Structure**: title → one-slide "why this matters" (only if Adam
   supplied that context) → district overview (headline metric vs. goal,
   gap in absolute points, all stores ranked) → per-store comments as a
   table (split 5+5 across two slides so it stays readable) → focus
   zones (weakest/strongest sub-metrics averaged across the district) →
   agreements/next steps. This mirrors the FY27 monthly report's own
   shape (overview → detail → focus → agreements) — reuse it rather than
   inventing a new one per topic.
4. **A blank cell is not a zero.** Don't write a store's comment as if a
   missing value were a failing score — say the function has no
   recorded data and that it's worth checking whether the store uses it
   at all, rather than implying underperformance from an absence.
5. **Rank stores, but only ever name the low end as "потребує уваги"** /
   "найбільший розрив до цілі" (biggest gap to the goal, a fact about the
   number) — never "найгірший" applied to the store. See Tone rules below.

### A third data source: the Kyiv-1 site itself (this repo)
Besides a corporate `.xlsx`/PDF export and Adam-supplied text, "дані з
сайту" means the Kyiv-1 dashboard (`index.html`) and its Firebase
project — genuinely different data from any corporate sales/KPI export
(staffing levels, vacancies, ambassador responsibility zones, delivery/
transfer costs — operational district-management data, not sales KPIs):

- **Live, Firestore-backed** (project `district-tracker-ef4c6`): `staffing-stores`,
  `vacancies`, `zones` — read the same way the `kyiv1-daily-check` skill
  reads Telegram-bot chat docs:
  `curl "https://firestore.googleapis.com/v1/projects/district-tracker-ef4c6/databases/(default)/documents/kyiv1/<doc>"`,
  then pull `fields.value.stringValue` and `json.loads` it (each doc is
  one JSON array/object as a string, not native Firestore fields). This
  worked with no auth needed as of 2026-09-13; as of 2026-09-20 the same
  call returns `403 PERMISSION_DENIED` — the rules were tightened
  sometime in between (README's own security note always warned this was
  possible). **Don't assume open access still holds** — try it fresh each
  time, and if it 403s, say so plainly and fall back to the most recent
  cached snapshot you have (label it with its real date, never pass old
  numbers off as current) rather than silently failing or guessing.
  Mention the 403 to Adam — it likely affects `kyiv1-daily-check` too.
- **Static, in the HTML itself**: `DELIVERIES_BY_MONTH` in `index.html` —
  a JS object literal (unquoted keys, single-quoted strings), not JSON.
  Don't hand-parse it with regex/`json.loads` — extract the literal text
  and run it through `node` with a one-line script that assigns it to a
  var and `JSON.stringify`s it to stdout; trying to regex-munge Cyrillic
  text containing apostrophes into valid JSON is exactly the kind of
  fragile shortcut that silently mangles a real address or reason string.
- **`vacancies` time-to-fill**: the dashboard's own target is 30 days
  (from its README) — compute `today - openedDate` per row yourself,
  there's no pre-computed "days open" or "overdue" field.
- **`zones`**: each has a `progress` field that may simply be unfilled
  (seen at `0` across every single row at once) — that's the "blank
  cell is not a zero" trap again, at the level of an entire dataset this
  time: report zone coverage/ownership (who's responsible for what) as
  the finding, not "0% progress everywhere", and flag the tracker itself
  as unfilled if every row reads the same suspicious default.

**A real monthly meeting deck usually needs both this and the corporate
export together** — site data alone (staffing/vacancies/zones/deliveries)
skips the section Adam's own real decks always lead with: sales KPI
(Sales Index / Performance / Productivity, from `JYSK_main_template_
FY27_indoor.pptx` or a fresh corporate export). When asked to "add KPI"
to a site-data deck, pull that from the FY27 template's own real tables
(`python-pptx`, `shape.has_table`, filter rows to the 10 store codes —
don't retype numbers by hand off a `markitdown` dump, read the table
object directly) and insert it as its own slide(s) **first**, right
after Agenda and before the operational slides — that's the order
Adam's own deck uses ("Результати [місяця] основні КРІ" leads every
agenda seen so far). Update the Agenda slide's bullet list to match
once a section is added or reordered, not just the new content slide.

### Filling placeholders when the template gives you an empty slide
`add_slide.py <template> slideLayoutN.xml` (see the `pptx` skill) creates
a slide that *references* the layout but has no shapes of its own —
python-pptx's `slide.placeholders` comes back empty, so there's nothing
to just "type into". Don't fight this by hand-crafting placeholder XML;
instead read the layout's own placeholder geometry once and place a
plain textbox/table at those exact coordinates with the formatting the
Official formatting rules table above mandates for that layout (Verdana,
`#565655`, the right pt size) — visually equivalent, much less fragile:

```python
import re
data = open(f"unpacked/ppt/slideLayouts/slideLayout{N}.xml", encoding="utf-8").read()
for m in re.finditer(r"<p:sp>.*?</p:sp>", data, re.S):
    ph = re.search(r'<p:ph([^/]*)/>', m.group(0))
    xfrm = re.search(r'<a:off x="(\d+)" y="(\d+)"/><a:ext cx="(\d+)" cy="(\d+)"/>', m.group(0))
    print(ph.group(1) if ph else "NO-PH", xfrm.groups() if xfrm else None)
```
Then `slide.shapes.add_textbox(Emu(x), Emu(y), Emu(cx), Emu(cy))` (or
`add_table`) at those numbers, with `font.name = "Verdana"`,
`font.color.rgb = RGBColor(0x56,0x56,0x55)`, and the mandated size. This
is exactly how the mobility deck's title/body/table slides were built.

## Brand ruleset (extras on top of the official templates)

### Speech-bubble callout motif
Confirmed as an **official layout family** (`JYSK_official_template.pptx`
layouts "1–9 Breaker Small Speech Bubble") plus the standalone
"Proud to be JYSK" congratulations campaign (A4/SoMe templates above).
Rounded speech-bubble shape, navy gradient fill (accent1/accent6 range),
tail pointing down-left, bold white Verdana text, short 2–4 word punchy
lines, often two stacked (bold headline + lighter second line). Hand-built
reference recreations (from before the official files arrived) are in
`assets/bubbles/` — prefer pulling the **real** bubble shape out of the
"Breaker Small Speech Bubble" layouts in the official template now that
it's available, and fall back to `scripts/make_bubble.py` only for a
quick one-off when opening the real template isn't practical.
- `bubble_strong_teams.png` — "Strong teams" / "Great engagement"
- `bubble_proud_to_be_jysk.png` — "Proud to be" / "**JYSK**"
- `bubble_jysk_influencer.png` — "**JYSK** influencer"
- `bubble_pratsuy_viddano.png` — "Працюй віддано" / "**Зустрічай можливості**"
- `bubble_cylni_komandy.png` — "**Сильні команди**" / "Залученість кожного"
- `bubble_template.png` — blank placeholder-text version, for reference

Use case: a single bold callout/tagline overlaid on a photo or divider
slide — one bubble per slide, not decoratively scattered. Ukrainian and
English versions both appear in source material — match whichever language
the deck is being built in; don't mix languages in one bubble.

### TOP 5 store-readiness hand icon
A real, official vector asset (`JUA_JYSK_TopFive_icon.ai`, rendered to
PNG) — directly relevant to Adam's own job (monthly store visits): a navy
hand with 5 fingers, each finger labeled with a store-readiness checklist
item, "ТОП 5" in bold beside it. Two variants saved in `assets/badges/`:
- `top5_hand_checklist_ua.png` — full version with the real Ukrainian
  checklist: Центральний прохід, Вхід, Касова зона, Чисто та охайно,
  Форма персоналу, and "Готовий до Покупця" (ready-for-customer) in the
  palm. Reuse this structure (5 labeled fingers) for any "top 5 focus
  areas" slide — swap the 5 labels, keep the hand/palm layout.
- `top5_hand_circle_badge.png` — clean circle-badge variant (hand + "TOP
  5" only, no labels) for a smaller icon/stamp use.

### Icon set (benefits/HR line icons)
A consistent navy-blue **outline** icon style (uniform stroke width,
rounded caps, no fill except small accent dots/plus marks), ~34 icons,
HR/benefits themed (insurance, bonuses, training, discounts, teamwork,
recognition, work-life balance, etc.) — hand-recreated (not an official
source file yet) in `assets/icons/icons_benefits_set.png` (+ `.svg`,
7×5 grid). `scripts/make_icons.py` regenerates/extends it — append a
`"name": '''<svg body>'''` entry to the `ICONS` dict (100×100 local
coordinate box, no `fill`/`stroke` on the shapes themselves).

Use case: one icon per benefit/topic in a grid or list slide — icon +
short label, consistent size, all in the same navy stroke, never mixed
with a different icon style on the same slide.

### Circle badges (campaign/recognition stamps)
The recurring JYSK campaign-badge formula, now well established: a thin
black circle outline, a blue **sunburst** (radiating alternating-blue
wedges) filling most of the inside, one or two diagonal **ribbon banners**
(navy gradient, black drop-shadow offset, bold italic white Verdana text
with a black outline) crossing the middle, and often a flat-illustration
hand/object on top of the sunburst. Sometimes a small arc of plain black
text above the circle (e.g. "JYSK'S" above "BEST" / "CUSTOMER SERVICE").

**Real official files** (rendered from the actual PDFs Adam sent — full
fidelity, in `assets/badges/`):
- `badge_sleep_challenge.png` — "SLEEP CHALLENGE": illustrated mattress +
  pillow + folded duvet on the sunburst, "JYSK" arced on top.
- `badge_see_it_fix_it.png` — "SEE IT" / "FIX IT": four hands around the
  circle (screwdriver, crumpled paper being picked up, folded towels,
  a phone showing the JYSK app) — a maintenance/report-an-issue campaign.
- `badge_everyone_better_than_average.png` — "EVERYONE BETTER" / "THAN
  AVERAGE": a boxing glove punching upward next to a rising black arrow,
  motion lines/lightning bolts.
- `top5_hand_checklist_ua.png` / `top5_hand_circle_badge.png` — see the
  TOP 5 section above (from the real `.ai` file).

**Recreated from the base formula** (no source file yet — generated with
`scripts/make_badge.py`, which draws the sunburst+ribbon(s) base
precisely but does **not** attempt photorealistic hand/object
illustrations — ask Adam for the source file if a specific hand-drawn
icon needs to be pixel-accurate):
- `badge_simplify.png` — "SIMPLIFY" (single ribbon, no icon)
- `badge_efficiency.png` — "EFFICIENCY" (single ribbon, no icon)
- `badge_best_practice.png` — "BEST" / "PRACTICE" (real source had a
  thumbs-up hand on the sunburst — not recreated here)
- `badge_go_execute.png` — "GO" / "EXECUTE" (real source had two
  fist-bumping hands — not recreated here)
- `badge_go_digital.png` — "GO" / "DIGITAL" (real source had a hand
  holding a phone showing the JYSK app — not recreated here)
- `badge_best_customer_service.png` — "JYSK'S" arc + "BEST" / "CUSTOMER
  SERVICE" ribbons (real source had a plain sunburst, no icon — this one's
  actually complete)
- `badge_template.png` / `.svg` — blank placeholder-text version to build
  a new one-off badge from
- Still only described, not built: "JYSK'S BEST SALES ATTITUDE" (raised
  fist + comic impact dots), "1 MORE" (pointing finger)

**To make a new badge**: call `make_badge(lines, out_path, top_label=...)`
in `scripts/make_badge.py` — `lines` is 1 or 2 ribbon strings — then
render with `scripts/render_svg.js`. For a badge that needs a specific
hand/object illustration to look right (not just text), ask Adam for the
source PDF/AI file and render it with PyMuPDF (`pip install pymupdf`,
`page.get_pixmap(matrix=fitz.Matrix(N,N), alpha=True)` — see how the real
badges above were produced) rather than hand-drawing the illustration.

### Telegram group cover / avatar
`assets/telegram/group_cover_kyiv1.svg` (+ `.png`, 1024×1024) — a square
JYSK-branded cover for the Kyiv-1 Telegram group/channel avatar: navy
radial gradient background (`#143C8A`→`#0A2A63`), a bold white "K1"
monogram, a red (`#E30613`) divider, "KYIV 1" / "JYSK" wordmark below,
all kept inside a ~430px-radius circle centered on the 1024×1024 canvas
since Telegram crops avatars to a circle — corner decoration sits outside
that safe zone. Built with `scripts/render_svg.js` (same pattern as
bubbles/icons/badges above). Reuse/restyle this file for any other
Telegram avatar request rather than starting from scratch — swap the
monogram/label text in the SVG and re-render.

### Corporate photography style
Adam has access to JYSK's real staff/store/warehouse photo library
(bright, candid, JYSK-branded polos/name tags, logo badge bottom-right
corner on 16:9 photo slides). Don't try to catalog or recreate this
library — it's stock photography, not a brand asset to redraw. When a
deck needs specific photos, ask Adam to attach the actual files (or note
which ones from a batch he's already sent) rather than reusing a generic
placeholder.

### Tone / content rules
- No judgmental superlatives for underperformers — same rule already
  established for the dashboard (`jysk-dashboard-report` skill): never
  "найгірший"/"найслабший" for a store, person, or team. Use neutral
  framing ("потребує уваги", "фокус на") instead. Applies to any
  ranked/comparison slide.
- Don't fabricate data, quotes, or survey results to fill a slide — pull
  real numbers (dashboard, Adam-provided) or ask.

## Capturing new elements (do this, don't just describe)
Real files (an actual `.pptx`, `.ai`, image attachment — not pasted
inline) are the gold standard: unzip/read them for real assets, colors,
fonts, and layouts, and save them under `assets/official/` (templates) or
the matching subfolder. This is dramatically better than redrawing — it's
what happened here: an early hand-drawn color guess was replaced by the
real `#143C8A` navy the moment the official files arrived.

For an image only **pasted inline** in chat (no file path — this session
can't copy those bytes):
1. Look closely at it and reproduce it as SVG — see
   `scripts/make_bubble.py` and `scripts/make_icons.py` for the two
   patterns established so far. Extend one of those, or add a new
   generator script, rather than starting from zero each time.
2. Render SVG → PNG with `scripts/render_svg.js` (needs `playwright-core`
   installed fresh each session — see the comment at the top of that
   script) — `.pptx` files need a raster image, python-pptx can't place
   SVG directly.
3. Save both `.svg` and `.png` under the right `assets/<category>/`
   subfolder, reference them from the relevant section above, and commit
   + push (this repo's normal git flow — no PR needed just for a skill
   update unless asked).

If Adam wants an **official/trademarked graphic** (the JYSK bird logo,
an exact campaign badge) reused pixel-for-pixel, always prefer asking for
the real file over redrawing — a slightly-off recreation of an official
mark looks wrong in a real deck, and the official templates likely
already carry the real logo embedded (check `assets/official/` first).

## Known limitation: LibreOffice can't render any pptx in this sandbox
Every real JYSK `.pptx` in `assets/official/` (main FY27, generic guide,
career-ladder, A4, SoMe) fails `soffice --headless --convert-to pdf`
outright ("source file could not be loaded") in this sandbox — not a
specific slide or an OLE object, the whole file. Originally thought
template-specific (large `oleObject1.bin`, `.wdp` media, a modern-Office
feature); since disproven — a completely blank `python-pptx.Presentation()`
with a single empty slide fails the exact same way, so this is an
environment-wide LibreOffice problem, not anything about these templates.
Not worth chasing further (building/editing works fine regardless).
Practical effect: the `pptx`
skill's usual visual-QA step (soffice → pdf → pdftoppm → look at slide
images) **is not available for decks built on these templates**. Compensate
with what still works — `markitdown` content QA (including the
placeholder-leftover grep), `validate.py --original <template>` for file
integrity, and reading exact placeholder/table geometry from the layout
XML via python-pptx so text is positioned deliberately rather than
guessed — and say plainly in the handoff that visual QA wasn't possible,
rather than implying a render was checked when it wasn't.

## Open items
- No standalone JYSK bird-logo file extracted yet — it's embedded inside
  the official template masters; pull it from there when needed rather
  than asking Adam to re-send it, unless a standalone file turns out to
  be more convenient.
- A few circle badges are still hand-recreated without their real
  hand/object illustration (BEST PRACTICE, GO EXECUTE, GO DIGITAL) or not
  built at all yet ("JYSK'S BEST SALES ATTITUDE", "1 MORE") — see the
  Circle badges section above; ask for the source PDF/AI if one is needed
  pixel-accurate.
- `JYSK_main_template_FY27_indoor.pptx` already has real September Kyiv-1
  numbers in it (slides 6–12) — when building on it for a *different*
  month, replace that data rather than leaving stale numbers in a new
  deck.
