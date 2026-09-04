---
name: kyiv1-daily-check
description: Daily unattended maintenance for the Kyiv-1 district dashboard + Telegram bot (repo adamevi4-wq/store-tracker) — links Telegram participants to their store codes and makes one small, safe improvement to the bot's code. Use this whenever the user asks to "check the bot", "check the stores", "run the daily check", asks what's new with the Telegram bot, or when a SessionStart hook signals a day has passed since the last run. Always run this fully — read Firestore, write confirmed store links, and consider a code improvement — rather than just describing what it would do.
---

# Kyiv-1 daily check

Kyiv-1 is a real, live system a JYSK Ukraine district manager depends on: a
free dashboard (GitHub Pages + Firebase Firestore) and a Telegram bot
(Cloudflare Worker) that tracks store staffing, vacancies, and daily
photo/text reports from ~20 real store managers across two group chats. This
skill is the recipe for the daily upkeep the district manager asked Claude to
just handle on its own, once a day, instead of being pinged for every small
thing.

Two things make this different from a normal coding task: the data is real
(wrong guesses misattribute a real person's report to the wrong store) and
nobody is watching in real time (this often runs unattended, so silence on
"nothing happened" matters as much as speaking up when something did).

Do the whole thing in one pass — don't stop partway to ask about routine
steps described below as safe. Only pause and ask the person when something
is genuinely ambiguous or risky (see each section).

## 0. Orient yourself

```bash
cd /home/user/store-tracker
git fetch origin main && git log origin/main --oneline -10
```

Skim the last few commits so you don't redo work another run (or the human)
already did. If `/home/user/store-tracker` doesn't exist, this session isn't
attached to the repo — stop and tell the user, don't try to clone it
yourself.

## 1. Link Telegram participants to their store

The bot can only credit a photo/text report to the right store if it knows
who works where (`storeMembers`, keyed by Telegram user id). New people join
the chats; the bot's own auto-learning only kicks in once someone happens to
type a bare store code, so gaps accumulate. This step closes them.

**Read the data** (Firestore's REST API is reachable from this sandbox even
when gstatic.com / workers.dev / github.io aren't — use it directly, no auth
needed, the rules are intentionally open):

```bash
curl -sS "https://firestore.googleapis.com/v1/projects/district-tracker-ef4c6/databases/(default)/documents/telegram-bot/chats-index"
```

That returns a JSON array of chat ids. For each one:

```bash
curl -sS "https://firestore.googleapis.com/v1/projects/district-tracker-ef4c6/databases/(default)/documents/telegram-bot/chat-<id>"
```

The whole chat's state lives as a JSON string inside `fields.value.stringValue`
— parse that, don't try to read Firestore's field-wrapper format directly.

**Decide who to link.** For every user id in that chat's `names` map that
isn't already a key in `storeMembers`, look for a signal that's unambiguous:
- Their own display name or username contains a single, clear store code
  (e.g. a manager named themselves "Софія J104" — this really happens here).
- The existing `reports` / `photoReports` / `stats2` data already shows a
  clean one-to-one link between this person and one store code (say, they're
  the only unlinked person and exactly one store is otherwise never
  reported).

If you're not confident — two plausible codes, no signal at all, a generic
name — leave it alone. A wrong link silently misattributes someone's real
work; no link just means the bot falls back to asking for a code in the
message, which is a minor inconvenience, not a data error. Note anything
genuinely unclear so it reaches the user in your summary (step 3) rather than
guessing.

**Write confirmed links back.** The `value` field is one big JSON string, not
structured Firestore fields, so this is a read-modify-write: fetch the doc
fresh (don't reuse a stale read from earlier in this run if minutes have
passed — someone may have messaged in between), merge your new
`storeMembers` entries into the parsed state, leave every other field
untouched, then:

```bash
curl -sS -X PATCH \
  "https://firestore.googleapis.com/v1/projects/district-tracker-ef4c6/databases/(default)/documents/telegram-bot/chat-<id>?updateMask.fieldPaths=value" \
  -H "Content-Type: application/json" \
  --data-binary @patch_body.json
```

where `patch_body.json` is `{"fields":{"value":{"stringValue":"<the full updated JSON as a string>"}}}`.
After writing, fetch the doc once more and confirm the fields you didn't mean
to touch (names, stats, stats2, reports, photoReportsTopic, ...) are still
intact — cheap insurance against a read-modify-write race.

## 2. Improve the bot — one small, safe step

This is upkeep, not a redesign. Pick **one** small, reversible improvement
per run and stop — resist the urge to batch several into one PR, since a
single focused change is easier to revert if it turns out wrong, and gives
the human a legible history of what changed and why.

Read `telegram-bot/worker.js` and the Telegram-bot tab code in `index.html`
for anything worth fixing. If nothing better stands out, and it hasn't
already shipped (check git log), these are known open items:

- Let a photo report be confirmed by a text reply in the bound photo-reports
  topic (e.g. "J027 sent above"), not only by a caption on the photo itself
  — this exact gap has already caused real people's reports to go
  unrecorded in this chat.
- A small grace period (15–20 min) after `photoReportsWindow` /
  `reportsWindow` closes before marking a store as having missed its
  report, so a report sent a couple minutes late still counts.

**"Safe and reversible" means:** additive logic, no change to what already
works for the common case, easy to `git revert` cleanly. Ship those without
asking. Pause and ask the user first for anything that changes the login/
security model, touches money or headcount data on the main dashboard tabs,
or would be awkward to undo once real people have acted on it.

**Ship it the way this repo already ships things** — don't invent a new
process:

```bash
git checkout -b claude/<short-description> origin/main
# edit
node --check telegram-bot/worker.js
# extract the <script type="module"> block from index.html and node --check it too
git add -A && git commit -m "..."
git push -u origin claude/<short-description>
```

Then open a PR against `main`, squash-merge it, and confirm the deploy
worked:
- `index.html` changes deploy via GitHub Pages automatically on merge.
- `telegram-bot/worker.js` changes deploy via
  `.github/workflows/deploy-telegram-bot.yml` automatically on merge too —
  but if you want to confirm it went out this run rather than waiting, you
  can trigger it manually (`workflow_dispatch`) and check the run's
  conclusion.

Use whatever GitHub tooling is available in this session (MCP tools, or
`gh`/`git` directly) — check what's actually available rather than assuming.
Follow whatever commit-message and PR-body attribution trailer this
session's own instructions specify (it's been consistent throughout this
project's history) — don't hardcode a specific value here, since it can
differ per session.

## 3. Report — or don't

Most days, this should end in silence from the user's point of view. Only
send them a message when:

- **Something concrete happened**: a new store link, a merged fix. A short
  Ukrainian summary — a sentence or two, not a changelog. Say what changed
  and why it matters to them, not what commands you ran.
- **Something needs a human call**: an ambiguous store link, data that looks
  wrong (e.g. a store with an implausible headcount), or a code change that
  felt too risky to make unasked.

A run where you checked everything and genuinely found nothing to do is a
success, not a gap to fill — don't manufacture a report to justify the run.
