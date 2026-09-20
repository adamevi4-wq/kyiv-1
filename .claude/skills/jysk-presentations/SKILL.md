---
name: jysk-presentations
description: JYSK Ukraine brand kit and workflow for building PowerPoint (.pptx) presentations for Adam (district manager, 10 stores) — real official JYSK template files (master deck, A3 career-ladder poster, A4 congratulations card, SoMe square card), the accumulated visual language (speech-bubble callouts, benefits icon set, TOP 5 store-readiness hand icon, circle badges), official brand colors/font, `scripts/deck-kit.js` (Adam's own Node/pptxgenjs design-system — the primary tool for a new general/topic deck, 14 layouts × 6 themes incl. a Verdana/navy `jysk` theme), `scripts/layout_helpers.py` (python-pptx custom layouts for the handful of patterns deck-kit doesn't cover), and how to turn it all into an actual deck via the pptx skill. Use this whenever Adam asks for a JYSK presentation/slides/poster/social card, says a deck looks plain/boring/needs to be more designer-attractive, or sends new brand elements (screenshots or files: templates, icons, bubbles, slogans, badges, reference slide layouts, deck-kit source) or new rules ("always/never do X") to add to the house style. Growing document — append new elements/rules to it rather than treating them as one-off instructions.
---

# JYSK presentation brand kit & workflow

This is the living brand kit for presentations/posters/social cards Adam
(JYSK Ukraine district manager) asks for. He builds it up by sending real
files and screenshots over multiple conversations — treat every such
message as an addition to this file (and `assets/`), not a one-off answer.

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

## Primary tool for new decks: `scripts/deck-kit.js`
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
2. **Story before design.** Sequence: hook → context/problem → evidence
   → solution → plan → call to action. Roughly half as many slides as
   minutes. Every slide gets a headline that's a complete claim under 60
   characters ("Конверсія виросла до 6,1% завдяки сервісу", not
   "Результати") and exactly one main message.
3. **Layout per slide, from the catalog below.** Never more than two
   consecutive slides using the same layout. "Sandwich" structure: dark
   `title`/`section`/`closing` bookending lighter-mode content slides
   (matches the kit's own hero/body mode split).
4. **Build** with `deck-kit.js` (see Setup above).
5. **QA — mandatory.** Adam's own process: convert to PDF
   (`soffice --headless --convert-to pdf`) → JPG
   (`pdftoppm -jpeg -r 72`) → look at every slide for cut-off/overflowing
   text, words broken mid-line, overlaps, weak contrast, empty gaps,
   uneven spacing; fix and regenerate; then run the file validator.
   **In this sandbox specifically, `soffice` fails outright on every
   pptx** (see "LibreOffice can't render any pptx" below) — that visual
   pass isn't available here. Substitute `validate.py` (no `--original`,
   this isn't template-derived) + `markitdown` content QA + the
   geometry-bounds shape check documented there. In testing, all 14
   layouts on the `jysk` theme produced zero out-of-bounds shapes and a
   clean `validate.py` pass — the kit's own layout math (proportional,
   not hardcoded EMU offsets) is more robust than hand-rolled
   positioning, so this check is more of a regression guard here than an
   active bug-finder, unlike with `layout_helpers.py`. If a real desktop
   PowerPoint/LibreOffice is available (Adam's own machine, unlike this
   sandbox), the real visual pass is still the better check — mention
   that a genuine render wasn't possible here rather than implying one
   was done.
6. **Handoff.** Deliver the `.pptx` plus a short table: slide / headline
   claim / layout used. Label any placeholder/illustrative numbers as
   such explicitly — never present made-up figures as real.

**Layout catalog** (`o` = the options object each layout function takes):

| Layout | Use when |
|---|---|
| `title` | Cover — eyebrow pill, big claim, art or photo beside it |
| `agenda` | Contents — big numbers in glass rows |
| `section` | Divider — giant translucent number |
| `statement` | One key claim, full slide |
| `cards` | 2–6 "icon, title, text" cards, one optionally featured/highlighted |
| `stats` | 2–4 hero numbers, one optionally featured, closing takeaway banner |
| `split` | Icon-marker bullet list + one large rounded image |
| `timeline` | 3–5 numbered-node steps |
| `compare` | Before/after, right card featured |
| `chart` | Native chart + insight panel with one big number |
| `table` | Styled table, one column optionally highlighted |
| `quote` | Quote/testimonial with initials avatar |
| `gallery` | 2-4 images with captions |
| `closing` | Final claim + contact pills |

**Mandatory design rules** (from Adam's own brief — apply on top of
whatever `deck-kit.js`'s defaults already do):
- One slide, one idea, ≤35 words (tables exempt).
- Sizes: headline 28-52pt, body 16-20pt, captions ≥12pt.
- Every slide needs a visual element — hero number, chart, icons in
  circles, image, or table. No slide of pure text.
- One dominant color (60-70%), 1-2 supporting tones, one sharp accent —
  picked for the topic, never a default blue.
- Margins ≥0.7", gaps between blocks 0.3", grid-aligned, body text
  left-aligned.
- All containers rounded (0.2-0.3" radius); soft shadow on light
  slides, "glass" (9%-opaque white) on dark ones.
- Emphasize only key words within a sentence (`**word**`), never the
  whole sentence.
- No decorative rule under a title, no colored edge stripes (exception:
  an actual requirement of a corporate template you're working inside).
- Charts are native (`addChart`), value labels on, one primary color
  with an accent on the leader, column axes start at zero, no 3D.
- Text on a color fill: pick by contrast (white or dark), minimum
  4.5:1.
- Speaker notes on every slide (`slide.addNotes(...)`), 2-4 sentences.

**Fonts** (rendered by the viewer's own machine — pick from what
actually ships everywhere): headline-safe-with-Cyrillic = Georgia,
Cambria; body-safe-with-Cyrillic = Calibri, Arial, Verdana. Google Fonts
(Inter, Montserrat, Playfair Display) are fine only if Adam confirms
they're installed wherever the deck will be opened/presented. Never
default to Aptos. (For the `jysk` theme specifically, Verdana throughout
is the rule regardless — see above.)

**Free resources**: icons — Lucide via `react-icons/lu` (already how
`deck-kit.js` does it). Photos — Unsplash/Pexels/Pixabay, check each
image's license before using it in a real deck. Fonts — Google Fonts.
Non-pptx alternatives if ever relevant — Marp, Slidev, reveal.js.

**No `deck-kit.js` available in a session?** Fall back to
`layout_helpers.py`, or the minimal inline pattern (mesh background +
Lucide icon + rich-text run splitter + glass/solid card, all in a few
dozen lines) that Adam's own brief includes as a last resort — it's the
same techniques `deck-kit.js` uses internally, just without the other 13
layouts and 5 themes built out.

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
