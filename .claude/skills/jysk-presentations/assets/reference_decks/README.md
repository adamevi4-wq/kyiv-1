# Reference decks

Real `.pptx` files Adam sent across this chat as examples — kept here (not
just notes about them) so any future session can open and inspect the
actual files rather than relying on secondhand description. He asked
directly for this: "зроби собі якесь сховище... треба десь зберегти ці
всі файли, щоб в тебе були до них доступ."

Deduped against `assets/official/`: several uploads were byte-identical
to files already saved there (`JYSK_main_template_FY27_indoor.pptx`,
`JYSK_career_ladder_template.pptx`, `JYSK_official_template.pptx`,
`JYSK_SoMe_template.pptx`, `JYSK_A4_template.pptx`) — not duplicated
here. `demo-jysk.pptx` (despite the extension) is literally
`scripts/demo.js` byte-for-byte — also not duplicated here.

| File | What it is | Key takeaway |
|---|---|---|
| `HQ_DM_SM_monthly_meeting_template_2026-12.pptx` | The **official, company-wide blank template** for the monthly DM/SM Teams meeting (sample data is a different district, site J010 "Ukraina, Kyiv" — generic placeholder district, not Kyiv 1). 9 slides. | **Structural ground truth, see "Official DM/SM monthly meeting format" below** — tables show a MULTI-MONTH trend (SEP/OCT/NOV/DEC + Total columns) per site, not a single-month snapshot. Our Kyiv-1 deck so far is single-month only — worth asking Adam whether a future version should add the trend view. |
| `real_SM_DM_meeting_Kyiv1_2025-04.pptx` | A **real deck Adam actually used**, April 2025 cycle, Kyiv 1, built around native pptx tables (not OLE). 11 slides. | Real "Домовленості" content, real AGENDA time-budget, real "Виторг основна ціль" framing slide — see below, all pulled from this file's actual text. |
| `real_SM_DM_meeting_Kyiv1_september_with_cover.pptx` | Same deck as above plus one extra title slide ("Показники Вересня / Kyiv 1" — identical title to our own September deck). 12 slides. | Same content as the April file, confirms the structure repeats month to month with the same section order and the same "Домовленості" format, just the data/comments change. |
| `real_discounts_writeoffs_deepdive_2025-08.pptx` | A **real peer district's** deep-dive deck (different site codes — J010/J017/J030/J061/J068/J097/J099, not Kyiv 1's codes), July/August 2025, topic = discounts (Знижки) and stock write-offs (Списання). 19 slides. | A template for a *topic deep-dive* deck (narrower than a full monthly follow-up) — useful if Adam ever asks for a discounts-only or write-offs-only deck. Confirms reason code 81 ("Other corr.") is a recurring real discussion point industry-wide, cross-validates our own Stock Adj by reason work. Also has "Зони відповідальності" and "MY / development" slide patterns (people-development tracking). |
| `training_2day_expert_deck_sample.pptx` | A **2-day in-person training deck** ("Тренінг експертів дістриктів"), heavy on photos/icons/process diagrams — 64 slides, 137 media files. | **Visual-effects source — see "Visual effects reference" in SKILL.md.** Real JYSK lifestyle photography, flat 256×256 icon set, the exact soft-shadow/rounded-card recipe, chevron/flowchart process shapes. Not a KPI deck — don't copy its structure, only its visual techniques. |
| `training_trainer_prep_guide_2027.pptx` | The trainer's OWN prep companion to the above (not the trainee-facing deck) — "Підготовка до навчання в дістрикті (для тренера)". 79 slides, 117 pictures. | Lower priority, not deeply reviewed — same visual family as the 2-day deck above, skim further only if a training/onboarding deck is actually requested. |

## Official DM/SM monthly meeting format (from `HQ_DM_SM_monthly_meeting_template_2026-12.pptx`)

Slide order: title → **Sales Index - Monthly Development** (multi-month
trend table, comparable stores) → **Performance District and stores** →
**Sales Performance by Product area** (month + FY acc.) → **Stock
Adjustments by store** (month + FY acc.) → **Productivity** (month + FY
acc.) → a "Продуктивність = якісне планування" slide → two
workshop/discussion slides to close.

Two things this reveals that our Kyiv-1 OLE deck doesn't currently do:
1. **Month + FY acc. side by side** — several slide subtitles literally
   say "month and FY acc." (financial-year-to-date accumulated), i.e. the
   official format shows the current month's number AND the running
   FY total together, not just the month in isolation.
2. **Multi-month trend table** — the "Sales Index - Monthly Development"
   table has one row per site and one column per recent month (SEP, OCT,
   NOV, DEC, Total) rather than district-vs-store for a single month.

## Real "Домовленості" / AGENDA / framing patterns (from the two real Kyiv-1 decks)

Pulled verbatim from `real_SM_DM_meeting_Kyiv1_2025-04.pptx` /
`..._september_with_cover.pptx` — these are Adam's own real decks, not
a guess at the format:

- **AGENDA is a 2-column time-budget table** (Тема / Час), not a bare
  bullet list — e.g. "Результати [місяця] основні КРІ" 25хв, "Stock
  Taking - воркшоп" 30хв, "Sales Attitude та його «індикатори»" 25хв,
  "Операційні питання" 90хв, "Підсумки" 10хв, summing to the stated
  "ТРИ години" (3 hours). Our `agenda_slide` builds a plain bullet list
  with no table or time budget — worth upgrading to this table format
  for a real meeting deck.
- **"Виторг основна ціль" (Revenue is THE goal) is its own slide**,
  placed right after the results breaker and before any KPI detail, with
  the explicit framing line "Всі решта KPI – як індикатор на що потрібно
  звернути увагу та ВПЛИВАТИ для ВИТОРГУ" (every other KPI is an
  indicator of what to watch and influence, in service of revenue). Our
  deck jumps straight into the Sales table without ever stating this
  governing principle — a real, missing north-star slide.
- **"Домовленості" is a concrete, channel-tagged checklist**, not a
  generic "fill in during discussion" placeholder — real example:
  "Оберіть зону відповідальності — Прокомунікуйте з DM (Прописуємо
  коментарі)", "Прописуємо коментар та причину по оформленні
  безкоштовної доставки (в групу DM\\SM\\DepSM)", "Фокус на закриття
  штату (калькулятор+вакансії)", "Індор-ондісплей (виставка артикулів)",
  "Якісна підготовка до візитів (GSM)". The content itself is month-
  specific and shouldn't be copied verbatim into a different month's
  deck, but the FORMAT is clear: a short list of concrete action items,
  each naming who/where it gets communicated (a Telegram/Teams group
  name in parentheses), not a vague prompt.

**Applied** (Adam confirmed): all three now live in
`scripts/dm_meeting_helpers.py` — `agenda_table_slide` (the Тема/Час
table + duration callout) and `goal_statement_slide` (the "Виторг —
основна ціль" framing slide) — and the Kyiv-1 September deck's closing
slide uses the five real "Домовленості" items verbatim (they repeat
unchanged between the April 2025 and September files, so they read as
standing operational focus areas, not one-off month data — still worth
Adam double-checking/editing live in the meeting as always). See
`dm_meeting_helpers.py`'s own module docstring and SKILL.md's "Real
DM/SM monthly-meeting slide builders" section.
