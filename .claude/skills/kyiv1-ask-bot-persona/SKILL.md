---
name: kyiv1-ask-bot-persona
description: Extend or tune the Kyiv-1 Telegram bot's live AI conversational feature (telegram-bot/worker.js — ASK_BOT_SYSTEM_PROMPT, cmdAskBot, the "бот"/@mention/reply-to-bot trigger) — its persona, what it's allowed to say, its structured intent/sentiment/urgency classification, and the should_respond silence logic. Use this whenever the district manager pastes another "system prompt" / AI-persona brief and asks to add it to the bot, wants the bot's conversational behavior tuned, or asks what the ask-bot can/can't do. Not for the static canned-text pools (MORNING_MESSAGES etc.) — see kyiv1-bot-copywriter for those.
---

# Kyiv-1 ask-bot persona

This district manager periodically pastes a "system prompt for a Telegram
bot" brief (from articles, other projects, ChatGPT/etc.) and asks to add its
ideas to "our bot". This skill is the recipe for doing that well: merge the
genuinely applicable parts into the one real system prompt, adapt anything
domain-specific (customer-service/e-commerce concepts don't map to an
internal store-management chat), and be explicit about what a brief asks for
that this stack genuinely cannot do — rather than silently dropping it or
fabricating a capability that isn't really there.

## What actually exists (as of this writing — re-grep, line numbers drift)

One feature, `telegram-bot/worker.js`:

- **Trigger** (`isAddressedToBot`, `textMentionsBotWord`): fires on the bare
  word "бот" anywhere in the text/caption (any case, word-boundary matched
  so "робота"/"робот" don't false-trigger), an `@botusername` mention, or a
  reply to any of the bot's own messages.
- **The single AI call** (`askBotAI`, ~line 2661): one Claude call
  (`ASK_BOT_MODEL` = a cheaper/faster model than the AI-quiz feature's,
  since this can fire on every mention) with **structured output**
  (`output_config.format: json_schema`, schema = `ASK_BOT_RESPONSE_SCHEMA`)
  — the API itself enforces the shape, not a "please return JSON" text
  instruction a model could ignore. Returns `{should_respond, reply,
  intent, sentiment, urgency, requires_human}` in one shot — no separate
  classifier call, no extra cost.
- **The persona/rules** (`ASK_BOT_SYSTEM_PROMPT`, ~line 2397): labeled
  sections — context recognition (short/ambiguous/sarcastic/slang
  messages), whether to respond at all, clarify-vs-answer, tone matching,
  media handling, output format, and the classification field
  instructions. Read it before editing — it's already fairly dense and
  organized; extend a section in place rather than appending a new
  unrelated paragraph at the end.
- **Real data, not vibes**: `buildActivitySnapshot` (reports/streaks/
  activity/checklist status) and `buildDistrictInfo` (store roster:
  code/name/manager) are both computed fresh per call and prepended to the
  prompt content — this is how the bot answers "as of today" questions
  with real numbers instead of guessing. If a brief asks for "grounded,
  factual answers", this is already the mechanism; don't duplicate it with
  a second system.
- **Media**: `buildAskBotMediaBlocks` — photos become Claude image content
  blocks, PDFs become document blocks, small text files (.txt/.md/...) get
  decoded inline, everything else (including voice/audio/video — Claude's
  Messages API has no audio input) is flagged "attempted, not ok" and gets
  a canned humor-fallback reply (`ASK_BOT_MEDIA_FAIL_REPLIES`) with **no
  API call at all**.
- **Silence**: `should_respond: false` is a valid, non-error outcome
  (distinct from a genuine failure) — `cmdAskBot` sends nothing at all in
  that case, not even the canned fallback, though it still counts against
  the hourly rate cap (`ASK_BOT_MAX_PER_HOUR`) since a real API call
  happened. Only the AI path can decide this; the no-key/rate-capped
  fallback path always replies (it has no way to judge).
- **Feedback loop**: reacting 👍/👎-family emoji on an AI reply logs
  sentiment against it (`handleMessageReaction`, `state.askBotReplies`);
  `/askbotfeedback` (admin) shows counts + recent 👎'd Q&A pairs.
- **Escalation log**: any reply where the model set `requires_human: true`
  is logged to `state.askBotEscalations` (not pinged live — a deliberate
  choice to avoid noise); `/askbotescalations` (admin) lists them, most
  urgent/recent first.

## Known, deliberate non-goals (say so, don't fake them)

- **Voice/audio transcription.** Claude's Messages API takes no audio
  input. A brief that assumes "if there's a transcription, use it" needs
  an actual speech-to-text step this project doesn't have (no Whisper/
  Deepgram/etc. key configured) — that's a new paid third-party
  integration, not something to add on your own initiative. Say plainly
  that this would need a new API key and ask, rather than pretending the
  bot "listens".
