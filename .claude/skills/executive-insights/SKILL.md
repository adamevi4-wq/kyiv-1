---
name: executive-insights
description: Turns Excel data analysis into executive-level presentation content — variance/trend/driver analysis with a "So What?" business read on every number, Action-Title slide architecture (the headline states the conclusion, not the topic), MECE bullet writing, and chart-type selection (waterfall for variance, stacked bar for composition, line for trend). Use this whenever Adam wants raw numbers turned into a story for a meeting — not just a table of figures but "what does this mean and what should we do about it" — when he asks what a slide's headline/takeaway should say, how to structure an analysis deck, or which chart fits a dataset. This is the analysis-and-narrative layer: for JYSK's own SAP BW Follow-up decks specifically, pair it with jysk-presentations' confirmed pivot-table visual convention rather than generic charts — see "Which visual, for which deck" below before picking a chart type.
---

# Executive insight & presentation storytelling

This is the layer between raw numbers and a finished slide: given data
(from `excel-analysis`-read spreadsheets, a JYSK SAP export, or any
other source), what's actually worth saying, how should a slide's
headline state it, and what visual makes the point fastest. It assumes
`excel-analysis` already got the numbers right and `jysk-presentations`
will do the actual JYSK-branded build — this skill is what goes *into*
that build: the story, not the file.

## Analysis: find the "So What?" before writing a single slide

A number alone isn't an insight. For every figure that's going on a
slide, push past "what is it" to "why does it matter and what should
change because of it":

- **Variance, not just values.** Don't report "sales were 7 017 thousand
  UAH" — report the gap from plan or prior year, in both % and absolute
  terms, and whether that gap is driven by one or two outliers or spread
  evenly (a district missing plan by 6% because one store is down 30% is
  a different story than six stores each 1% off).
- **Trend, not a snapshot.** A single month's index tells you where
  things stand; two or three periods tell you whether it's improving,
  worsening, or noisy. If only one period's data is available, say so
  explicitly rather than implying a trend that isn't there — this mirrors
  the existing rule (in `jysk-presentations`) against asserting a
  conclusion the data doesn't support.
- **Drivers, not totals.** When a total moves, find what's actually
  moving it — which product area, which store, which cost line — rather
  than stopping at the district-level number. That's usually the
  difference between a slide someone nods at and one that leads to a
  real decision in the room.
- **Action, not observation.** The payoff of "So What?" is a concrete
  next step or decision the audience can act on — not every slide needs
  one (a pure status update doesn't), but an analysis slide that doesn't
  point toward *something* is usually missing its own point. Don't
  invent an action that isn't supported by the data — if the data
  doesn't make the next step obvious, say what question it raises
  instead of manufacturing a recommendation.

## Slide architecture

For each content slide, work out these four things before touching
layout:

1. **Action Title** — the headline states the conclusion, not the
   topic. "Sales grew 15% on Window dressing and Mattresses" beats
   "Sales by Product Area." A reader skimming only the titles of a deck
   should come away with the actual story. (JYSK's own official
   formatting rules cap most headlines around 28pt / a short line — an
   Action Title still has to fit that, so keep it to one real sentence,
   not a clause-stacked summary.)
2. **Key Takeaway** — one or two sentences near the top restating the
   "So What?" in plain language, for the reader who only has ten
   seconds on this slide.
3. **Layout** — how the slide's area actually divides: a 3-column
   comparison, a single big table, a chart with a callout number beside
   it, a before/after pair. Pick the layout the content needs, not a
   default.
4. **Content and visual emphasis** — which 1-3 numbers deserve large
   callout treatment (a stat card, a bolded cell) versus what belongs in
   supporting detail. Not every number on a slide should be the same
   size — the one the Key Takeaway is about should visually dominate.

## MECE bullet writing

When a slide's content is bullets rather than a table, keep them
**Mutually Exclusive, Collectively Exhaustive**: each point covers
distinct ground (no two bullets restating the same fact from different
angles) and together they cover the relevant space (no obvious point
left unsaid that the reader will wonder about). This is a check to run
*after* drafting bullets, not a formula to write them by — draft the
honest list first, then look for overlap or gaps.

## Which visual, for which deck

Chart-type fit, in general:

- **Waterfall** — a value's movement from a starting point through
  named drivers to an ending point (plan → driver A → driver B → actual).
  Best chart for "here's exactly what explains the variance."
- **Stacked bar** — composition (how a total breaks into parts, and how
  that mix changes across categories or time).
- **Line** — a trend across 3+ time periods. Don't use a line for 2
  points — that's just a variance, say it as a number.
- **Ranked/clustered bar** — comparing a metric across stores/categories
  at a single point in time (JYSK's own district-by-store comparisons
  are this shape).

**But**: for a deck meant to look like JYSK's real SAP BW "District
Manager Follow up" report, the confirmed house style is *not* native
charts at all — it's a pasted-pivot-table look (Verdana 8pt, light-blue
label columns, green/red conditional formatting on index columns),
verified directly from three of Adam's own real reference decks. See
`jysk-presentations`' pivot-table section
(`scripts/pivot_table_helpers.py`) and use that instead of a waterfall/
bar/line chart for that specific deck type — the chart-type guide above
is for a deck that isn't trying to look like that report (a one-off
analysis topic, a strategy narrative, a deck built with `deck-kit.js`).
When unsure which applies, ask rather than guessing the style — picking
the wrong one was exactly the mismatch that led to this skill existing.

## Generating the actual file

Don't duplicate build logic here — once the story and visuals are
decided:
- A JYSK-branded `.pptx` → follow `jysk-presentations` end to end (it
  picks the right tool: official templates, `pivot_table_helpers.py`,
  `deck-kit.js`, or `layout_helpers.py` depending on the deck type).
- A VBA macro to generate slides from inside Excel/PowerPoint → that's
  `excel-analysis`'s VBA conventions (Option Explicit, restore
  screen-updating/calculation on every exit path, Ukrainian comments) —
  apply them even when the macro's job is building slides, not just
  spreadsheet work.
