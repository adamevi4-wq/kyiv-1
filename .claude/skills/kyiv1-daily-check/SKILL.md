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

**This step changed on 2026-09-17 and is no longer fully unattended.**
`telegram-bot/{doc}` used to be open (`allow read, write: if true`), so this
step read/wrote it directly over the Firestore REST API with no auth, from
this sandbox, in one pass. As of the security hardening that day it's locked
to `allow ... if false` — Firestore Security Rules don't apply to the bot's
own service-account access (IAM bypasses rules entirely, same mechanism the
Admin SDK uses), so the bot keeps working, but this session has no way to
read or write that collection anymore — by design, see `firestore.rules`.

**Read the data — via the bot, not direct REST.** Ask the user (or check
with them) to run `/unlinked` in each of the two group chats and relay the
bot's reply back into this conversation; the bot's own authenticated access
computes the same "names not yet in storeMembers" list this step used to
compute itself. If the user isn't available to do that this run, skip this
step for today (see the report note below) rather than guessing or stalling
the rest of the run on it.

**Decide who to link**, from that relayed list, the same way as before: for
each name, look for a signal that's unambiguous —
- Their own display name or username contains a single, clear store code
  (e.g. a manager named themselves "Софія J104" — this really happens here).
- The user, relaying other context from the chat, can confirm a clean
  one-to-one link between this person and one store code.

If you're not confident — two plausible codes, no signal at all, a generic
name — leave it alone. A wrong link silently misattributes someone's real
work; no link just means the bot falls back to asking for a code in the
message, which is a minor inconvenience, not a data error. Note anything
genuinely unclear so it reaches the user in your summary (step 3) rather than
guessing.

**Write confirmed links back — also via the bot, not direct REST**: ask the
user to run `/linkstore <code>` as a reply to that participant's message
(or have the participant run `/mystore <code>` themselves) in the relevant
chat. This session cannot PATCH `telegram-bot/{doc}` anymore either.

A real future improvement (not yet built, don't attempt it as this run's
"one small step" below without weighing it deliberately — it's bigger than
that bar): have the bot's own cron tick write a compact unlinked-summary
into a `kyiv1/{doc}` document instead, which this session *can* still read
via its own Firebase Authentication — that would restore full autonomy for
this step without reopening `telegram-bot/{doc}`.

## 2. Improve the bot — one small, safe step

This is upkeep, not a redesign. Pick **one** small, reversible improvement
per run and stop — resist the urge to batch several into one PR, since a
single focused change is easier to revert if it turns out wrong, and gives
the human a legible history of what changed and why.

Read `telegram-bot/worker.js` and the Telegram-bot tab code in `index.html`
for anything worth fixing — there's no standing backlog here anymore (the
two long-lived open items from earlier runs — text-reply confirmation of a
photo report, and a grace period after the report window closes — both
shipped). Read the recent git log for what's landed lately before assuming
something's still open.

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
