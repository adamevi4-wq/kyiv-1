---
name: jysk-dashboard-report
description: Visual recipe for JYSK-branded internal analysis reports and dashboards — a dark-navy hero header, KPI stat tiles, a ranked horizontal bar chart with a top-N best/worst list, and a collapsible "reviews"-style panel. Use this whenever the user shares a screenshot or artifact link of a JYSK-style report/dashboard and asks to match its look, or asks for a new internal analysis page, ranking view, or district/store performance report in that house style. Also documents how to handle Claude.ai artifact links this session can't fetch directly.
---

# JYSK dashboard/report visual recipe

This captures a specific corporate-report visual language a JYSK Ukraine
district manager asked to be brought into the Kyiv-1 dashboard
(`index.html` in this repo), from screenshots of an internal
"Комплексні продажі" / "Використання 7-го коду" analysis site. Reuse this
recipe whenever a new JYSK-style dashboard, ranking view, or report is
wanted — here or in a fresh project — rather than re-deriving the look
from scratch.

## Getting the reference right first

If the user points at a Claude.ai artifact link (`claude.ai/public/artifacts/…`
or a chat-shared artifact) for visual reference, **try to fetch it**, but
know the limits before spending a turn on retries:
- The `Artifact` tool's `read` action only works for artifacts this
  session's account owns or that were explicitly shared with it — check
  with `action: "list", scope: "all"` first. A `public/artifacts/<uuid>`
  link from a *different* Claude.ai account is invisible to it.
- `WebFetch` on `claude.ai/code/artifact/<uuid>` only returns the static
  SPA shell (a "Claude Artifact" placeholder), not the client-rendered
  content, for artifacts this session doesn't own either.
- If both come back empty/not-found within a couple of tries, **stop and
  ask for screenshots** rather than continuing to guess at URL formats —
  screenshots are the reliable path and the user can produce them in
  seconds. Don't burn multiple turns retrying fetch variants.

Extract from the screenshots: the color roles (which things are navy vs.
green vs. red), the structural pattern (hero → stat tiles → ranked list →
detail cards), and any distinctive widgets (collapsible panels, pill
badges, top/worst lists) — not pixel-perfect measurements. The goal is a
visual language, not a clone.

## The visual language

**Color roles**, expressed as CSS custom properties so a project's own
brand tokens still apply — swap the underlying hex values, keep the
roles:
- Navy (`--navy` / `--navy-2`, a darker shade) — hero banners, primary
  accents, "on-track"/neutral bars.
- Green (`--green`) — positive status, "Контроль"-style pills, best-of
  headers.
- Red (`--red`) — attention-needed status, worst-of headers, deficits.
- Light gray page background, white cards — everything else stays plain
  so the navy/green/red carry all the meaning.

**Typography**: bold sans-serif for titles and numbers, small-caps
letter-spaced labels (monospace works well here — it reads as "data",
which suits a KPI dashboard) for eyebrows and stat-tile labels.

## Components (in the order they usually appear)

### 1. Hero banner
A dark navy gradient block at the top of the page/tab: a small-caps
eyebrow line (context + "updated" date), then a large bold white title.
Reusable as one helper so every page/tab gets a consistent header
without repeating markup:

```js
function heroBannerHtml(title){
  return `
    <div class="hero-banner">
      <div class="hero-eyebrow">SCOPE · Оновлено ${todayLabelUA()}</div>
      <div class="hero-title">${escapeHtml(title)}</div>
    </div>
  `;
}
```
```css
.hero-banner{ background:linear-gradient(135deg, var(--navy-2), var(--navy)); border-radius:16px; padding:26px 30px 24px; margin-bottom:24px; position:relative; overflow:hidden; }
.hero-banner::after{ content:''; position:absolute; inset:0; background:radial-gradient(circle at 88% 15%, rgba(255,255,255,0.10), transparent 55%); pointer-events:none; }
.hero-eyebrow{ font-family:'Courier New', monospace; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.65); margin-bottom:8px; }
.hero-title{ font-size:23px; font-weight:700; color:#fff; line-height:1.3; }
```

