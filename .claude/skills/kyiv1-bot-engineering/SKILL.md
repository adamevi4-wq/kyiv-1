---
name: kyiv1-bot-engineering
description: Meta-prompt for any work on the Kyiv-1 Telegram bot (telegram-bot/worker.js, Cloudflare Worker) — the standing rules Adam has set, what this sandbox can and cannot do, the code conventions and bug classes already learned the hard way, and the verify-then-ship workflow. Read this FIRST whenever Adam asks to add, change, schedule, or debug a bot feature, a digest, a command, memory/retention, or anything the bot sends. It decides how to behave; the narrower kyiv1-* skills decide the details of one task.
---

# Kyiv-1 bot engineering — how to work on this bot

The bot is live, used by real store managers, and answers to one person: Adam,
the District Manager (the chat's Telegram *creator*). Most of what follows was
learned by getting it wrong once. Treat it as the default posture, then check
the narrower skill for the task (`kyiv1-ask-bot-persona`, `kyiv1-bot-copywriter`,
`kyiv1-daily-check`).

## 1. Behave first, build second

- **Do what was asked, then offer.** Adam has said twice that I "ran ahead".
  Answer an exploratory question in a few sentences with a recommendation and
  the main tradeoff. Build only after he agrees. Extra ideas go in the reply as
  options, not in the PR.
- **Ask when a wrong guess is consequential**, guess when it is cheap. Asked
  and right: who a contest scores (store, not person), whether feedback is
  anonymous to him, who presses "send". Guessed and wrong: what "memory" meant
  (he meant the bot's own understanding of chat messages, not an archive).
  Misreading a requirement costs a full rebuild; one question does not.
- **Reply in Ukrainian**, short, no recap of what he already saw. Say plainly
  what is unverified. Never claim "works" for something only a mirror test
  covered.

## 2. Standing decisions (do not re-litigate)

- **Nothing sent to Adam before 09:00.** His working day starts then. Every
  scheduled private message uses 09:00 or later.
- **Private outputs name stores, never people.** Digests, the weekly focus, the
  daily recap and `/memory` show store codes (J104). Group-visible sections that
  already show names (rating, `/stats`, weekly group digest) stay as they are;
  he said "залишай імена".
- **Free AI only by default.** `ANTHROPIC_API_KEY` is not set. Everything runs on
  Cloudflare Workers AI (`WORKERS_AI_MODEL`, Whisper for voice). Do not add a
  paid dependency or a third-party service (e.g. chart rendering) without his
  explicit yes.
- **Memory has two tiers.** Raw messages: 7 days (`state.dayLog`,
  `DAY_LOG_KEEP_DAYS`), used for the bot's own analysis and replies. Derived
  archive: 30 days (`telegram-bot/memory-<chatId>`, `MEMORY_KEEP_DAYS`), counts
  and AI theses only, readable only by him via `/memory`. Store/member mappings
  (`storeMembers`) are a separate thing and are not touched by any retention
  rule.
- **Sensitive reads are creator-only, fail closed.** Gate on an exact match with
  `getDistrictManagerId`, not "any admin". If the creator cannot be resolved,
  nobody gets access, and non-creators get silence so the command is not
  confirmed to them.
- **Never write a secret into the repo, a commit, or a file.** Adam has pasted
  secret values into chat before. Use them for the task, do not echo or persist
  them.

## 3. What this sandbox can and cannot do

- **No outbound network to the bot** (`bot.kyiv1-dashboard.com` is blocked by the
  egress policy, 403), **no `BOT_TOKEN`, no Firestore service-account key.** So
  live behavior cannot be observed from here. State this every time instead of
  implying a check happened.
- Do **not** hunt the filesystem for credentials. A search was blocked by the
  safety classifier for exactly that reason; the right move is to tell Adam what
  is needed and why.
- To send something to a chat, build a **Telegram-native path**
  (`/broadcast <target> <text>`, DM photos to stage) that Adam triggers himself.
  `/api/broadcast` exists but this sandbox cannot call it.
- The repo is `adamevi4-wq/kyiv-1` at `/home/user/kyiv-1`. The daily-check skill
  still says `store-tracker`; that path does not exist here, use the real one.

## 4. Code conventions (`telegram-bot/worker.js`)

- **Topic features:** `/setXTopic` run inside the topic stores
  `state.xTopic = { threadId }` (per chat). Add the command to
  `ADMIN_ONLY_COMMANDS`, a `case` in `handleCommand`, and a block in `HELP_TEXT`.
  README lags behind; `HELP_TEXT` is the live reference.
- **DM commands** bypass `handleCommand`: they are matched in the private-chat
  branch of `handleMessage` (`dmAdminCmdMatch`, `memoryCmdMatch`). Add new DM
  commands there, with their own gate.
- **Scheduling:** cron fires every 5 minutes (`wrangler.toml`), so a time must sit
  on a 5-minute mark. One send per day = exact-match `now.hhmm` plus a
  `state.x.lastDate !== now.dateStr` guard, set only when actually sent. Private
  messages go to `getChatCreatorId(env, chatId, state)`.
- **State:** per chat via `getState`/`setState`; global docs via
  `firestoreGetRaw`/`firestoreSetRaw(env, BOT_COLLECTION, id, jsonString)`. A
  failed read must never be written back as empty (it would wipe a good doc).
- **Fail closed** for secrets and access; **fail silent** for unsolicited
  features (an automatic comment that errors should say nothing).
- **Rate-limit anything that spends the free Neuron budget.** Whisper
  transcription shares one hourly cap across the automatic comment and the
  ask-bot path.
- The free ask-bot tier (`askWorkersAI`) reads only `query` plus an optional
  image. Anything it must see (e.g. a voice transcript) has to be folded into
  `query`, not left in `mediaBlocks`.
- Read the real function before wiring into it. Several "obvious" plans were
  wrong until the code was read (a command that looked admin-gated was not in DM,
  a transcript that would have been invisible to the free tier).

## 5. Bug classes already hit (check for them in new code)

- **Digits inside a store code** (`J104` → 104) polluting a number regex. Strip
  all store codes from the text before extracting a count or a sum.
- **Day-one false positives.** A rule that flags "didn't report" or "dropped"
  must require real prior data (3+ baseline days, or an existing day entry), or a
  freshly started feature accuses every store.
- **Two triggers on one message.** `#бот` also matched the "бот" word trigger;
  the reply-to-bot branch ran before the exclusion. Put exclusions first.
- **Retention that never fires** on quiet chats if pruning only happens on write.
  Prune in the scheduled job as well.
- **Instruction is not a filter.** Telling the model "no names" does not stop it
  repeating a name present in a snippet. Say so; do not claim it is guaranteed.

## 6. Verify, then be honest about what was verified

1. `node --check telegram-bot/worker.js`.
2. A standalone `.mjs` harness in the session scratchpad that mirrors the pure
   logic (parsers, thresholds, caps, gating) with assertions, including the
   boundary cases above. A failing assertion is information: fix the real code,
   not just the mirror (this caught two real bugs in the recruitment feature).
3. Report it as *mirror tests passed, not exercised on live data*, and name the
   first scheduled run where the real behavior will appear.

## 7. Shipping

- New branch from `origin/main` per change, descriptive commit (what, why,
  how verified), PR, wait for the `smoke` check. **Ignore the
  "Workers Builds: kyiv1-telegram-bot" failure**; it is a known-broken native
  integration, the real deploy is `.github/workflows/deploy-telegram-bot.yml`.
- Squash-merge, then confirm the `deploy-telegram-bot.yml` run for *that* merge
  commit succeeded (the newest run may belong to someone else's merge).
- **Sync the long-lived dev branch** `claude/telegram-chatbot-yenlz2`: checkout,
  fetch, compare `HEAD` with `origin/claude/telegram-chatbot-yenlz2`, reset only
  if they differ, then merge `origin/main`, `node --check`, push. A fast-forward
  merge once nearly discarded that branch's history; the compare-first step is the
  guard.
- **Stacked PRs** conflict after the base squash-merges. Merge `origin/main` into
  the branch, resolve by taking the side that carries the newer logic (read each
  hunk first), re-run every harness, push.
- **Hung CI:** cancel the run, then `workflow_dispatch` `test.yml` on the branch;
  the fresh `smoke` result attaches to the PR. Do not merge on a stuck check or
  bypass it.
- Other sessions edit `main` concurrently (site redesigns, a security fix on
  `/api/broadcast`). Fetch before branching and expect unrelated commits.
