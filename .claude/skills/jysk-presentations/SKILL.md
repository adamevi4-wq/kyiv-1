---
name: jysk-presentations
description: JYSK Ukraine brand kit and workflow for building PowerPoint (.pptx) presentations for Adam (district manager, 10 stores) — the accumulated visual language (speech-bubble callouts, benefits icon set, colors, tone rules) plus how to turn it into an actual deck via the pptx skill. Use this whenever Adam asks for a JYSK presentation/slides, or sends new brand elements (screenshots of icons, bubbles, slogans, templates) or new rules ("always/never do X") to add to the house style. Growing document — append new elements/rules to it rather than treating them as one-off instructions.
---

# JYSK presentation brand kit & workflow

This is the living brand kit for presentations Adam (JYSK Ukraine district
manager) asks for. He builds it up by sending elements (screenshots of
graphics used in real JYSK decks) and rules over multiple conversations —
treat every such message as an addition to this file, not a one-off answer.

## Workflow for building a deck

1. **Clarify before building** (if not already given in the conversation):
   topic/audience/goal, rough number of slides, and any data to pull in
   (Adam may point at the Kyiv-1 dashboard in this repo for real district
   numbers — don't fabricate figures, ask or pull real ones).
2. **Use the `pptx` skill** for the actual file mechanics (python-pptx,
   layouts, saving a valid `.pptx`) — this file only governs the *visual
   language and content rules* on top of that, it doesn't replace it.
3. **Apply the brand ruleset below** — colors, the speech-bubble motif, the
   icon set, tone rules — rather than inventing a generic corporate-blue
   deck from scratch.
4. **When Adam sends a new element or rule** (mid-task or in a fresh
   conversation): capture it in the matching section below (edit this
   file), briefly confirm what was added/where, then continue with
   whatever deck was in progress. If he sends an actual image *file* (not
   just pasted inline), save it under `assets/` in this skill directory so
   future decks can embed the real graphic instead of a redrawn
   approximation — see "Capturing image assets" below.

## Brand ruleset

### Colors
- Primary: JYSK navy/blue (deep blue, `#12376B`–`#1B3A6B` range) — used for
  icons, speech-bubble fills, and headers. Matches the navy already used as
  `--navy`/`--navy-2` in this repo's `index.html` (see the
  `jysk-dashboard-report` skill) — reuse those tokens rather than picking a
  new blue when a deck lives alongside the dashboard's visual language.
- White text/icon strokes on navy fills; white or near-white slide
  backgrounds elsewhere. No other accent colors confirmed yet — ask before
  introducing green/red/orange unless Adam's source material has them.

### Speech-bubble callout motif
A rounded speech-bubble shape, solid or gradient navy-blue fill (radial
highlight top-left fading to darker navy), tail pointing down-left, bold
white sans-serif text centered inside — short (2-4 word) punchy lines,
often two stacked in one bubble (bold headline word + lighter second line),
e.g.:
- "Strong teams" / "Great engagement"
- "Proud to be" / "**JYSK**"
- "**JYSK** influencer"
- "Працюй віддано" / "**Зустрічай можливості**" (paired bubbles side by side)
- "**Сильні команди**" / "Залученість кожного"

Use case: a single bold callout/tagline overlaid on a photo or divider
slide — one bubble per slide, not decoratively scattered. Ukrainian and
English versions both appear in source material — match whichever language
the deck is being built in; don't mix languages in one bubble.

### Icon set (benefits/HR line icons)
A consistent navy-blue **outline** icon style (uniform stroke width,
rounded caps, no fill except small accent dots/plus marks), ~35 icons seen
so far, HR/benefits themed:
money-gift-hand, calendar-heart, gift-box, car, healthcare/stethoscope,
theater-masks (work-life/wellbeing), dumbbell (fitness), discount-tag,
cutlery (meals), shield-shield-heart (insurance/protection), scales
(balance), heart-clock (work-life balance), squares (flexibility), star-plus
(bonus), shield-person (security), piggy-bank (savings), trophy-star
(recognition/achievement), two-people (teamwork), running-person (growth),
calendar-clock (scheduling), people-high-five (celebration/team spirit),
graduation-cap (training/education), umbrella-euro (financial protection),
umbrella-people (protection), hands-heart (care/wellbeing), wrench-clock
(support), ladder (career growth), globe-hands (sustainability/global),
snowflake (seasonal), bicycle (commute/wellness), party-popper
(celebration), phone-star (app/loyalty), globe (international),
apple-coffee (health/nutrition).

Use case: one icon per benefit/topic in a grid or list slide (e.g. an
employee-benefits overview) — icon + short label, consistent size, all in
the same navy stroke color, never mixed with a different icon style on the
same slide.

### Tone / content rules
- No judgmental superlatives for underperformers — same rule already
  established for the dashboard (`jysk-dashboard-report` skill): never
  "найгірший"/"найслабший" for a store, person, or team. Use neutral
  framing ("потребує уваги", "фокус на") instead. Applies to any
  ranked/comparison slide.
- Don't fabricate data, quotes, or survey results to fill a slide — pull
  real numbers (dashboard, Adam-provided) or ask.

## Capturing image assets
Images pasted directly into the chat are visible for reference but aren't
files this session can copy — describe/catalog them here (as above) rather
than trying to embed the exact pixels. If Adam wants the *actual* graphics
(not a redrawn approximation) reused inside generated `.pptx` files, ask
him to send them as attached files (or share a path/link); save each under
`assets/` in this skill directory with a descriptive filename (e.g.
`assets/bubble-strong-teams-engagement.png`, `assets/icons-benefits-set.png`)
and reference that path when building future decks.

## Open items
- No confirmed brand font yet (source images show a clean geometric
  sans — don't guess a specific font name; ask, or fall back to a standard
  sans available to python-pptx/PowerPoint, e.g. Calibri/Segoe UI, until
  Adam specifies one).
- No slide-template/master deck received yet — decks built so far should
  use the rules above on a plain layout until an actual JYSK template
  arrives.
