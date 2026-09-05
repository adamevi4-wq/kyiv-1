---
name: visual-design-principles
description: A four-pillar checklist for visual design and communication — UI/UX, typography & layout, data visualization/infographics, and presentation design — to run through whenever the user asks for a design audit, visual polish, or "make it look better/more professional" on this project. Use before and after any visual change to index.html, not just when explicitly asked to "audit".
---

# Visual design & communication — the four pillars

The district manager framed this project's visual work around four skill
areas. This is the checklist to actually run, not just recite, whenever
visual/UX work is requested here — and a good gut-check to re-read after
finishing any change that touches layout, color, or text.

This project has **no design tool in the loop** — no Figma, Canva, Webflow,
PowerPoint. `index.html` is one hand-authored file, styled with plain CSS
custom properties (`--navy`, `--red`, `--green`, `--ink-2`, …) and no build
step. Every principle below has to cash out as a concrete CSS/HTML decision
in that file, not a tool recommendation — recommending "try Figma" here
would be answering the wrong question.

## 1. UI/UX — layout logic and usability

- **Consistency over novelty.** Before inventing a new widget, check
  whether an existing one already does the job — `.attn-row`/`.attn-badge`,
  `.tg-bar-row`, `gaugeHtml()`, `.dist-bar-row`, `.card`. This project has
  accumulated a real component vocabulary; reusing it is what keeps 10+
  tabs feeling like one product instead of ten prototypes bolted together.
- **Every interactive control needs a visible state for both mouse and
  keyboard.** Concretely: hover state, and a `:focus-visible` outline that
  isn't silently suppressed by a stray `outline:none`. Audit form controls
  specifically — custom-styled inputs (`.num-field`, `input[type=range]`,
  `.text-field`) are the ones most likely to have quietly lost their focus
  ring while getting a custom look.
- **Empty and loading states are not optional.** Every list/table in this
  app should render something deliberate when there's no data yet
  (`.empty-state`) — never a blank card or a hidden section, which reads as
  broken rather than "nothing here yet."
- **Don't make the manager reconcile two truths.** If a value's color says
  one thing and its label says another (a red badge on a 107% staffing
  number), that's a bug, not a style choice — fix the logic driving the
  color, not just the color.

## 2. Верстка та типографіка — typography & layout

- **Pick one readable, Cyrillic-complete typeface family and apply it
  everywhere** via a single `--font-sans` custom property, not a repeated
  literal string in seven different CSS rules — a rename should be a
  one-line change. Verify Cyrillic rendering specifically (this site is
  entirely Ukrainian) before committing to a font; not every "modern"
  Google Font ships full Cyrillic glyphs.
- **Keep the monospace/small-caps "data" register for what's actually
  data** — eyebrows, stat labels, badge text, code/IDs — and the main sans
  family for everything a human reads as prose or a name. Mixing them
  freely erodes the "this is a number, this is a sentence" visual cue the
  rest of the app relies on.
- **Line-height and contrast, not just font choice.** A denser/lighter
  typeface can still read worse than Verdana if line-height is too tight
  or a `--ink-soft` label sits on a background that doesn't give it enough
  contrast — check both themes (light and dark), not just one.

## 3. Інфографіка та візуалізація даних — data viz

- **A number alone is a missed opportunity if the app already tracks
  enough of them to show a trend, a rank, or a distribution.** This
  project's own components are the toolbox: `gaugeHtml()` for a 0-100%
  score against a real target, `.dist-bar-row` for "what share falls into
  each status bucket," `.tg-bar-row` for a ranked list. Reach for these
  before adding a fourth plain `<div class="stat-card">`.
- **Never invent a metric to fill out a pattern.** Every gauge, bar, or
  ranked list here reads from data the app already tracks (staffing %,
  vacancy age, login recency, zone progress) — if the data a section would
  need doesn't exist yet, say so rather than fabricating it.
- **Color communicates status, but the label must too.** Don't rely on
  red/green alone (a real accessibility gap for color-blind readers) —
  every colored badge in this app pairs its color with a text label that
  says the same thing in words, and that pairing is not optional when
  adding a new one.

## 4. Presentation-style content

This app has no literal slide deck, but the same discipline applies to any
single screen a manager looks at for a quick read: a hero banner states the
scope and freshness once per view (not per card — see `heroBannerHtml()`),
the most actionable information (a "Потребує уваги" list) sits above the
full historical detail, not buried under it, and a view that currently has
nothing to flag says so in one clear empty-state line rather than being
silently blank. If a future request asks for something export/print-shaped
(a weekly summary, a one-pager for a meeting), the same "one clear focal
point, detail below it, nothing decorative that isn't also informative"
discipline transfers directly — it doesn't need PowerPoint to apply here.

## Running the audit

When asked to "audit the site" or "make it more professional/attractive"
against these four pillars: read the current CSS/markup for each pillar's
concrete checks above, list what's actually missing (not hypothetical best
practices already satisfied), and ship a focused set of fixes — verified
the same way the rest of this project verifies UI changes (headless-browser
check with seeded/stubbed data, both themes), not a sweeping rewrite in one
pass.
