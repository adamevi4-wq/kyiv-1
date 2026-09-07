---
name: kyiv1-bot-copywriter
description: Expand and refresh the canned/fallback text pools the Kyiv-1 Telegram bot (telegram-bot/worker.js) picks a random line from for a given situation — morning greetings, activity digests, weekly motivation, congrats replies, birthday wishes, engagement polls, checklist reminders, and the AI ask-bot's no-key/no-match fallback lines. Use this whenever the district manager says the bot repeats itself, feels robotic, needs "more texts for different situations", asks to expand its vocabulary/"teach" it, or wants a new situational pool added. Not for the AI ask-bot's live Claude replies (ASK_BOT_SYSTEM_PROMPT already governs those) — this is about the free, no-API-call text pools.
---

# Kyiv-1 bot copywriter

The bot has no memory of "I already said this today" — every situational
message is `POOL[Math.floor(Math.random() * POOL.length)]`. A pool with 3-4
lines repeats fast in a chat people read daily; that's what "мало текстів"
means in practice. This skill is the recipe for growing those pools and
keeping every new line in the same voice as the rest, rather than each
addition drifting into its own style.

## The house voice (applies to every pool below)

Established across this project's sessions from an explicit
"Telegram-копірайтер / Engagement Specialist" brief the district manager
gave — quoted verbatim in `telegram-bot/worker.js` right above
`MORNING_MESSAGES` (search for "Copy style"). In short:

- Confident and warm, never a stiff corporate announcement or an empty
  slogan ("Успіхів!" alone is not a line).
- Short — 1-3 sentences, no walls of text.
- Exactly one `<b>bolded key idea</b>` per message (HTML, since these are
  sent with `parse_mode: "HTML"` — see below for why balance matters).
- A light call-to-action closing almost every line: a question the reader
  can answer in the chat, or "poставте [emoji]" — something that invites an
  actual reply, not just reading.
- Ukrainian. Retail/district context is fair game (magazин, покупець,
  дістрикт, зміна) but don't force it into every single line — some
  should read as plain human encouragement.
- Never literally repeat an existing line's wording or its exact metaphor —
  skim the pool you're extending first so the new lines don't rhyme with
  what's already there.

## The pools (as of this writing — re-grep before relying on line numbers)

All in `telegram-bot/worker.js`. Each entry: constant name — situation it
fires for — rough size to aim for when "few texts" comes up again.

- `MORNING_MESSAGES` — daily greeting at whatever time `/morning on` was set
  to. Aim for 20+.
- `ACTIVITY_MOTIVATION_MORNING` / `ACTIVITY_MOTIVATION_EVENING` — appended to
  the 10:00 (yesterday recap) / 17:00 (today snapshot) activity digest. 10+
  each.
- `WEEKLY_MOTIVATION` — closes the Monday 10:01 weekly digest. 10+.
- `CONGRATS_TEMPLATES` — an *object* keyed by `birthday`/`promotion`/
  `anniversary`/`victory`/`generic` (see `CONGRATS_CATEGORIES` right above it
  for the keyword heuristics that pick a category), each an array of reply
  templates containing a literal `{NAME}` placeholder (a leading space +
  the mentioned/replied-to person's name, or empty — don't add punctuation
  right after `{NAME}` in a new line, the substitution doesn't add any).
  6-8 per category.
- `BIRTHDAY_WISHES` — the one-line wish inside the proactive birthday
  greeting (`buildBirthdayMessage`) — this pool is wishes only, not full
  messages (the name/store/signature/CTA around it are built separately,
  don't duplicate them in a new wish). 8+.
- `ENGAGEMENT_POLLS` — `/enginepoll`: each entry is `{question, options
  (exactly 4, emoji-led), hook}`, not a plain string — keep exactly 4
  options when adding one. 6+.
- `CHECKLIST_REMINDER_PHRASES` — just the short "🔔 ..." lead-in before the
  monthly checklist reminder text; keep these very short, no CTA needed
  here (the checklist message itself has one). Don't touch `CHECKLIST_ITEMS`
  next to it — that's the real, factual checklist content, not house-voice
  copy.
- `ASK_BOT_FALLBACK_REPLIES` — what the AI ask-bot (`cmdAskBot`) sends when
  `ANTHROPIC_API_KEY` isn't set, the Claude call fails, or the hourly rate
  cap is hit. These fire on essentially any mention, so keep them generic
  enough to make sense as a reply to almost anything. 10+.
- `ASK_BOT_MEDIA_FAIL_REPLIES` — ask-bot's honest "I can't read this
  attachment" reply (unsupported file, download failed, or voice/video —
  Claude has no audio/video input). Self-deprecating humor, per the
  original ask-bot persona brief. 6+.

If the district manager describes a **new** situation with no pool yet,
create one following this same pattern (a `const NAME_OF_POOL = [...]`
picked via `Math.floor(Math.random() * POOL.length)`) rather than bolting
new behavior onto an existing pool.

## Process

1. `grep -n "^const .*_MESSAGES\|_MOTIVATION\|_WISHES\|_TEMPLATES\|_REPLIES\|_POLLS\|_PHRASES" telegram-bot/worker.js` to find current pools and sizes — line numbers drift, don't trust ones from an old session.
2. Read the existing lines in the pool(s) you're touching so new ones don't echo them.
3. Append new lines/objects in the house voice above. For `CONGRATS_TEMPLATES`, extend the right category array in place, don't restructure the object.
4. `node --check telegram-bot/worker.js`.
5. Every `<b>` needs a matching `</b>` (Telegram silently rejects malformed HTML — a mismatch means the whole message fails to send, not just renders oddly). Verify all pools you touched at once:
   ```bash
   python3 -c "
   import re
   src = open('telegram-bot/worker.js', encoding='utf-8').read()
   for m in re.finditer(r'\"([^\"]*<b>[^\"]*)\"', src):
       s = m.group(1)
       if s.count('<b>') != s.count('</b>'):
           print('MISMATCH:', s)
   "
   ```
   (A cheap regex pass — good enough to catch the common mistake; it isn't a full HTML parser.)
6. `CONGRATS_TEMPLATES` entries specifically: confirm `{NAME}` still appears literally (not `{Name}` or `{name}` — `maybeJoinCongrats` does an exact `.replace("{NAME}", ...)`).
7. Ship it through the repo's normal flow for this bot (see this project's other Telegram-bot work for the exact ritual): commit on the designated feature branch with a real commit message, push, merge to `main`, push `main`, verify the GitHub Actions deploy (`deploy-telegram-bot.yml`) actually succeeded via the GitHub API rather than assuming, then merge `main` back into the feature branch to stay in sync. Static text-pool changes carry no runtime-logic risk, but they still ship through the same pipeline as everything else in this bot — no shortcut deploy path.
8. Tell the district manager what grew and by how much (e.g. "MORNING_MESSAGES 10 → 20") — that's the concrete signal the "мало текстів" complaint was actually addressed, not just acknowledged.
