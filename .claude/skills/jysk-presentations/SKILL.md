---
name: jysk-presentations
description: JYSK Ukraine brand kit and workflow for building PowerPoint (.pptx) presentations for Adam (district manager, 10 stores) — real official JYSK template files (master deck, A3 career-ladder poster, A4 congratulations card, SoMe square card), the accumulated visual language (speech-bubble callouts, benefits icon set, TOP 5 store-readiness hand icon, circle badges), official brand colors/font, and how to turn it all into an actual deck via the pptx skill. Use this whenever Adam asks for a JYSK presentation/slides/poster/social card, or sends new brand elements (screenshots or files: templates, icons, bubbles, slogans, badges) or new rules ("always/never do X") to add to the house style. Growing document — append new elements/rules to it rather than treating them as one-off instructions.
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
