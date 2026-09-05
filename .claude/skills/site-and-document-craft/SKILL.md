---
name: site-and-document-craft
description: The end-to-end craft of building or changing a real website/dashboard (or any artifact/document) well — reuse what already exists before inventing new, verify with real rendering before calling it done, ship through the project's own process, and know when to hand off to a more specific skill instead of reinventing its job. Use this whenever building a site, page, dashboard, report, or any artifact/document — here or in a different project — not just when explicitly asked for "a site" or "a document".
---

# Building sites, dashboards, and documents well

This captures how the work in this repo (`index.html`, a live single-file
dashboard + Telegram bot) actually got built and kept working across many
rounds of changes — a process worth reusing for any future site or
document, not just this one. Where a pillar of *visual* judgment is
needed — color, type, layout, data viz — that's `visual-design-principles`
(a sibling skill in this repo); this skill is about the *craft of shipping
it correctly*, in any project.

## 1. Reuse before you invent

Before writing a new component, screen, or document section, look for one
that already does the job. This repo accumulated a real vocabulary over
many changes — `gaugeHtml()`, `.dist-bar-row`, `.attn-row`/`.attn-badge`,
`.tg-bar-row`, `heroBannerHtml()` — precisely because each new need was
first checked against what already existed, and only extended when nothing
fit. The payoff compounds: a dashboard where every tab uses the same three
widgets reads as one product; one where every tab invented its own reads as
ten prototypes stapled together. The same applies to a document or slide
deck — a heading style, a callout box, a table format, established once,
should get reused deliberately, not reinvented per section.

This also means **asking what data already exists before adding a new
metric or section.** Every gauge, ranked list, or "needs attention" panel
added to this dashboard reads from a field the app already tracked — if the
data a design would need doesn't exist yet, that's worth saying plainly
rather than fabricating a plausible-looking number to fill the shape.

## 2. Verify by actually rendering it, not by reading the diff

A diff that looks right and a page that renders right are different
claims. This repo's pattern for closing that gap, when there's no build
step and no existing test suite to extend:

1. **Stub the backend.** For a Firebase/Firestore-backed static site like
   this one: rewrite the two `firebasejs` CDN imports to point at tiny
   local stand-ins (`fbstub/firebase-app.js`, `fbstub/firebase-firestore.js`
   — an in-memory `Map` keyed by `"<collection>/<docId>"`, implementing
   just `doc`/`getDoc`/`setDoc`/`onSnapshot`) and inject seed data via
   `window.__SEED__` in a `<script>` tag before the app's own module
   script. The same idea generalizes to any external dependency a page
   can't reach in a sandboxed check — stub the minimum surface the code
   actually calls, seed it with realistic data, don't try to fully
   reimplement the real service.
2. **Serve and drive it headlessly.** `python3 -m http.server` plus
   Playwright (`chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`
   in this environment) — log in, click through the actual flow, read back
   computed values and rendered text via `page.evaluate`, and screenshot
   the result. Screenshots are for catching what assertions can't (a badge
   colored red on a value that reads as fine, a card that looks empty, a
   dropdown that doesn't fit) — read them, don't just capture them.
3. **Check both themes and the edge cases**, not just the happy path with
   full data: an empty list, a single item (grammar/pluralization bugs
   love `n=1`), light and dark mode, keyboard focus on anything
   interactive. Bugs caught this way in this project so far: a status
   badge colored by the wrong signal, a self-referencing CSS variable, a
   count that read "1 вакансій" instead of "1 вакансія", a focus ring
   silently suppressed on a form control.
4. **For logic with no visual surface** (a scoring function, a date-window
   check, a text parser), extract the real function verbatim into a small
   Node script with fixture inputs and assert on the output — don't hand-
   trace it and call it verified.

Do this *before* saying a change is done, not as an afterthought if asked.

## 3. Ship through the project's actual process — don't invent a shortcut

Find out how this specific project already gets changes into production,
and follow that, rather than assuming a generic one. In this repo: create
a branch off the latest `origin/main` (never build on a branch already
merged — check `git log` first, since a squash-merge leaves the local
branch pointing at now-stale history), commit with the message conventions
already in use, push, open a PR, and merge it the way this repo merges
(squash here). Then **confirm the deploy actually happened** — this
project auto-deploys via GitHub Actions on push to `main`; a merged PR
isn't "shipped" until that run is green. A different project might build
with npm, deploy via a different CI, or have no deploy step at all — check
before assuming this repo's specifics transfer.

## 4. Know when a more specific skill should drive instead

This skill is the general shape of the work — reuse, verify, ship
correctly. It is not a substitute for a skill that already owns a more
specific job:

- Building or updating a **Claude Artifact** (an HTML/React page published
  through the `Artifact` tool, not a file pushed to this repo)? Load
  `artifact-design` before writing it, `artifact-capabilities` if it needs
  to read/save state or otherwise go beyond static HTML, and
  `artifact-diagramming` if a diagram earns its place. Those skills carry
  the platform-specific rules (the CDN allowlist, the theme-token
  contract, capability declarations) that this skill doesn't restate.
- Building **any chart, graph, or dashboard visual**, in this repo or
  anywhere else? Load `dataviz` first — it has the color-formula validator
  and mark specs this skill only gestures at.
- The deliverable is a **Word doc, slide deck, spreadsheet, or PDF**
  rather than a web page? That's `docx`/`pptx`/`xlsx`/`pdf` — format-
  specific mechanics (templates, tracked changes, formulas) this skill
  doesn't cover.
- A visual **design/style judgment call** on this repo's site specifically
  (is this color pairing accessible, does this layout read as one
  product, is the typography doing its job)? That's this repo's own
  `visual-design-principles` skill.

Reach for those first when the task matches them; use this skill for the
process that wraps around all of them.