### 2. KPI stat-tile row
A flat grid of small cards, each a small-caps label over a large bold
number, color-coded only when the number itself is good/bad (not
decoratively). Most projects already have something like this — reuse
it rather than inventing a second stat-tile style.

### 3. Ranked horizontal bar chart + top-N best/worst list
The signature widget: entities (stores, districts, people) ranked
descending by one metric, each as a name + horizontal bar + value. Below
it, a two-column "best 5" / "worst 5" list — **only the column header is
colored** (green for best, red for worst); the row values themselves stay
neutral. Coloring every row by which column it's in (rather than by the
value) breaks down the moment a dataset is small enough for the two
lists to overlap — learned this the hard way building it the first time.

```js
const ranked = items
  .map(x => ({ x, val: computeMetric(x) }))
  .sort((a,b) => b.val - a.val);
const max = ranked.length ? Math.max(...ranked.map(r => r.val), 100) : 100;
const best = ranked.slice(0, 5);
const worst = ranked.slice(-5).reverse();
```
```html
${ranked.map(({x,val}) => `
  <div class="tg-bar-row">
    <div class="tg-bar-name">${escapeHtml(x.label)}</div>
    <div class="tg-bar-track"><div class="tg-bar-fill" style="width:${Math.min(100, Math.round(val/max*100))}%"></div></div>
    <div class="tg-bar-count">${val}</div>
  </div>
`).join("")}
<div class="top5-grid">
  <div><div class="top5-head best">ТОП-5 НАЙКРАЩИХ</div>${best.map(({x,val}) => `<div class="top5-row"><span class="name">${escapeHtml(x.label)}</span><span class="pct">${val}</span></div>`).join("")}</div>
  <div><div class="top5-head worst">ТОП-5 НАЙГІРШИХ</div>${worst.map(({x,val}) => `<div class="top5-row"><span class="name">${escapeHtml(x.label)}</span><span class="pct">${val}</span></div>`).join("")}</div>
</div>
```
(`.tg-bar-row`/`.tg-bar-name`/`.tg-bar-track`/`.tg-bar-fill`/`.tg-bar-count`
were originally built for this project's Telegram-bot leaderboard — check
whether the current project already has an equivalent bar-row style
before inventing a new one; the whole point of this widget is that one
bar-row style serves every ranking view in the app.)

### 4. Collapsible "reviews"-style panel
A full-width dark-navy rounded button that toggles a list of small cards
below it (name/id line, then body text). In the reference this held
customer feedback; the transferable pattern is "a shared, growing list of
free-text entries someone wants scannable in one place without cluttering
the main view" — comments, notes, flagged items, anything with a natural
"show more" gesture.

```css
.reviews-toggle-btn{ display:block; width:100%; background:linear-gradient(135deg, var(--navy-2), var(--navy)); color:#fff; border:none; border-radius:10px; padding:13px; font-size:13px; font-weight:700; text-align:center; cursor:pointer; margin-bottom:14px; }
.review-card{ border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin-bottom:8px; background:var(--paper-2); }
```
Toggle state should persist for the session (a module-level `let panelOpen
= false;` re-rendered on click) — don't reset it to closed on every
re-render, or the panel appears to fight the user.

## Principles, not just markup

- **Apply this to data that already exists.** The ranking, the best/worst
  list, the review cards — all of it should read from real fields the app
  already tracks (staffing %, comments, whatever). Don't invent a new
  metric or fabricate entries just to fill out the pattern; if the data
  needed for a section doesn't exist yet, say so rather than making it up.
- **Additive, not a rewrite.** Bring the visual language into an existing
  app by adding a hero banner and new sections that use existing render
  functions and CSS variables — don't restyle the whole app in one pass
  when only "bring this look in" was asked. Ship it as one focused PR
  (or a couple), verified the same way the rest of the project verifies
  UI changes (headless-browser check with seeded/stubbed data, not just
  a visual read of the diff).
- **One hero per page, not one per section.** The banner is a page/tab-
  level header, not a component to sprinkle on every card — using it more
  than once per view dilutes it back into background noise.