- **Heavy RAG (vector DB).** At ~10 stores and a handful of documents, a
  full embeddings/vector-search pipeline (Pinecone/Qdrant/pgvector) is
  overkill. The cheap equivalent already exists: `buildActivitySnapshot`/
  `buildDistrictInfo` inject real facts directly into the prompt as plain
  text. If a brief asks for "a knowledge base the bot searches before
  answering", point back to this pattern instead of standing up a new
  service — same result at this scale, zero new infrastructure.
- **Multi-agent / full function-calling loop.** Considered and explicitly
  passed on (see `d5563a83`'s commit and prior conversation) — a real
  agentic tool-use loop (the model calling `get_store_stats(code)` etc.
  mid-turn) is materially more complex and costs more per reply than the
  current "the code guesses what data is relevant and hands it over
  upfront" approach (`buildActivitySnapshot`/`buildDistrictInfo`), for a
  marginal quality gain on a ~10-store internal chat. Revisit only if the
  district manager explicitly asks for it knowing the tradeoff, not on
  your own initiative.
- **E-commerce/customer-service concepts.** Abandoned-cart reminders,
  order status, a product catalog, booking flows — this is an internal
  team chat for store managers, not a storefront. When a pasted brief is
  written for that kind of bot, translate its *intent* (e.g. "proactive
  triggers" → birthdays/report reminders already exist; "intent taxonomy"
  → adapt the enum values to this domain, don't keep `CATALOG_SEARCH`)
  rather than importing e-commerce-specific fields wholesale.

## Process for a new pasted brief

1. Read the whole brief before editing anything — identify which parts are
   genuinely new behavior vs. already covered by what's listed above
   (most briefs overlap heavily with what's already built; say so rather
   than re-implementing).
2. For anything domain-specific to a different kind of bot, adapt the
   *underlying idea* to this chat's actual domain (retail district
   operations) rather than copying field/intent names verbatim.
3. Edit `ASK_BOT_SYSTEM_PROMPT` in place — extend the matching labeled
   section, or add a new `\n\n` + `LABEL. ` section if it's a genuinely
   new dimension (match the existing ALL-CAPS-label-then-text style).
   If it touches structured output, update `ASK_BOT_RESPONSE_SCHEMA` and
   the parsing/return shape in `askBotAI` together — they must stay in
   sync (schema fields ↔ what `askBotAI` reads off `parsed` ↔ what
   `cmdAskBot` does with the returned object).
4. `node --check telegram-bot/worker.js`.
5. If you changed `askBotAI`'s return shape or `cmdAskBot`'s branching
   (not just prompt wording), extract the real functions into a Node test
   harness and write assertions against actual behavior — this feature
   has been tested this way every time it changed this session (stub
   `tg`/`fetch`/`getState`/`setState`, feed a canned Claude JSON response,
   assert what got sent/logged). A pure prompt-wording change doesn't need
   this — `node --check` plus a read-through is enough, since no test here
   asserts on the literal prompt text.
6. Ship through the repo's normal flow for this bot: commit on the
   designated branch, push, merge to `main`, push `main`, verify the
   `deploy-telegram-bot.yml` GitHub Actions run actually succeeded, merge
   `main` back into the feature branch.
7. Tell the district manager, concretely: what changed, one example of the
   new behavior, and — just as importantly — anything from their brief you
   deliberately did NOT implement and why (see non-goals above). Never
   let "adapted most of it" read as "did all of it".
