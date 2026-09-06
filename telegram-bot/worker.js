// =============================================================================
// Kyiv-1 Telegram bot — Cloudflare Worker
//
// Two entry points:
//   - fetch()      handles the Telegram webhook (chat administration: welcome
//                   messages, moderation commands, antiflood, activity stats,
//                   on-demand dashboard reports, reminder management).
//   - scheduled()   runs every 5 minutes (Cron Trigger, see wrangler.toml) and
//                   fires due custom reminders + the optional daily work digest.
//
// State is stored in the same free Firebase project the dashboard
// (../index.html) already uses — collection `telegram-bot` for the bot's own
// data, and read-only access to the existing `kyiv1` collection for
// vacancies / staffing / login-log so reminders can reflect real data.
// See telegram-bot/README.md for setup steps.
// =============================================================================

const TELEGRAM_API = "https://api.telegram.org/bot";
const BOT_COLLECTION = "telegram-bot";
const DASHBOARD_COLLECTION = "kyiv1";
const OVERDUE_DAYS = 30; // keep in sync with OVERDUE_DAYS in ../index.html
const SILENT_DAYS = 7; // keep in sync with the Активність tab in ../index.html
const DEFAULT_REPORTS_WINDOW = { start: "17:00", end: "23:00" };
const DEFAULT_PHOTO_REPORTS_WINDOW = { start: "08:00", end: "12:00" };
// Small grace period after a report window's end: a report sent a couple
// minutes late still counts, and the "who's missing" message waits until
// the grace period (not the raw window end) before firing — so someone
// wrapping up right at closing time isn't wrongly flagged as missing.
const REPORT_GRACE_MINUTES = 15;
function graceEnd(window) {
  return addMinutesToHHMM(window.end, REPORT_GRACE_MINUTES);
}
function addMinutesToHHMM(hhmm, mins) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Per-store streak counters ("N днів поспіль без пропущеного звіту") — kept
// separately for evening text reports (state.reportStreaks) and morning
// photo reports (state.photoStreaks), updated at the same end-of-window
// check that already knows who reported today and who didn't. A store that
// reports gets its streak bumped (and its all-time best raised if beaten);
// a store that missed gets reset to 0 — no partial credit, matching how
// "missing" already works for that window.
function updateStreaks(streaks, stores, doneMap) {
  streaks = streaks || {};
  for (const s of stores) {
    if (!s.code) continue;
    const rec = streaks[s.code] || { current: 0, best: 0 };
    if (doneMap[s.code]) {
      rec.current += 1;
      rec.best = Math.max(rec.best, rec.current);
    } else {
      rec.current = 0;
    }
    streaks[s.code] = rec;
  }
  return streaks;
}

// A short "🔥 top streaks" line appended to the end-of-window summary —
// only when there's something worth celebrating (2+ days), so a fresh
// district with everyone at day 1 doesn't get a redundant callout.
function topStreaksLine(streaks) {
  const entries = Object.entries(streaks || {}).filter(([, r]) => r.current >= 2).sort((a, b) => b[1].current - a[1].current).slice(0, 3);
  if (!entries.length) return "";
  return `\n\n🔥 Найдовші стріки зараз: ${entries.map(([code, r]) => `${code} — ${r.current} дн.`).join(", ")}`;
}

// Copy style across MORNING_MESSAGES / ACTIVITY_MOTIVATION_* / WEEKLY_MOTIVATION
// / CONGRATS_TEMPLATES below follows one house voice: confident and warm, no
// empty slogans, short lines, <b>one bolded key idea</b> per message, and —
// per the engagement-copywriter brief this district manager gave — a light
// call-to-action closing almost every message (a question or a one-emoji
// reaction) so people actually reply in the chat instead of just reading.
// Sent with parse_mode: "HTML" (see the sendMessage calls that use these).
const MORNING_MESSAGES = [
  "☀️ <b>Новий день — новий рахунок з нуля!</b>\nКожен покупець сьогодні — це шанс показати клас 💪\nПишіть у чаті одним емодзі, з яким настроєм стартуємо 👇",
  "🚀 <b>Ранок — час діяти, а не роздумувати!</b>\nВчорашні результати вже в архіві — сьогодні пишемо нову історію.\nХто перший поставить 🔥 у чаті — той і задає темп дня 😉",
  "💪 <b>Доброго ранку, команда!</b>\nВи щодня робите Kyiv-1 кращим дістриктом — і це факт, не пусті слова.\nНапишіть у чаті, яка мета в кожного з вас на сьогодні 🎯",
  "☕ <b>Кава в руках, план у голові — вперед!</b>\nМаленькі перемоги щодня складаються у великий результат дістрикту.\nПоставте 👍, якщо готові рвати сьогодні план 🔥",
  "🌅 <b>Прокидаємось і сяємо!</b>\nСьогодні — новий шанс перевершити вчорашній результат.\nЯкий покупець сьогодні стане вашим найкращим? Розкажіть у чаті ввечері 😉",
  "🙌 <b>Доброго ранку, колеги!</b>\nМи одна команда, і кожен з вас — частина результату дістрикту.\nНапишіть коротко: що сьогодні точно вийде на 💯?",
  "🔥 <b>Ранок — стартова точка сильного дня!</b>\nСьогодні у кожного магазину є шанс стати найкращим у дістрикті.\nХто готовий позмагатись за це звання? Відгукніться в чаті 👇",
  "✨ <b>Новий день починається з вас!</b>\nЕнергія, впевненість і гарний настрій — ваш стартовий набір на сьогодні.\nПоставте емодзі настрою в чаті — подивимось, яка команда сьогодні 😄",
  "🎯 <b>Ціль дня легка, якщо йти впевнено.</b>\nВаша робота щодня робить різницю для покупців — дякуємо за це!\nНапишіть у чаті, з чого почнете сьогодні найперше 👇",
  "🚀 <b>Доброго ранку, Kyiv-1!</b>\nВчора був гарний день, а сьогодні буде ще кращий — просто повірте.\nХто перший поділиться планом на день у чаті? 😉",
];

// Short one-liners appended to the twice-a-day activity digest (see
// sendActivityDigest) — free, no external API, same picked-at-random
// pattern as MORNING_MESSAGES above.
const ACTIVITY_MOTIVATION_MORNING = [
  "💪 <b>Дякуємо за вчорашню активність!</b> Сьогодні рахунок з нуля — покажемо ще краще 🚀\nХто сьогодні поб'є вчорашній рекорд? Пишіть у чаті 👇",
  "🔥 <b>Гарний результат учора, команда!</b>\nСьогодні — шанс закріпити темп.\nПоставте 👍, якщо налаштовані повторити вчорашній рівень активності",
  "☀️ <b>Вчора хтось точно старався — і це видно!</b>\nСьогодні всі шанси знову бути в топі.\nХто сьогодні бореться за перше місце? Заявляйте про себе в чаті 😉",
  "🙌 <b>Кожен голос і кожне повідомлення важливі для команди.</b>\nГарного і активного дня!\nНапишіть у чаті, чим плануєте зайнятись сьогодні найперше 👇",
];
const ACTIVITY_MOTIVATION_EVENING = [
  "🔥 <b>День ще не закінчився — час додати собі балів!</b>\nДо вечора ще купа можливостей.\nХто ще встигне піднятись у рейтингу? Дійте 💪",
  "💪 <b>Дякуємо всім, хто вже був активний сьогодні!</b>\nПродовжуємо в тому ж дусі.\nПоставте 🔥, якщо плануєте ще додати активності до вечора",
  "🚀 <b>Гарний темп! Рахунок ще можна підняти.</b>\nНе зупиняємось — вечір попереду.\nХто фінішує сьогодні на топ-3? Пишіть у чаті 👇",
  "🙌 <b>Кожна репліка в чаті — це і активність, і командний дух.</b>\nДякуємо, що ви з нами!\nЩо плануєте встигнути до кінця дня? Поділіться 😉",
];
const WEEKLY_MOTIVATION = [
  "🚀 <b>Дякуємо за цей тиждень, команда!</b>\nНовий тиждень — нові рекорди.\nЯка ціль номер один на цей тиждень? Пишіть у чаті 👇",
  "💪 <b>Кожен внесок цього тижня наближає дістрикт до цілі.</b>\nВперед до нового рекорду!\nХто цього тижня бореться за топ-3? Заявляйтесь 😉",
  "☀️ <b>Чудова динаміка!</b>\nНехай наступний тиждень буде ще активнішим.\nПоставте 🔥, якщо готові побити результат цього тижня",
  "🙌 <b>Дякуємо всім, хто був активний і підтримував команду.</b>\nНа новий тиждень — з новими силами!\nЩо плануєте покращити цього тижня? Напишіть у чаті 👇",
];

// Occasion keyword groups + reply pools for maybeJoinCongrats(). Free —
// no external API: the occasion type is guessed from keywords, then one of
// several ready phrases for that type is picked at random (optionally
// naming whoever was @mentioned/replied-to in the original message).
const CONGRATS_CATEGORIES = {
  birthday: ["день народження", "днем народженн", "з др "],
  promotion: ["підвищенням", "призначенням", "новою посадою"],
  anniversary: ["ювіле", "роковин"],
  victory: ["перемогою", "перемогли", "виграли", "виграла", "виграв"],
  generic: ["вітаю", "вітаємо", "поздоровля", "з нагоди", "вітання"],
};
const CONGRATS_TEMPLATES = {
  birthday: [
    "🎉 <b>Із днем народження{NAME}!</b> Хай рік буде яскравим і успішним 🎂\nХто ще приєднається з привітаннями? 👇",
    "🥳 <b>І ми вітаємо{NAME}!</b> Нехай усе задумане здійсниться цього року 🎁\nПишіть теплі побажання нижче 💬",
    "🎂 <b>Приєднуємось до теплих слів{NAME}!</b> Гарного настрою й тільки добрих новин 🥳",
    "🎈 <b>З днем народження{NAME}!</b> Хай мрії збуваються, а дні будуть щасливими 🎉\nХто скине найтепліше привітання? 👇",
  ],
  promotion: [
    "🚀 <b>Вітаємо{NAME} з підвищенням!</b> Заслужений результат — так тримати 💪\nХто приєднається з вітаннями? 👏",
    "🎉 <b>Чудова новина{NAME}!</b> Вітаємо з новою посадою й бажаємо успіху на новому рівні 🚀",
    "👏 <b>Вітаємо{NAME}!</b> Праця не залишилась непоміченою — вперед до нових цілей 🔥",
  ],
  anniversary: [
    "🎊 <b>Вітаємо{NAME} з ювілеєм!</b> Дякуємо за внесок у нашу команду 🙌",
    "🎉 <b>Особлива дата{NAME}!</b> Вітаємо й бажаємо ще багато таких вагомих подій 🎊",
  ],
  victory: [
    "🏆 <b>Вітаємо з перемогою{NAME}!</b> Заслужений результат — пишаємось 🔥\nХто ще додасть слова підтримки? 👇",
    "🎉 <b>Оце так результат{NAME}!</b> Вітаємо і бажаємо тримати цей темп 🚀",
    "👏 <b>Вітаємо{NAME}!</b> Класна робота — так тримати 💪",
  ],
  generic: [
    "🙌 <b>Приєднуємось до привітань{NAME}!</b> Хай усе буде якнайкраще ✨",
    "🎉 <b>І ми вітаємо{NAME}!</b> Гарного настрою й тільки приємних новин 😊",
    "👏 <b>Вітаємо{NAME}!</b> Раді за вас 🙌",
  ],
};
const CONGRATS_COOLDOWN_MS = 2 * 60 * 60 * 1000; // don't re-join the same thread's celebration more than once per 2h

// Proactive birthday greetings — unlike maybeJoinCongrats above (which only
// reacts once someone ELSE has already posted a wish), the bot announces
// the day itself, first. Roster lives in the same free Firestore project,
// dashboard collection (kyiv1/birthdays — same read pattern as
// staffing-stores) as {firstName, lastName, day, month, store}: day/month
// only, no year, since a birthday repeats every year.
const DISTRICT_MANAGER_SIGNATURE = "Адам Садкевич, District Manager";
const BIRTHDAY_WISHES = [
  "Хай рік буде яскравим і успішним, а кожен день — вдалим 🎂",
  "Нехай усе задумане здійсниться цього року 🎁",
  "Гарного настрою й тільки добрих новин 🥳",
  "Хай мрії збуваються, а дні будуть щасливими 🎉",
];

function buildBirthdayMessage(b) {
  const fullName = escapeHtml(`${b.firstName || ""} ${b.lastName || ""}`.trim());
  const storeLabel = b.store ? ` (${escapeHtml(b.store)})` : "";
  const wish = BIRTHDAY_WISHES[Math.floor(Math.random() * BIRTHDAY_WISHES.length)];
  return `🎉 <b>Сьогодні святкує день народження ${fullName}${storeLabel}!</b>\n\n${wish}\n\nОсобисто приєднуюсь до вітань — ${DISTRICT_MANAGER_SIGNATURE} 🙌\n\nХто ще приєднається? Пишіть теплі слова в чаті 👇`;
}

// Roster entries (from HR data) don't carry a Telegram user id, so before
// greeting someone we match them against state.names — the map of
// {userId: "First Last"} the bot already builds from real messages seen in
// this chat — trying both name orders (HR table lists Прізвище/Ім'я, i.e.
// Last/First, while Telegram profiles are usually First Last). No match
// found means we have no evidence this person is even in the chat, so we
// skip them rather than guess.
function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[’ʼ`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function exactNameMatches(state, b) {
  const first = normalizeName(b.firstName);
  const last = normalizeName(b.lastName);
  const candidates = new Set([normalizeName(`${first} ${last}`), normalizeName(`${last} ${first}`)].filter(Boolean));
  return Object.entries(state.names || {})
    .filter(([, name]) => candidates.has(normalizeName(name)))
    .map(([uid]) => uid);
}

// True if `token` (a single word from a Telegram display name, trailing dot
// already allowed) could stand for `fullWord`: an exact match, or a bare
// initial — "м" or "м." for "марк".
function tokenStandsFor(token, fullWord) {
  const t = token.replace(/\.$/, "");
  if (!t || !fullWord) return false;
  return t === fullWord || (t.length === 1 && t === fullWord[0]);
}

// Catches the HR name and the Telegram profile name referring to the same
// person even when they don't match word-for-word — e.g. HR says "Афонічев
// Марк" but the person is registered in Telegram as "Марк А." (surname
// abbreviated to an initial) or "М. Афонічев" (first name abbreviated).
// Requires at least one of the two name parts to match in FULL (not both as
// bare initials) — "М. А." alone is too weak a signal and would match half
// the roster.
function looseNameMatch(b, tgName) {
  const first = normalizeName(b.firstName);
  const last = normalizeName(b.lastName);
  if (!first || !last) return false;
  const tokens = normalizeName(tgName).split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < tokens.length; j++) {
      if (i === j) continue;
      const [a, c] = [tokens[i], tokens[j]];
      if (!tokenStandsFor(a, first) || !tokenStandsFor(c, last)) continue;
      const firstExact = a.replace(/\.$/, "") === first;
      const lastExact = c.replace(/\.$/, "") === last;
      if (firstExact || lastExact) return true;
    }
  }
  return false;
}

function looseNameMatches(state, b) {
  return Object.entries(state.names || {})
    .filter(([, name]) => looseNameMatch(b, name))
    .map(([uid]) => uid);
}

// Resolves a birthday roster's store label (a name, e.g. "Pohreby") to the
// dashboard's store code (e.g. "J104") — the same code storeMembers keys
// on — so an ambiguous name match can be narrowed down by store.
async function resolveStoreCodeForBirthday(env, b) {
  if (!b.store) return null;
  const stores = await getStoreCodes(env);
  const match = stores.find((s) => s.name && normalizeName(s.name) === normalizeName(b.store));
  return match ? match.code : null;
}

// Tries an exact name match first, falls back to the loose/abbreviated match
// above when nothing exact is found. Either tier can turn up more than one
// candidate (e.g. two people both fitting "М. А.", or two exact namesakes)
// — when that happens, narrow using the roster's store (via storeMembers,
// filled by /storepoll or /mystore) if it resolves to exactly one of them.
// Still ambiguous after that → return null: skip the greeting rather than
// risk sending it to the wrong person.
async function findMemberUserId(env, state, b) {
  let candidates = exactNameMatches(state, b);
  if (!candidates.length) candidates = looseNameMatches(state, b);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const code = await resolveStoreCodeForBirthday(env, b);
  if (code) {
    const inStore = candidates.filter((uid) => state.storeMembers?.[uid] === code);
    if (inStore.length === 1) return inStore[0];
  }
  return null;
}

// Only greet people confirmed to still be in the chat: matched to a known
// member by name AND currently an active member per getChatMember (not
// "left"/"kicked") — someone who quit the group or was removed shouldn't
// get a public birthday message. Any lookup failure is treated the same as
// "not confirmed" — better to silently skip one greeting than to send it to
// someone who's gone.
async function isActiveMember(env, chatId, userId) {
  const res = await tg(env, "getChatMember", { chat_id: chatId, user_id: userId });
  const status = res?.result?.status;
  return !!status && status !== "left" && status !== "kicked";
}

async function sendBirthdayGreetings(chatId, env, state, now) {
  const birthdays = (await loadDashboardDoc(env, "birthdays")) || [];
  const month = Number(now.month.slice(5));
  const todays = birthdays.filter((b) => Number(b.day) === now.dayOfMonth && Number(b.month) === month);
  for (const b of todays) {
    const uid = await findMemberUserId(env, state, b);
    if (!uid) continue; // no known chat member with this name — nothing to confirm, so skip
    if (!(await isActiveMember(env, chatId, uid))) continue; // left or was removed from the chat
    await tg(env, "sendMessage", withThread({ chat_id: chatId, text: buildBirthdayMessage(b), parse_mode: "HTML" }, state.birthdayGreeting.threadId));
  }
}

async function cmdBirthdays(chatId, msg, argsText, env) {
  const [action, timeStr] = argsText.trim().split(/\s+/);
  const state = await getState(env, chatId);
  state.birthdayGreeting = state.birthdayGreeting || { enabled: false, time: "08:00", threadId: null, lastSentDate: null };

  if (action === "on") {
    const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr || "");
    if (m) state.birthdayGreeting.time = roundTo5(Number(m[1]), Number(m[2]));
    state.birthdayGreeting.enabled = true;
    state.birthdayGreeting.threadId = msg.message_thread_id ?? null;
    await setState(env, chatId, state);
    await addToChatsIndex(env, chatId);
    await tg(env, "sendMessage", withThread({ chat_id: chatId, text: `✅ Привітання з днем народження увімкнено на ${state.birthdayGreeting.time}. Список днів народжень — kyiv1/birthdays у Firestore.` }, state.birthdayGreeting.threadId));
  } else if (action === "off") {
    state.birthdayGreeting.enabled = false;
    await setState(env, chatId, state);
    await tg(env, "sendMessage", { chat_id: chatId, text: "Привітання з днем народження вимкнено." });
  } else {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: state.birthdayGreeting.enabled
        ? `Привітання з днем народження увімкнено на ${state.birthdayGreeting.time}.`
        : "Привітання з днем народження вимкнено. Увімкнути: /birthdays on 08:00 (написати в потрібній темі або в General).",
    });
  }
}

// /enginepoll — an on-demand engagement poll (free, no external API): a
// question + exactly 4 emoji-labeled options, plus a short discussion-hook
// message right after it so the poll doesn't just sit there silently.
// Admin triggers it whenever they want a quick pulse-check or a reason for
// people to open the chat and react.
const ENGAGEMENT_POLLS = [
  {
    question: "🔥 Як настрій сьогодні?",
    options: ["🚀 На повних обертах", "💪 Норм, працюємо", "😅 Тримаюсь", "🆘 Потрібна підтримка"],
    hook: "💬 Пишіть у чаті, що допомогло б зробити день ще кращим 👇",
  },
  {
    question: "🎯 Що найбільше драйвить цього тижня?",
    options: ["💰 Результати продажів", "🤝 Командна атмосфера", "🏆 Особисті цілі", "🎉 Щось інше — напишу в чаті"],
    hook: "⚡ Діліться в чаті — що саме заряджає саме вас?",
  },
  {
    question: "💬 Наскільки легко було виконати завдання цього тижня?",
    options: ["😎 Проблем не було", "🙂 Впорався(-лась), як завжди", "🤔 Були складнощі", "😩 Було дуже важко"],
    hook: "🙌 Якщо було важко — пишіть чому, розберемось разом",
  },
];

async function cmdEnginePoll(chatId, msg, env) {
  const pool = ENGAGEMENT_POLLS[Math.floor(Math.random() * ENGAGEMENT_POLLS.length)];
  await tg(env, "sendPoll", withThread({
    chat_id: chatId,
    question: pool.question,
    options: pool.options.map((text) => ({ text })),
    is_anonymous: true,
    allows_multiple_answers: false,
  }, msg.message_thread_id));
  await tg(env, "sendMessage", withThread({ chat_id: chatId, text: pool.hook }, msg.message_thread_id));
}

// Free (no external API) keyword heuristics powering the per-message signal
// breakdown behind the dashboard's Telegram tab "Аналіз активності" — a
// message is flagged as a "success/result" or "support" mention if its text
// (or caption) contains any of these substrings. This is intentionally a
// simple, transparent rule, not real language understanding: it will miss
// paraphrased success stories and occasionally flag an unrelated message —
// the UI carries a disclaimer about this, and the score it feeds is only
// ever a rough signal, never a productivity judgment.
const SUCCESS_KEYWORDS = [
  "виконав", "виконали", "виконано", "зробив", "зробили", "зроблено",
  "готово", "готова", "готовий", "результат", "перевикона",
  "план виконан", "закрили", "закрив", "закрила", "вдалося", "вдалось",
  "успішно", "продали", "продав", "продала", "продано", "рекорд",
  "досягли", "досягла", "досяг", "справились", "справилися", "впорались",
];
const SUPPORT_KEYWORDS = [
  "дякую", "дякуємо", "молодці", "молодець", "класно", "супер", "чудово",
  "гарна робота", "так тримати", "підтримую", "згоден", "згодна",
  "допоможу", "допомога", "разом впораємось", "красунчики", "респект",
  "браво", "вітаю", "вітаємо", "гарний результат", "все вийшло",
];

function textHasAny(text, keywords) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// ------------------------------------------------------- levels & points --
// Free, local "levels & reputation" system: every tracked action earns a
// small number of points, stored per-user in state.points and shown as a
// leaderboard on the dashboard (index.html, вкладка Telegram-бот →
// Рейтинг). No external service involved — just a running counter.
const POINTS = {
  message: 1, // any tracked message (isContentMessage)
  photo: 2, // bonus on top of `message` for photo/video/document
  video: 2,
  document: 2,
  success: 3, // message matched a SUCCESS_KEYWORDS phrase
  support: 1, // message matched a SUPPORT_KEYWORDS phrase
  eveningReport: 10, // first time today a store's evening report is logged
  photoReport: 10, // first time today a store's photo report is logged
  checklistConfirm: 15, // confirming a store in the monthly checklist poll
  quizCorrect: 5, // first correct answer to a presentation-quiz question
};

// Kept in sync with the identical array in index.html (tgGetLevel /
// TG_LEVELS) — duplicated rather than shared because the project has no
// build step to import a common module from.
const TG_LEVELS = [
  { min: 0, name: "Новачок", emoji: "🌱" },
  { min: 50, name: "Активний учасник", emoji: "🙂" },
  { min: 150, name: "Досвідчений", emoji: "💪" },
  { min: 350, name: "Профі", emoji: "⭐" },
  { min: 700, name: "Зірка чату", emoji: "🌟" },
  { min: 1500, name: "Легенда дістрикту", emoji: "👑" },
];

function getLevel(points) {
  let level = TG_LEVELS[0];
  for (const l of TG_LEVELS) if (points >= l.min) level = l;
  return level;
}

// Yesterday's calendar date, computed by pure string arithmetic on an
// already-Kyiv-local "YYYY-MM-DD" — no timezone conversion needed since
// dateStr is already the local calendar day.
function prevDateStr(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function daysAgoStr(dateStr, n) {
  let d = dateStr;
  for (let i = 0; i < n; i++) d = prevDateStr(d);
  return d;
}
// The 7 calendar days ending yesterday — e.g. run on Monday, this is
// exactly the previous full Mon–Sun week ("підсумки тижня").
function pastWeekDays(todayStr) {
  const days = [];
  let d = prevDateStr(todayStr);
  for (let i = 0; i < 7; i++) {
    days.push(d);
    d = prevDateStr(d);
  }
  return days;
}
function sumPointsByDay(state, days) {
  const totals = {};
  for (const day of days) {
    const bucket = (state.pointsByDay || {})[day];
    if (!bucket) continue;
    for (const [uid, pts] of Object.entries(bucket)) totals[uid] = (totals[uid] || 0) + pts;
  }
  return totals;
}

function addPoints(state, user, amount) {
  if (!amount || !user) return;
  state.points = state.points || {};
  const key = String(user.id);
  state.points[key] = (state.points[key] || 0) + amount;
  state.names = state.names || {};
  state.names[key] = displayName(user);

  // Permanent per-day bucket (never reset, same pattern as state.stats) —
  // powers both the twice-a-day "Активності/Акції" chat digest (today's/
  // yesterday's slice) and the Monday weekly digest (last 7 days summed).
  // state.points above (used by the site's leaderboard and /rating) is
  // cumulative across all time and unaffected by any of this —
  // "на сайт рахуємо як і було".
  const today = kyivNow(Date.now()).dateStr;
  state.pointsByDay = state.pointsByDay || {};
  state.pointsByDay[today] = state.pointsByDay[today] || {};
  state.pointsByDay[today][key] = (state.pointsByDay[today][key] || 0) + amount;
}

const HELP_TEXT = `🤖 Команди бота

Модерація (лише для адмінів чату, відповіддю на повідомлення):
/ban — заблокувати учасника
/unban <user_id> — розблокувати
/kick — видалити з чату (може зайти знову)
/mute [хв] — заборонити писати (типово 60 хв)
/unmute — зняти обмеження
/warn [причина] — попередження (3 попередження → авто-мут на годину)
/unwarn — зняти одне попередження
/warnings — кількість попереджень
/pin — закріпити повідомлення
/unpin — відкріпити
/del — видалити повідомлення
/setrules <текст> — встановити правила чату

Загальне:
/rules — показати правила чату
/stats [week] — активність учасників (сьогодні або за 7 днів)
/rating (або /top) — рейтинг балів і рівнів (повний лідерборд — на сайті)
/help — цей список

Дані дістрикту (з дашборду):
/vacancies — прострочені та відкриті вакансії
/activity — керуючі, які давно не заходили на сайт

Нагадування (адміни чату):
/addreminder ГГ:ХХ daily|пн,ср,пт текст — додати нагадування
/reminders — список нагадувань
/delreminder <id> — видалити нагадування
/digest on ГГ:ХХ | /digest off | /digest — щоденний дайджест по вакансіях/активності

Приєднання до привітань (адміни чату):
/congrats on|off — увімкнути/вимкнути (типово увімкнено)
Коли хтось у чаті вітає колегу (день народження, підвищення тощо), бот сам додає своє привітання у відповідь.

Щоранкове привітання (адміни чату):
/morning on [ГГ:ХХ] — увімкнути (типово 10:00), написати в потрібній темі (або General)
/morning off — вимкнути
/morning — статус

Привітання з днем народження (адміни чату, безкоштовно):
/birthdays on [ГГ:ХХ] — увімкнути (типово 08:00), написати в потрібній темі (або General)
/birthdays off — вимкнути
/birthdays — статус
Бот сам, першим, вітає в чаті кожного, у кого сьогодні день народження — з особистим підписом від District Manager і закликом приєднатись у коментарях. Список днів народжень — у Firestore (kyiv1/birthdays).

Звіти магазинів (у темі форуму, адміни чату):
/setreportstopic — прив'язати ПОТОЧНУ тему (написати команду всередині неї) як тему звітів
/reportswindow ГГ:ХХ ГГ:ХХ — вікно перевірки (типово 17:00–23:00)
/reportstatus — хто ще не звітував станом на зараз
Через 15 хв після кінця вікна (типово 23:15) бот сам напише в цій темі, які магазини не надіслали звіт (розпізнає код магазину на початку повідомлення) — невеликий запас часу, щоб звіт, надісланий буквально в останні хвилини, теж зарахувався. Магазини, що звітують без пропусків, накопичують стрік — /streaks показує поточні стріки (і вечірніх звітів, і фотозвітів нижче).

Щомісячний чекліст магазинів (у темі форуму, адміни чату):
/settaskstopic — прив'язати ПОТОЧНУ тему (напр. «Завдання») для чекліста
/checkliststatus — хто ще не підтвердив цього місяця
1, 2 і 3 числа о 12:00 бот сам надсилає опитування зі списком магазинів (лише тих, хто ще не підтвердив) — кожен обирає код свого магазину, коли всі пункти чекліста виконано.

Ранкові фотозвіти по мінусових залишках (у темі форуму, адміни чату):
/setphotoreportstopic — прив'язати ПОТОЧНУ тему для фотозвітів
/photoreportswindow ГГ:ХХ ГГ:ХХ — вікно перевірки (типово 08:00–12:00)
/photoreportstatus — хто ще не надіслав фото+коментар станом на зараз
Магазин скидає в цю тему фото (з кодом магазину в підписі — або без,
якщо учасник прив'язаний до магазину командою /mystore). Через 15 хв
після кінця вікна бот сам напише, хто ще не надіслав — і нагадає
опрацювати мінусові залишки та прописати коментарі.

Прив'язка учасника до магазину (для звітів без коду в тексті):
/mystore J104 — прив'язати СЕБЕ до магазину (кожен робить сам, один раз)
/linkstore J104 — прив'язати когось іншого (відповіддю на повідомлення, адміни чату)
/storemembers — список прив'язок
/storepoll (адміни чату) — надіслати всім опитування "оберіть свій магазин" (одне натискання замість команди) — потрібно для подальшої комунікації, щоб повідомлення й нагадування точно доходили до потрібної людини; надсилається в тему «Активності», якщо вона прив'язана

Щоденна статистика активності (у темі форуму, адміни чату):
/setactivitytopic — прив'язати ПОТОЧНУ тему (напр. «Активності/Акції») для щоденної статистики
О 10:00 бот надсилає підсумок активності за вчора, о 17:00 — зріз за сьогодні (з рівнями й короткою мотивацією) — рахунок щодня оновлюється з нуля. Щопонеділка о 10:01 у ту саму тему — підсумки тижня: найактивніші учасники, магазини з найбільшою кількістю виконаних завдань, і (якщо ввімкнено відстеження реакцій) чиє привітання зібрало найбільше реакцій. Загальний рейтинг і рівні (/rating, сайт) рахуються окремо й накопичуються завжди, без скидання.

Тригери на реакції (ознайомлення з інструкціями):
/trackack <мітка> — відповіддю на повідомлення (напр. інструкцію) — почати відстежувати реакції на нього; будь-яка реакція від учасника зараховується як «ознайомлений(а)» (адміни чату)
/ackstatus — відповіддю на відстежуване повідомлення — хто вже ознайомився
/acklist — список усіх повідомлень під відстеженням у цьому чаті
Потребує один раз оновленого webhook з update-типом message_reaction (див. README) — без цього кроку команди відстежаться, але реакції зараховуватись не будуть.

Залучаюче опитування (адміни чату):
/enginepoll — надіслати випадкове опитування для швидкого пульс-чеку команди (4 варіанти-емодзі) + коротке повідомлення з гачком для обговорення в чаті.

Квіз за презентацією (у темі форуму, адміни чату):
/setquiztopic — прив'язати ПОТОЧНУ тему (напр. «Змагання Конкурси») для квізів
Надішліть у цю тему файл презентації (.pptx) — бот опублікує там короткий
квіз (5-8 запитань). Правильна відповідь одразу видно відправнику (нативний
Telegram-квіз) і додає +5 балів у загальний рейтинг. Якщо доданий секрет
ANTHROPIC_API_KEY — питання складає Claude, реально розуміючи зміст і фото
презентації; без нього — простіший безкоштовний варіант "до якого слайду
належить цей текст" прямо з тексту слайдів (див. telegram-bot/README.md).`;

// ------------------------------------------------------------------ fetch --

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("kyiv1-telegram-bot is running", { status: 200 });
    }
    if (env.WEBHOOK_SECRET) {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secret !== env.WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });
    }
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    ctx.waitUntil(handleUpdate(update, env));
    return new Response("OK");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(event, env));
  },
};

async function handleUpdate(update, env) {
  try {
    if (update.message) await handleMessage(update.message, env);
    if (update.poll) await handlePollUpdate(update.poll, env);
    if (update.poll_answer) await handlePollAnswer(update.poll_answer, env);
    if (update.message_reaction_count) await handleMessageReactionCount(update.message_reaction_count, env);
    if (update.message_reaction) await handleMessageReaction(update.message_reaction, env);
  } catch (err) {
    console.error("handleUpdate error", err);
  }
}

// --------------------------------------------------------------- messages --

async function handleMessage(msg, env) {
  const chatId = msg.chat.id;

  if (msg.chat.type === "private") {
    if (msg.text && msg.text.startsWith("/start")) {
      await tg(env, "sendMessage", {
        chat_id: chatId,
        text: "Привіт! Додайте мене в груповий чат і зробіть адміністратором — я стежитиму за порядком, вестиму статистику та надсилатиму нагадування.",
      });
    }
    return;
  }

  await addToChatsIndex(env, chatId);
  if (msg.chat.title) await syncChatTitle(chatId, msg.chat.title, env);

  if (Array.isArray(msg.new_chat_members) && msg.new_chat_members.length) {
    await handleNewMembers(chatId, msg.new_chat_members, env);
  }

  if (msg.text && msg.text.startsWith("/")) {
    await handleCommand(msg, env);
    return;
  }

  if (msg.from && !msg.from.is_bot && isContentMessage(msg)) {
    await trackActivity(chatId, msg, env); // counts stats/flood for any kind of message content
  }

  if (msg.from && !msg.from.is_bot && msg.text) {
    await maybeJoinCongrats(chatId, msg, env);
  }

  if (msg.from && !msg.from.is_bot && msg.photo) {
    await trackPhotoReport(chatId, msg, env);
  }

  if (msg.from && !msg.from.is_bot && msg.document) {
    await maybeGenerateQuizFromPresentation(chatId, msg, env);
  }
}

async function handleNewMembers(chatId, members, env) {
  const state = await getState(env, chatId);
  for (const m of members) {
    if (m.is_bot) continue;
    const rulesText = state.rules ? `\n\nПравила чату:\n${state.rules}` : "";
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: `Вітаємо, ${displayName(m)}! 👋 Раді бачити тебе в чаті.${rulesText}`,
    });
  }
}

// Any real (non-service) message a person sent — text, photo, sticker,
// voice, video, document, etc. — counts as "communicated" for activity
// stats. Deliberately excludes service events (join/leave, pin) which
// arrive as separate fields the caller checks on its own.
function isContentMessage(msg) {
  return !!(
    msg.text || msg.photo || msg.video || msg.voice || msg.video_note ||
    msg.sticker || msg.animation || msg.document || msg.audio ||
    msg.poll || msg.location || msg.contact || msg.dice || msg.venue || msg.game
  );
}

function displayName(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name || (user.username ? `@${user.username}` : "колего");
}

// Escapes text embedded in a parse_mode: "HTML" Telegram message — needed
// anywhere a real person's name (which can contain &, <, >) is interpolated
// into a message that also uses <b> tags, so Telegram doesn't reject the
// message or mis-render it.
function escapeHtml(text) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --------------------------------------------------------------- commands --

const ADMIN_ONLY_COMMANDS = new Set([
  "ban", "unban", "kick", "mute", "unmute", "warn", "unwarn",
  "pin", "unpin", "del", "setrules", "addreminder", "delreminder", "digest",
  "setreportstopic", "reportswindow", "morning", "congrats", "settaskstopic",
  "setphotoreportstopic", "photoreportswindow", "linkstore", "setactivitytopic",
  "trackack", "enginepoll", "setquiztopic", "birthdays", "storepoll",
]);

async function handleCommand(msg, env) {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  const [cmdRaw, ...rest] = msg.text.trim().split(/\s+/);
  const cmd = cmdRaw.slice(1).split("@")[0].toLowerCase();
  const argsText = rest.join(" ");

  if (ADMIN_ONLY_COMMANDS.has(cmd)) {
    const admin = await isAdmin(env, chatId, fromId);
    if (!admin) {
      await replyTo(env, msg, "Ця команда лише для адміністраторів чату.");
      return;
    }
  }

  const target = msg.reply_to_message?.from;

  switch (cmd) {
    case "start":
    case "help":
      await tg(env, "sendMessage", { chat_id: chatId, text: HELP_TEXT });
      break;

    case "ban":
      if (!target) return replyTo(env, msg, "Дайте команду відповіддю (reply) на повідомлення користувача.");
      await tg(env, "banChatMember", { chat_id: chatId, user_id: target.id });
      await tg(env, "sendMessage", { chat_id: chatId, text: `🚫 ${displayName(target)} заблокований(а) в чаті.` });
      break;

    case "unban":
      if (!argsText) return replyTo(env, msg, "Вкажіть user_id: /unban 123456789");
      await tg(env, "unbanChatMember", { chat_id: chatId, user_id: Number(argsText), only_if_banned: true });
      await tg(env, "sendMessage", { chat_id: chatId, text: `✅ Розблоковано user_id ${argsText}.` });
      break;

    case "kick":
      if (!target) return replyTo(env, msg, "Дайте команду відповіддю на повідомлення користувача.");
      await tg(env, "banChatMember", { chat_id: chatId, user_id: target.id });
      await tg(env, "unbanChatMember", { chat_id: chatId, user_id: target.id, only_if_banned: true });
      await tg(env, "sendMessage", { chat_id: chatId, text: `👋 ${displayName(target)} видалений(а) з чату (може зайти знову).` });
      break;

    case "mute": {
      if (!target) return replyTo(env, msg, "Дайте команду відповіддю на повідомлення користувача. Приклад: /mute 30");
      const minutes = Math.max(1, parseInt(argsText, 10) || 60);
      const untilDate = Math.floor(Date.now() / 1000) + minutes * 60;
      await tg(env, "restrictChatMember", {
        chat_id: chatId, user_id: target.id, until_date: untilDate,
        permissions: { can_send_messages: false, can_send_media_messages: false, can_send_polls: false, can_send_other_messages: false, can_add_web_page_previews: false },
      });
      await tg(env, "sendMessage", { chat_id: chatId, text: `🔇 ${displayName(target)} обмежений(а) на ${minutes} хв.` });
      break;
    }

    case "unmute":
      if (!target) return replyTo(env, msg, "Дайте команду відповіддю на повідомлення користувача.");
      await tg(env, "restrictChatMember", {
        chat_id: chatId, user_id: target.id,
        permissions: { can_send_messages: true, can_send_media_messages: true, can_send_polls: true, can_send_other_messages: true, can_add_web_page_previews: true },
      });
      await tg(env, "sendMessage", { chat_id: chatId, text: `🔊 З ${displayName(target)} знято обмеження.` });
      break;

    case "warn": {
      if (!target) return replyTo(env, msg, "Дайте команду відповіддю на повідомлення користувача.");
      const state = await getState(env, chatId);
      const key = String(target.id);
      state.warns = state.warns || {};
      state.warns[key] = (state.warns[key] || 0) + 1;
      const count = state.warns[key];
      if (count >= 3) {
        state.warns[key] = 0;
        await setState(env, chatId, state);
        const untilDate = Math.floor(Date.now() / 1000) + 60 * 60;
        await tg(env, "restrictChatMember", { chat_id: chatId, user_id: target.id, until_date: untilDate, permissions: { can_send_messages: false } });
        await tg(env, "sendMessage", { chat_id: chatId, text: `⚠️ ${displayName(target)} отримав(ла) 3-є попередження — обмежений(а) на 1 годину. Лічильник скинуто.` });
      } else {
        await setState(env, chatId, state);
        await tg(env, "sendMessage", { chat_id: chatId, text: `⚠️ Попередження ${count}/3 для ${displayName(target)}.${argsText ? " Причина: " + argsText : ""}` });
      }
      break;
    }

    case "unwarn": {
      if (!target) return replyTo(env, msg, "Дайте команду відповіддю на повідомлення користувача.");
      const state = await getState(env, chatId);
      const key = String(target.id);
      state.warns = state.warns || {};
      state.warns[key] = Math.max(0, (state.warns[key] || 0) - 1);
      await setState(env, chatId, state);
      await tg(env, "sendMessage", { chat_id: chatId, text: `Попереджень для ${displayName(target)}: ${state.warns[key]}/3.` });
      break;
    }

    case "warnings": {
      const who = target || msg.from;
      const state = await getState(env, chatId);
      const count = (state.warns && state.warns[String(who.id)]) || 0;
      await tg(env, "sendMessage", { chat_id: chatId, text: `Попереджень для ${displayName(who)}: ${count}/3.` });
      break;
    }

    case "pin":
      if (!msg.reply_to_message) return replyTo(env, msg, "Дайте команду відповіддю на повідомлення, яке треба закріпити.");
      await tg(env, "pinChatMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
      break;

    case "unpin":
      await tg(env, "unpinChatMessage", { chat_id: chatId });
      break;

    case "del":
      if (!msg.reply_to_message) return replyTo(env, msg, "Дайте команду відповіддю на повідомлення, яке треба видалити.");
      await tg(env, "deleteMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
      await tg(env, "deleteMessage", { chat_id: chatId, message_id: msg.message_id });
      break;

    case "setrules": {
      const state = await getState(env, chatId);
      state.rules = argsText;
      await setState(env, chatId, state);
      await tg(env, "sendMessage", { chat_id: chatId, text: "✅ Правила чату оновлено." });
      break;
    }

    case "rules": {
      const state = await getState(env, chatId);
      await tg(env, "sendMessage", {
        chat_id: chatId,
        text: state.rules ? `📋 Правила чату:\n${state.rules}` : "Правила ще не задані. Адмін може встановити їх командою /setrules <текст>.",
      });
      break;
    }

    case "stats":
      await sendStats(chatId, argsText, env);
      break;

    case "rating":
    case "top":
      await sendRating(chatId, env);
      break;

    case "vacancies":
      await sendVacancyReport(chatId, env);
      break;

    case "activity":
      await sendActivityReport(chatId, env);
      break;

    case "addreminder":
      await cmdAddReminder(chatId, argsText, env);
      break;

    case "reminders":
      await cmdListReminders(chatId, env);
      break;

    case "delreminder":
      await cmdDelReminder(chatId, argsText, env);
      break;

    case "digest":
      await cmdDigest(chatId, argsText, env);
      break;

    case "setreportstopic":
      await cmdSetReportsTopic(chatId, msg, env);
      break;

    case "reportswindow":
      await cmdReportsWindow(chatId, argsText, env);
      break;

    case "reportstatus":
      await cmdReportStatus(chatId, msg, env);
      break;

    case "morning":
      await cmdMorning(chatId, msg, argsText, env);
      break;

    case "birthdays":
      await cmdBirthdays(chatId, msg, argsText, env);
      break;

    case "congrats":
      await cmdCongrats(chatId, argsText, env);
      break;

    case "settaskstopic":
      await cmdSetTasksTopic(chatId, msg, env);
      break;

    case "checkliststatus":
      await cmdChecklistStatus(chatId, env);
      break;

    case "setphotoreportstopic":
      await cmdSetPhotoReportsTopic(chatId, msg, env);
      break;

    case "photoreportswindow":
      await cmdPhotoReportsWindow(chatId, argsText, env);
      break;

    case "setactivitytopic":
      await cmdSetActivityTopic(chatId, msg, env);
      break;

    case "setquiztopic":
      await cmdSetQuizTopic(chatId, msg, env);
      break;

    case "photoreportstatus":
      await cmdPhotoReportStatus(chatId, msg, env);
      break;

    case "streaks":
      await cmdStreaks(chatId, env);
      break;

    case "mystore":
      await cmdMyStore(chatId, msg, argsText, env);
      break;

    case "linkstore":
      await cmdLinkStore(chatId, msg, argsText, env);
      break;

    case "storemembers":
      await cmdStoreMembers(chatId, env);
      break;

    case "storepoll":
      await cmdStorePoll(chatId, msg, env);
      break;

    case "trackack":
      await cmdTrackAck(chatId, msg, argsText, env);
      break;

    case "acklist":
      await cmdAckList(chatId, env);
      break;

    case "ackstatus":
      await cmdAckStatus(chatId, msg, env);
      break;

    case "enginepoll":
      await cmdEnginePoll(chatId, msg, env);
      break;

    default:
      break;
  }
}

function replyTo(env, msg, text) {
  return tg(env, "sendMessage", { chat_id: msg.chat.id, text, reply_to_message_id: msg.message_id });
}

// ------------------------------------------------------ activity & stats --

async function trackActivity(chatId, msg, env) {
  const userId = msg.from.id;
  const now = Date.now();
  const nowInfo = kyivNow(now);
  const state = await getState(env, chatId);

  const day = nowInfo.dateStr;
  state.stats = state.stats || {};
  state.stats[day] = state.stats[day] || {};
  const key = String(userId);
  state.stats[day][key] = (state.stats[day][key] || 0) + 1;
  state.names = state.names || {};
  state.names[key] = displayName(msg.from);

  // Richer per-message signal breakdown for "Аналіз активності" on the
  // dashboard — recorded going forward only, from whenever this update
  // first ran (stats2Since): Telegram's Bot API has no way to fetch a
  // chat's message history, so nothing before that date can ever be filled
  // in retroactively.
  state.stats2 = state.stats2 || {};
  if (!state.stats2Since) state.stats2Since = day;
  state.stats2[day] = state.stats2[day] || {};
  const rec = state.stats2[day][key] || { msgs: 0, photos: 0, videos: 0, docs: 0, replies: 0, success: 0, support: 0, chars: 0 };
  rec.msgs += 1;
  if (msg.photo) rec.photos += 1;
  if (msg.video) rec.videos += 1;
  if (msg.document) rec.docs += 1;
  if (msg.reply_to_message) rec.replies += 1;
  const activityText = msg.text || msg.caption || "";
  rec.chars += activityText.length;
  const isSuccess = textHasAny(activityText, SUCCESS_KEYWORDS);
  const isSupport = textHasAny(activityText, SUPPORT_KEYWORDS);
  if (isSuccess) rec.success += 1;
  if (isSupport) rec.support += 1;
  state.stats2[day][key] = rec;

  // Points: base per message + small bonuses for media and for
  // success/support signals — see POINTS above.
  let points = POINTS.message;
  if (msg.photo) points += POINTS.photo;
  if (msg.video) points += POINTS.video;
  if (msg.document) points += POINTS.document;
  if (isSuccess) points += POINTS.success;
  if (isSupport) points += POINTS.support;
  addPoints(state, msg.from, points);

  if (state.reportsTopic && msg.message_thread_id === state.reportsTopic.threadId) {
    const window = state.reportsWindow || DEFAULT_REPORTS_WINDOW;
    if (nowInfo.hhmm >= window.start && nowInfo.hhmm <= graceEnd(window)) {
      const stores = await getStoreCodes(env);
      const codes = resolveStoreCodes(msg, msg.text, stores, state);
      if (codes.length) {
        state.reports = state.reports || {};
        state.reports[day] = state.reports[day] || {};
        for (const c of codes) {
          if (!state.reports[day][c]) {
            state.reports[day][c] = true;
            addPoints(state, msg.from, POINTS.eveningReport);
          }
        }
      }
    }
  }

  // A morning photo report is normally confirmed by a caption on the photo
  // itself (trackPhotoReport, triggered separately on msg.photo). But real
  // managers often reply with just a text confirmation ("J027 sent above")
  // when the photo was already sent earlier in the thread — that message
  // has no photo of its own, so trackPhotoReport never sees it and the
  // store was silently left marked as missing. Handle that text-only case
  // here (guarded by !msg.photo so a photo message's own caption isn't
  // double-processed — trackPhotoReport already owns that path).
  if (state.photoReportsTopic && msg.message_thread_id === state.photoReportsTopic.threadId && !msg.photo) {
    const window = state.photoReportsWindow || DEFAULT_PHOTO_REPORTS_WINDOW;
    if (nowInfo.hhmm >= window.start && nowInfo.hhmm <= graceEnd(window)) {
      const stores = await getStoreCodes(env);
      const codes = resolveStoreCodes(msg, msg.text, stores, state);
      if (codes.length) {
        state.photoReports = state.photoReports || {};
        state.photoReports[day] = state.photoReports[day] || {};
        for (const c of codes) {
          if (!state.photoReports[day][c]) {
            state.photoReports[day][c] = true;
            addPoints(state, msg.from, POINTS.photoReport);
          }
        }
      }
    }
  }

  const admin = await isAdmin(env, chatId, userId);
  if (!admin) {
    state.flood = state.flood || {};
    const recent = (state.flood[key] || []).filter((t) => now - t < 10000);
    recent.push(now);
    state.flood[key] = recent;
    if (recent.length > 6) {
      state.flood[key] = [];
      await setState(env, chatId, state);
      const untilDate = Math.floor(Date.now() / 1000) + 5 * 60;
      await tg(env, "restrictChatMember", { chat_id: chatId, user_id: userId, until_date: untilDate, permissions: { can_send_messages: false } });
      await tg(env, "sendMessage", { chat_id: chatId, text: `🚦 ${displayName(msg.from)} надсилає повідомлення надто швидко — обмежений(а) на 5 хв.` });
      return;
    }
  }

  await setState(env, chatId, state);
}

async function sendStats(chatId, argsText, env) {
  const state = await getState(env, chatId);
  const days = argsText === "week" ? 7 : 1;
  const totals = {};
  const base = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const key = kyivNow(d.getTime()).dateStr;
    const dayStats = (state.stats && state.stats[key]) || {};
    for (const [uid, count] of Object.entries(dayStats)) totals[uid] = (totals[uid] || 0) + count;
  }
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!rows.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Ще немає даних для статистики." });
    return;
  }
  const lines = rows.map(([uid, count], i) => `${i + 1}. ${state.names?.[uid] || uid} — ${count}`);
  const label = argsText === "week" ? "за 7 днів" : "за сьогодні";
  await tg(env, "sendMessage", { chat_id: chatId, text: `📊 Активність у чаті ${label}:\n${lines.join("\n")}` });
}

async function sendRating(chatId, env) {
  const state = await getState(env, chatId);
  const points = state.points || {};
  const rows = Object.entries(points).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!rows.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Ще немає накопичених балів — рейтинг з'явиться після першої активності." });
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.map(([uid, pts], i) => {
    const level = getLevel(pts);
    const mark = medals[i] || `${i + 1}.`;
    return `${mark} ${state.names?.[uid] || uid} — ${pts} 🏅 ${level.emoji} ${level.name}`;
  });
  await tg(env, "sendMessage", { chat_id: chatId, text: `🏆 Рейтинг чату:\n${lines.join("\n")}\n\nПовний лідерборд — на сайті дашборду, вкладка «Telegram-бот».` });
}

// ---------------------------------------------------------------- admin --

async function isAdmin(env, chatId, userId) {
  const res = await tg(env, "getChatMember", { chat_id: chatId, user_id: userId });
  const status = res?.result?.status;
  return status === "creator" || status === "administrator";
}

// ------------------------------------------------------------- reminders --

function parseDays(token) {
  if (!token || token === "daily" || token === "щодня") return "daily";
  const map = { пн: "mon", вт: "tue", ср: "wed", чт: "thu", пт: "fri", сб: "sat", нд: "sun",
    mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun" };
  const days = token.split(",").map((s) => map[s.trim().toLowerCase()]).filter(Boolean);
  return days.length ? days : null;
}

function roundTo5(hh, mm) {
  const total = hh * 60 + mm;
  const rounded = Math.round(total / 5) * 5;
  const h = Math.floor((rounded % 1440) / 60);
  const m = rounded % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function cmdAddReminder(chatId, argsText, env) {
  const parts = argsText.trim().split(/\s+/);
  const timeStr = parts.shift();
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr || "");
  if (!m) return tg(env, "sendMessage", { chat_id: chatId, text: "Формат: /addreminder ГГ:ХХ daily текст\nабо: /addreminder ГГ:ХХ пн,ср,пт текст" });

  let days = "daily";
  if (parts[0] && (parseDays(parts[0]) || parts[0] === "daily")) {
    days = parseDays(parts[0]);
    parts.shift();
  }
  const text = parts.join(" ").trim();
  if (!text) return tg(env, "sendMessage", { chat_id: chatId, text: "Вкажіть текст нагадування після часу/днів." });

  const time = roundTo5(Number(m[1]), Number(m[2]));
  const state = await getState(env, chatId);
  state.reminders = state.reminders || [];
  const id = String(Date.now()).slice(-6);
  state.reminders.push({ id, time, days, text, lastSentDate: null });
  await setState(env, chatId, state);
  await addToChatsIndex(env, chatId);
  await tg(env, "sendMessage", { chat_id: chatId, text: `✅ Нагадування #${id} додано на ${time} (${days === "daily" ? "щодня" : days.join(",")}).` });
}

async function cmdListReminders(chatId, env) {
  const state = await getState(env, chatId);
  const list = state.reminders || [];
  if (!list.length) return tg(env, "sendMessage", { chat_id: chatId, text: "Нагадувань ще немає. Додати: /addreminder ГГ:ХХ daily текст" });
  const lines = list.map((r) => `#${r.id} · ${r.time} · ${r.days === "daily" ? "щодня" : r.days.join(",")} — ${r.text}`);
  await tg(env, "sendMessage", { chat_id: chatId, text: `🔔 Нагадування:\n${lines.join("\n")}` });
}

async function cmdDelReminder(chatId, argsText, env) {
  const id = argsText.trim();
  const state = await getState(env, chatId);
  const before = (state.reminders || []).length;
  state.reminders = (state.reminders || []).filter((r) => r.id !== id);
  await setState(env, chatId, state);
  const removed = before !== state.reminders.length;
  await tg(env, "sendMessage", { chat_id: chatId, text: removed ? `🗑 Нагадування #${id} видалено.` : `Нагадування #${id} не знайдено. Список: /reminders` });
}

async function cmdDigest(chatId, argsText, env) {
  const [action, timeStr] = argsText.trim().split(/\s+/);
  const state = await getState(env, chatId);
  state.digest = state.digest || { enabled: false, time: "08:00", lastSentDate: null };

  if (action === "on") {
    const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr || "");
    if (m) state.digest.time = roundTo5(Number(m[1]), Number(m[2]));
    state.digest.enabled = true;
    await setState(env, chatId, state);
    await addToChatsIndex(env, chatId);
    await tg(env, "sendMessage", { chat_id: chatId, text: `✅ Щоденний дайджест увімкнено на ${state.digest.time} (вакансії + активність керуючих).` });
  } else if (action === "off") {
    state.digest.enabled = false;
    await setState(env, chatId, state);
    await tg(env, "sendMessage", { chat_id: chatId, text: "Дайджест вимкнено." });
  } else {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: state.digest.enabled ? `Дайджест увімкнено на ${state.digest.time}.` : "Дайджест вимкнено. Увімкнути: /digest on ГГ:ХХ",
    });
  }
}

// ------------------------------------------------------------- congrats --
// When someone congratulates a colleague in the chat (birthday, promotion,
// anniversary, a win...), the bot joins in with its own short reply. Free —
// no external API: the occasion type is guessed from keywords in the
// triggering message, then a random phrase from that occasion's pool is
// picked (optionally naming whoever was @mentioned/reply-tagged).
// /congrats on|off toggles it per chat (default on).

async function cmdCongrats(chatId, argsText, env) {
  const state = await getState(env, chatId);
  const action = argsText.trim().toLowerCase();
  if (action === "on") {
    state.congratsEnabled = true;
    await setState(env, chatId, state);
    await tg(env, "sendMessage", { chat_id: chatId, text: "✅ Бот приєднуватиметься до привітань у чаті." });
  } else if (action === "off") {
    state.congratsEnabled = false;
    await setState(env, chatId, state);
    await tg(env, "sendMessage", { chat_id: chatId, text: "Приєднання до привітань вимкнено." });
  } else {
    const enabled = state.congratsEnabled !== false;
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: enabled ? "Приєднання до привітань увімкнено." : "Приєднання до привітань вимкнено. Увімкнути: /congrats on",
    });
  }
}

function detectCongratsCategory(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CONGRATS_CATEGORIES)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return null;
}

function extractCongratsName(msg) {
  for (const e of msg.entities || []) {
    if (e.type === "text_mention" && e.user) return displayName(e.user);
  }
  for (const e of msg.entities || []) {
    if (e.type === "mention") return msg.text.substr(e.offset, e.length);
  }
  return null;
}

function buildCongratsReply(msg) {
  const category = detectCongratsCategory(msg.text);
  if (!category) return null;
  const pool = CONGRATS_TEMPLATES[category];
  const template = pool[Math.floor(Math.random() * pool.length)];
  const name = extractCongratsName(msg);
  // Escaped: a real person's name can contain &, <, > — these templates now
  // use <b> tags (parse_mode: "HTML"), so an unescaped name could otherwise
  // break the markup or get silently mis-rendered by Telegram.
  const safeName = name ? escapeHtml(name) : "";
  return template.replace("{NAME}", safeName ? `, ${safeName}` : "");
}

async function maybeJoinCongrats(chatId, msg, env) {
  const replyText = buildCongratsReply(msg);
  if (!replyText) return;

  const state = await getState(env, chatId);
  if (state.congratsEnabled === false) return;

  // Track this congratulation message for the weekly digest's "чиє
  // привітання зібрало найбільше реакцій" — independent of the reply
  // cooldown below, so a congrats posted while the bot's own reply is on
  // cooldown is still counted. Reaction totals arrive later, if at all,
  // via message_reaction_count (see handleMessageReactionCount) — that
  // update type needs the bot's webhook re-registered with it included,
  // a one-time manual step (see README).
  const nowInfo = kyivNow(Date.now());
  state.congratsTracked = state.congratsTracked || {};
  state.congratsTracked[msg.message_id] = { userId: msg.from.id, name: displayName(msg.from), day: nowInfo.dateStr, reactions: 0 };

  const threadKey = String(msg.message_thread_id ?? "general");
  const now = Date.now();
  state.congrats = state.congrats || {};
  if (now - (state.congrats[threadKey] || 0) >= CONGRATS_COOLDOWN_MS) {
    await tg(env, "sendMessage", withThread({ chat_id: chatId, reply_to_message_id: msg.message_id, text: replyText, parse_mode: "HTML" }, msg.message_thread_id));
    state.congrats[threadKey] = now;
  }

  await setState(env, chatId, state);
}

// Reaction totals on tracked congrats messages (message_reaction_count —
// an aggregate update, no per-reactor identity, so no extra privacy
// exposure). Silently a no-op if the message wasn't one maybeJoinCongrats
// tracked (e.g. reactions on an unrelated message).
async function handleMessageReactionCount(mrc, env) {
  const chatId = mrc.chat.id;
  const state = await getState(env, chatId);
  const tracked = state.congratsTracked?.[mrc.message_id];
  if (!tracked) return;
  tracked.reactions = (mrc.reactions || []).reduce((sum, r) => sum + (r.total_count || 0), 0);
  await setState(env, chatId, state);
}

// Drops congratsTracked entries older than 14 days so this map — one
// entry per detected congrats message — doesn't grow forever.
function pruneCongratsTracked(state, now) {
  if (!state.congratsTracked) return;
  const cutoff = daysAgoStr(now.dateStr, 14);
  for (const [msgId, c] of Object.entries(state.congratsTracked)) {
    if (c.day < cutoff) delete state.congratsTracked[msgId];
  }
}

// ------------------------------------------------- acknowledgment tracking --
// "Тригери на реакції": an admin marks a message (e.g. an instruction) with
// /trackack, replying to it — from then on, ANY reaction from a chat
// member on that message is recorded as "ознайомлений(а)" (acknowledged).
// This is a general reaction-triggered primitive, not tied to one use case
// (state.trackedAcks) — the bot itself can key other future behavior off
// state.trackedAcks[...].reactedBy the same way. Requires update.
// message_reaction (per-user reaction changes) in the bot's webhook
// allowed_updates — a one-time manual step, same idea as
// message_reaction_count (see README).
const MAX_TRACKED_ACKS = 200; // oldest entries drop off past this, per chat

async function cmdTrackAck(chatId, msg, argsText, env) {
  if (!msg.reply_to_message) {
    return replyTo(env, msg, "Дайте цю команду відповіддю (reply) на повідомлення, яке треба відстежувати — напр. інструкцію чи оголошення. Приклад: /trackack Інструкція з відкриття зміни");
  }
  const target = msg.reply_to_message;
  const state = await getState(env, chatId);
  const nowInfo = kyivNow(Date.now());

  state.trackedAcks = state.trackedAcks || {};
  state.trackedAcks[target.message_id] = {
    label: argsText.trim() || (target.text || target.caption || "Повідомлення").slice(0, 80),
    createdBy: displayName(msg.from),
    createdAt: nowInfo.dateStr,
    reactedBy: {},
  };

  const keys = Object.keys(state.trackedAcks);
  if (keys.length > MAX_TRACKED_ACKS) {
    for (const k of keys.slice(0, keys.length - MAX_TRACKED_ACKS)) delete state.trackedAcks[k];
  }

  await setState(env, chatId, state);
  await replyTo(env, msg, "✅ Відстежую реакції на це повідомлення — будь-яка реакція від учасника зараховується як «ознайомлений(а)». Перевірити статус — /ackstatus (відповіддю на це саме повідомлення), список усіх — /acklist.");
}

async function cmdAckList(chatId, env) {
  const state = await getState(env, chatId);
  const entries = Object.entries(state.trackedAcks || {});
  if (!entries.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Ще немає повідомлень під відстеженням. Адмін може почати: /trackack (відповіддю на повідомлення)." });
    return;
  }
  const lines = entries
    .sort((a, b) => (b[1].createdAt || "").localeCompare(a[1].createdAt || ""))
    .map(([, t]) => `• ${t.label} — ознайомились ${Object.keys(t.reactedBy || {}).length} (${t.createdAt})`);
  await tg(env, "sendMessage", { chat_id: chatId, text: `📋 Повідомлення під відстеженням реакцій:\n${lines.join("\n")}` });
}

async function cmdAckStatus(chatId, msg, env) {
  if (!msg.reply_to_message) {
    await replyTo(env, msg, "Дайте цю команду відповіддю на відстежуване повідомлення (те, яке позначили командою /trackack).");
    return;
  }
  const state = await getState(env, chatId);
  const tracked = state.trackedAcks?.[msg.reply_to_message.message_id];
  if (!tracked) {
    await replyTo(env, msg, "Це повідомлення не під відстеженням. Почати — /trackack (відповіддю на нього).");
    return;
  }
  const reactedNames = Object.values(tracked.reactedBy || {});
  const reactedIds = new Set(Object.keys(tracked.reactedBy || {}));
  // "Ще не ознайомились" — лише приблизно: Telegram Bot API не дає повного
  // списку учасників чату, тож звіряємо з людьми, які хоч раз писали в чат
  // (state.names) — реальна картина може бути ширшою.
  const stillUnknown = Object.entries(state.names || {}).filter(([uid]) => !reactedIds.has(uid));
  const lines = [`📌 «${tracked.label}»`, `Позначив(ла): ${tracked.createdBy}, ${tracked.createdAt}`, ""];
  lines.push(reactedNames.length ? `✅ Ознайомились (${reactedNames.length}):\n${reactedNames.map((n) => `• ${n}`).join("\n")}` : "✅ Ознайомились: поки що ніхто.");
  if (stillUnknown.length) {
    lines.push("", `❔ З відомих учасників чату ще не поставили реакцію (${stillUnknown.length}):`, stillUnknown.map(([, n]) => `• ${n}`).join("\n"), "", "(це лише ті, хто хоч раз писав у чат — повний список учасників Telegram боту недоступний)");
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n") });
}

// Per-user reaction changes. Marks the reactor as having acknowledged a
// tracked message; once recorded it's never un-marked, even if they later
// remove the reaction (a person confirmed reading it — that shouldn't
// un-confirm it).
async function handleMessageReaction(mr, env) {
  if (!mr.user || mr.user.is_bot) return; // reactions from anonymous chat admins (actor_chat) aren't attributable to a person
  if (!mr.new_reaction || !mr.new_reaction.length) return; // reaction removed, not added — nothing to record

  const chatId = mr.chat.id;
  const state = await getState(env, chatId);
  const tracked = state.trackedAcks?.[mr.message_id];
  if (!tracked) return;

  tracked.reactedBy = tracked.reactedBy || {};
  if (tracked.reactedBy[String(mr.user.id)]) return; // already recorded, no write needed
  tracked.reactedBy[String(mr.user.id)] = displayName(mr.user);
  await setState(env, chatId, state);
}

// ------------------------------------------------------ morning greeting --
// A random pick from MORNING_MESSAGES, posted once a day at a set time into
// whichever topic the /morning command was issued in (General included —
// Telegram forum groups post to General by default when message_thread_id
// is omitted).

function withThread(params, threadId) {
  return threadId != null ? { ...params, message_thread_id: threadId } : params;
}

async function cmdMorning(chatId, msg, argsText, env) {
  const [action, timeStr] = argsText.trim().split(/\s+/);
  const state = await getState(env, chatId);
  state.morning = state.morning || { enabled: false, time: "10:00", threadId: null, lastSentDate: null };

  if (action === "on") {
    const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr || "");
    if (m) state.morning.time = roundTo5(Number(m[1]), Number(m[2]));
    state.morning.enabled = true;
    state.morning.threadId = msg.message_thread_id ?? null;
    await setState(env, chatId, state);
    await addToChatsIndex(env, chatId);
    await tg(env, "sendMessage", withThread({ chat_id: chatId, text: `✅ Щоранкове привітання увімкнено на ${state.morning.time}.` }, state.morning.threadId));
  } else if (action === "off") {
    state.morning.enabled = false;
    await setState(env, chatId, state);
    await tg(env, "sendMessage", { chat_id: chatId, text: "Щоранкове привітання вимкнено." });
  } else {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: state.morning.enabled
        ? `Щоранкове привітання увімкнено на ${state.morning.time}.`
        : "Щоранкове привітання вимкнено. Увімкнути: /morning on 10:00 (написати в потрібній темі або в General).",
    });
  }
}

// ---------------------------------------------------- monthly checklist --
// 1st–3rd of every month at 12:00 Kyiv time, in a bound "Завдання" topic:
// day 1 posts the checklist + a native Telegram poll listing every store
// code as an option; days 2–3 repost the poll with only the stores that
// still haven't picked their code, with a friendlier nudge each time.
// Confirmations are tracked per chat (state.monthlyChecklist.confirmed),
// keyed off poll option vote counts via handlePollUpdate() below — a
// store's option getting >=1 vote in ANY of that month's polls counts,
// even a late vote on an earlier (superseded) poll.

const CHECKLIST_ITEMS = [
  "Закриття таймплану — підтвердити години",
  "Замовлення SALVY (смаколики)",
  "Перевірити/замовити касову стрічку та термінальну стрічку",
  "Підшити касову документацію",
];
const CHECKLIST_NUMS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
const CHECKLIST_REMINDER_PHRASES = [
  "🔔 Дружнє нагадування",
  "🔔 Колеги, не забудьте",
  "🔔 Нагадуємо",
  "🔔 Ще раз нагадуємо, будь ласка",
];
const MONTH_NAMES_UA = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];

async function cmdSetTasksTopic(chatId, msg, env) {
  if (msg.message_thread_id == null) {
    await replyTo(env, msg, "Цю команду треба написати всередині потрібної теми форуму (напр. «Завдання»), а не в General.");
    return;
  }
  const state = await getState(env, chatId);
  state.tasksTopic = { threadId: msg.message_thread_id };
  await setState(env, chatId, state);
  await addToChatsIndex(env, chatId);
  await tg(env, "sendMessage", {
    chat_id: chatId,
    message_thread_id: msg.message_thread_id,
    text: "✅ Ця тема встановлена для щомісячного чекліста магазинів. 1, 2 і 3 числа о 12:00 бот сам надішле опитування.",
  });
}

// ----------------------------------------------------- activity digest ----
// Into the bound "Активності/Акції" topic: at 10:00 daily, a recap of
// *yesterday's* points (state.pointsByDay[yesterday]); at 17:00 daily, a
// snapshot of *today's* points so far (state.pointsByDay[today], 00:00 →
// now); and every Monday at 10:01, a summary of the past full week (see
// sendWeeklyDigest below). All of this reads state.pointsByDay, which is
// permanent and never resets — the cumulative totals used by /rating and
// the site (state.points) are a separate figure and untouched by any of
// this either way.

async function cmdSetActivityTopic(chatId, msg, env) {
  if (msg.message_thread_id == null) {
    await replyTo(env, msg, "Цю команду треба написати всередині потрібної теми форуму (напр. «Активності/Акції»), а не в General.");
    return;
  }
  const state = await getState(env, chatId);
  state.activityTopic = { threadId: msg.message_thread_id };
  await setState(env, chatId, state);
  await addToChatsIndex(env, chatId);
  await tg(env, "sendMessage", {
    chat_id: chatId,
    message_thread_id: msg.message_thread_id,
    text: "✅ Ця тема встановлена для статистики активності. О 10:00 бот надішле підсумок за вчора, о 17:00 — зріз за сьогодні (з короткою мотивацією), а щопонеділка о 10:01 — підсумки тижня (найактивніші, магазини за кількістю завдань, топ-привітання). Загальний рейтинг і рівні на сайті рахуються окремо й ніколи не скидаються.",
  });
}

async function cmdSetQuizTopic(chatId, msg, env) {
  if (msg.message_thread_id == null) {
    await replyTo(env, msg, "Цю команду треба написати всередині потрібної теми форуму (напр. «Змагання Конкурси»), а не в General.");
    return;
  }
  const state = await getState(env, chatId);
  state.quizTopic = { threadId: msg.message_thread_id };
  await setState(env, chatId, state);
  await addToChatsIndex(env, chatId);
  await tg(env, "sendMessage", {
    chat_id: chatId,
    message_thread_id: msg.message_thread_id,
    text: "✅ Ця тема встановлена для квізів. Просто надішліть сюди файл презентації (.pptx) — бот сам розпізнає слайди й опублікує тут короткий квіз (до 5 запитань). Правильна відповідь одразу видно у Telegram і додає +5 балів у загальний рейтинг.",
  });
}

// Today's bucket (00:00 → now), for the 17:00 snapshot.
function todaysPoints(state, now) {
  return sumPointsByDay(state, [now.dateStr]);
}

// Yesterday's bucket, for the 10:00 recap — {} if nobody was active
// yesterday (e.g. the bot had no activity at all, or just started).
function yesterdaysPoints(state, now) {
  return sumPointsByDay(state, [prevDateStr(now.dateStr)]);
}

const ACTIVITY_DIGEST_TOP_N = 10;

async function sendActivityDigest(chatId, env, state, label, motivation, pointsMap) {
  const all = Object.entries(pointsMap).filter(([, pts]) => pts > 0).sort((a, b) => b[1] - a[1]);
  const rows = all.slice(0, ACTIVITY_DIGEST_TOP_N);
  const threadId = state.activityTopic.threadId;

  if (!rows.length) {
    await tg(env, "sendMessage", withThread({ chat_id: chatId, text: `${label}\n\nАктивності поки не зафіксовано.\n\n${motivation}`, parse_mode: "HTML" }, threadId));
    return;
  }

  // No level/rank badge here on purpose: this digest ranks by a single
  // day's points, which is almost never enough to cross a level threshold
  // — showing "🌱 Новачок" next to literally everyone added noise, not
  // signal. The sort itself (by today's/yesterday's points, descending)
  // stays the real ranking. Cumulative levels still show on /rating and
  // the site, where enough points have actually accumulated to differ.
  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.map(([uid, pts], i) => {
    const mark = medals[i] || `${i + 1}.`;
    return `${mark} ${escapeHtml(state.names?.[uid] || uid)} — ${pts} балів`;
  });
  await tg(env, "sendMessage", withThread({ chat_id: chatId, text: `${label}\n\n${lines.join("\n")}\n\n${motivation}`, parse_mode: "HTML" }, threadId));
}

// --------------------------------------------------------- weekly digest --
// Every Monday at 10:01, into the same "Активності/Акції" topic: the past
// full week's (Mon–Sun) most active people, the stores that closed the
// most daily tasks (evening reports + morning photo reports), and — if
// reaction tracking is enabled (see handleMessageReactionCount above,
// requires a one-time webhook update — see README) — whose congrats
// message collected the most reactions.
async function sendWeeklyDigest(chatId, env, state, now) {
  const days = pastWeekDays(now.dateStr);
  const threadId = state.activityTopic.threadId;
  const medals = ["🥇", "🥈", "🥉"];
  const lines = ["📅 <b>Підсумки тижня</b>"];

  const totals = sumPointsByDay(state, days);
  const topPeople = Object.entries(totals).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  lines.push("");
  if (topPeople.length) {
    lines.push("🏆 Найактивніші учасники тижня:");
    topPeople.forEach(([uid, pts], i) => lines.push(`${medals[i] || i + 1} ${escapeHtml(state.names?.[uid] || uid)} — ${pts} балів`));
  } else {
    lines.push("🏆 Цього тижня активність ще не зафіксована.");
  }

  const storeCounts = {};
  for (const day of days) {
    const reported = (state.reports && state.reports[day]) || {};
    const photoed = (state.photoReports && state.photoReports[day]) || {};
    for (const code of Object.keys(reported)) if (reported[code]) storeCounts[code] = (storeCounts[code] || 0) + 1;
    for (const code of Object.keys(photoed)) if (photoed[code]) storeCounts[code] = (storeCounts[code] || 0) + 1;
  }
  const topStores = Object.entries(storeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  lines.push("");
  if (topStores.length) {
    lines.push("🏬 Магазини з найбільшою кількістю виконаних завдань (вечірні звіти + ранкові фотозвіти):");
    topStores.forEach(([code, cnt], i) => lines.push(`${medals[i] || i + 1} ${escapeHtml(code)} — ${cnt}`));
  } else {
    lines.push("🏬 Даних по звітах магазинів за цей тиждень немає.");
  }

  pruneCongratsTracked(state, now);
  const weekSet = new Set(days);
  const congratsThisWeek = Object.values(state.congratsTracked || {}).filter((c) => weekSet.has(c.day) && c.reactions > 0);
  congratsThisWeek.sort((a, b) => b.reactions - a.reactions);
  if (congratsThisWeek.length) {
    lines.push("");
    lines.push(`🎉 Найпопулярніше привітання тижня: ${escapeHtml(congratsThisWeek[0].name)} (${congratsThisWeek[0].reactions} реакцій)`);
  }

  lines.push("");
  lines.push(WEEKLY_MOTIVATION[Math.floor(Math.random() * WEEKLY_MOTIVATION.length)]);

  await tg(env, "sendMessage", withThread({ chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" }, threadId));
}

async function cmdChecklistStatus(chatId, env) {
  const state = await getState(env, chatId);
  const now = kyivNow(Date.now());
  const mc = state.monthlyChecklist;
  if (!mc || mc.cycleMonth !== now.month) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Цикл чекліста на цей місяць ще не запускався (стартує 1 числа о 12:00)." });
    return;
  }
  const stores = await getStoreCodes(env);
  const missing = stores.map((s) => s.code).filter((c) => !(mc.confirmed || {})[c]);
  const text = missing.length
    ? `📋 Чекліст ${now.month}: ще не підтвердили:\n${missing.map((c) => `• ${c}`).join("\n")}`
    : `✅ Чекліст ${now.month}: усі магазини підтвердили. 🙌`;
  await tg(env, "sendMessage", { chat_id: chatId, text });
}

async function processMonthlyChecklist(chatId, now, env, state) {
  const tt = state.tasksTopic;
  if (!tt) return false;
  if (now.hhmm !== (state.monthlyChecklist?.time || "12:00")) return false;
  if (now.dayOfMonth < 1 || now.dayOfMonth > 3) return false;

  state.monthlyChecklist = state.monthlyChecklist || {};
  const mc = state.monthlyChecklist;
  mc.time = mc.time || "12:00";
  if (mc.cycleMonth !== now.month) {
    mc.cycleMonth = now.month;
    mc.confirmed = {};
  }
  if (mc.lastRunDate === now.dateStr) return false; // already ran today
  mc.lastRunDate = now.dateStr;

  const stores = await getStoreCodes(env);
  const missing = stores.map((s) => s.code).filter((c) => !mc.confirmed[c]);

  if (missing.length === 0) {
    if (now.dayOfMonth > 1) {
      await tg(env, "sendMessage", withThread({ chat_id: chatId, text: "✅ Усі магазини підтвердили виконання щомісячного чекліста. Дякуємо, команда! 🙌" }, tt.threadId));
    }
    return true;
  }

  const [yy, mm] = now.month.split("-");
  const monthLabel = `${MONTH_NAMES_UA[Number(mm) - 1]} ${yy}`;
  let text;
  if (now.dayOfMonth === 1) {
    text = `🗓 <b>Щомісячний чекліст магазинів — ${monthLabel}</b>\n\nДо 3 числа кожен магазин має підтвердити виконання:\n${CHECKLIST_ITEMS.map((t, i) => `${CHECKLIST_NUMS[i]} ${t}`).join("\n")}\n\n👇 Оберіть номер свого магазину нижче, коли всі пункти виконано.`;
  } else {
    const urgency = now.dayOfMonth === 3 ? "⏰ Останній день!" : CHECKLIST_REMINDER_PHRASES[Math.floor(Math.random() * CHECKLIST_REMINDER_PHRASES.length)];
    text = `${urgency}\n\nЩе не підтвердили чекліст цього місяця:\n${missing.map((c) => `• ${c}`).join("\n")}\n\n👇 Оберіть свій магазин нижче.`;
  }
  await tg(env, "sendMessage", withThread({ chat_id: chatId, text, parse_mode: "HTML" }, tt.threadId));

  const pollRes = await tg(env, "sendPoll", withThread({
    chat_id: chatId,
    question: "Магазини — підтвердження чекліста",
    options: missing.map((c) => ({ text: c })),
    // Not anonymous: without this, Telegram never reveals who voted for
    // which option (update.poll only carries aggregate voter_count), so
    // there'd be no way to credit the specific person with points for
    // confirming their store — see handlePollAnswer below.
    is_anonymous: false,
    allows_multiple_answers: false,
  }, tt.threadId));

  const pollId = pollRes?.result?.poll?.id;
  if (pollId) await setPollIndex(env, pollId, { chatId, storeCodesByIndex: missing });

  return true;
}

async function handlePollUpdate(poll, env) {
  const idx = await getPollIndex(env);
  const info = idx[poll.id];
  if (!info) return;
  // Only the monthly-checklist poll wants this aggregate-vote-count path;
  // "storepick" and "quiz" polls are attributed per-voter in
  // handlePollAnswer below and would otherwise be misread as checklist
  // confirmations here (they share the same storeCodesByIndex shape).
  if (info.kind && info.kind !== "checklist") return;

  const state = await getState(env, info.chatId);
  state.monthlyChecklist = state.monthlyChecklist || {};
  state.monthlyChecklist.confirmed = state.monthlyChecklist.confirmed || {};
  let changed = false;
  (poll.options || []).forEach((opt, i) => {
    const code = info.storeCodesByIndex[i];
    if (code && opt.voter_count > 0 && !state.monthlyChecklist.confirmed[code]) {
      state.monthlyChecklist.confirmed[code] = true;
      changed = true;
    }
  });
  if (changed) await setState(env, info.chatId, state);
}

// Per-voter attribution for the monthly checklist poll (requires
// is_anonymous: false on the sendPoll call above) — this is the only place
// that knows *who* confirmed a store, so it's also the only place that can
// award POINTS.checklistConfirm to that specific person. handlePollUpdate
// above still runs too and keeps `confirmed` correct even if this update
// were ever missed, just without the points.
async function handlePollAnswer(pollAnswer, env) {
  const idx = await getPollIndex(env);
  const info = idx[pollAnswer.poll_id];
  if (!info) return;

  const optionIds = pollAnswer.option_ids || [];
  if (!optionIds.length) return; // vote retracted, nothing to award

  const user = pollAnswer.user;
  if (!user || user.is_bot) return;

  if (info.kind === "quiz") {
    await handleQuizPollAnswer(pollAnswer.poll_id, info, optionIds, user, env);
    return;
  }

  if (info.kind === "storepick") {
    const code = info.storeCodesByIndex[optionIds[0]];
    if (code) {
      const state = await getState(env, info.chatId);
      state.storeMembers = state.storeMembers || {};
      state.storeMembers[String(user.id)] = code;
      await setState(env, info.chatId, state);
    }
    return;
  }

  const state = await getState(env, info.chatId);
  state.monthlyChecklist = state.monthlyChecklist || {};
  state.monthlyChecklist.confirmed = state.monthlyChecklist.confirmed || {};
  let changed = false;
  for (const i of optionIds) {
    const code = info.storeCodesByIndex[i];
    if (code && !state.monthlyChecklist.confirmed[code]) {
      state.monthlyChecklist.confirmed[code] = true;
      addPoints(state, user, POINTS.checklistConfirm);
      changed = true;
    }
  }
  if (changed) await setState(env, info.chatId, state);
}

async function getPollIndex(env) {
  const raw = await firestoreGetRaw(env, BOT_COLLECTION, "poll-index");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function setPollIndex(env, pollId, info) {
  const idx = await getPollIndex(env);
  idx[pollId] = info;
  const keys = Object.keys(idx);
  if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete idx[k];
  await firestoreSetRaw(env, BOT_COLLECTION, "poll-index", JSON.stringify(idx));
}

// ------------------------------------------------------- quiz from slides --
// Free, local "quiz from a presentation" feature (no external AI/API — see
// README): drop a .pptx into the bound quiz topic and the bot pulls the
// title + bullet text straight out of the slide XML (a .pptx is just a ZIP
// of XML files) and turns them into a short native-Telegram quiz. Each
// question is mechanical — "which slide does this line belong to?" — so it
// needs no language understanding, only correctly-known title/bullet pairs.

const QUIZ_MAX_QUESTIONS = 5;
const QUIZ_MIN_USABLE_SLIDES = 2;

async function maybeGenerateQuizFromPresentation(chatId, msg, env) {
  const state = await getState(env, chatId);
  const qt = state.quizTopic;
  if (!qt || msg.message_thread_id !== qt.threadId) return; // not the quiz topic — ignore silently

  const doc = msg.document;
  const name = (doc.file_name || "").toLowerCase();
  if (!name.endsWith(".pptx")) {
    await replyTo(env, msg, "Поки що вмію робити квіз лише з файлів .pptx (PowerPoint). Завантажте презентацію саме в цьому форматі.");
    return;
  }
  if (doc.file_size && doc.file_size > 19 * 1024 * 1024) {
    await replyTo(env, msg, "Файл завеликий (>19 МБ) — Telegram-бот не може його завантажити. Спробуйте стиснути презентацію.");
    return;
  }

  const filePath = await tgGetFilePath(env, doc.file_id);
  const bytes = filePath ? await tgDownloadFileBytes(env, filePath) : null;
  if (!bytes) {
    await replyTo(env, msg, "Не вдалося завантажити файл із Telegram. Спробуйте ще раз.");
    return;
  }

  let slides;
  try {
    slides = await extractPptxSlides(bytes);
  } catch (err) {
    console.error("pptx parse error", err);
    await replyTo(env, msg, "Не вдалося розпакувати цю презентацію (можливо, нестандартний формат файлу).");
    return;
  }

  // Two quiz-generation paths, chosen automatically — no code change needed
  // to switch between them, just the presence of the secret:
  //   - env.ANTHROPIC_API_KEY set → ask Claude to read the actual slide text
  //     AND a few slide images, and write real comprehension questions
  //     ("what does status 41 mean") — see generateQuizWithClaude below.
  //   - not set (or the call fails for any reason) → the free mechanical
  //     fallback (buildQuizQuestions): "which slide does this text belong
  //     to?", built from title/bullet text alone, no external call.
  // This keeps the feature fully working today with zero setup, and
  // upgrades itself the moment the secret is added — see telegram-bot/README.md.
  let questions = null;
  if (env.ANTHROPIC_API_KEY) {
    try {
      const images = await extractSlideImages(bytes, slides);
      questions = await generateQuizWithClaude(env, slides, images);
    } catch (err) {
      console.error("Claude quiz generation failed, falling back to mechanical quiz", err);
    }
  }
  if (!questions || !questions.length) questions = buildQuizQuestions(slides);
  if (!questions.length) {
    await replyTo(env, msg, "У презентації замало тексту на слайдах, щоб скласти квіз (потрібно принаймні 2 слайди із заголовком і текстом).");
    return;
  }

  await tg(env, "sendMessage", withThread({
    chat_id: chatId,
    text: `🧠 <b>Квіз за презентацією «${escapeHtml(doc.file_name)}»</b>\n${questions.length} запитань — хто відповість швидко й правильно? 🏆`,
    parse_mode: "HTML",
  }, qt.threadId));

  for (const q of questions) {
    const res = await tg(env, "sendPoll", withThread({
      chat_id: chatId,
      question: q.question,
      options: q.options.map((text) => ({ text })),
      type: "quiz",
      correct_option_id: q.correctOptionId,
      is_anonymous: false, // required so poll_answer tells us who to credit
    }, qt.threadId));
    const pollId = res?.result?.poll?.id;
    if (pollId) await setPollIndex(env, pollId, { chatId, kind: "quiz", correctOptionId: q.correctOptionId, awardedUsers: [] });
  }
}

// ----------------------------------------------- AI quiz (Claude, optional) --
// Genuine comprehension questions ("what does status 41 mean"), not just
// "which slide does this belong to" — needs real understanding of the slide
// text and, where useful, the slide images (e.g. a screenshot of the exact
// system screen a slide is describing). That understanding is exactly what
// the mechanical extractor above cannot do, so this calls the Claude API
// directly over fetch() — raw HTTP, matching how the rest of this worker
// talks to Telegram/Firestore, since the project has no build step and no
// npm dependencies to add the official SDK through.
// Entirely optional: only runs when env.ANTHROPIC_API_KEY (a `wrangler
// secret put ANTHROPIC_API_KEY`) is set — see telegram-bot/README.md. Costs
// a small amount per presentation uploaded (a few cents at most; one call,
// not per question) — nothing is spent until that secret exists.
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-opus-5";
const QUIZ_AI_MAX_IMAGES = 8; // one photo per slide, at most this many — Claude itself is good at ignoring decorative ones
const QUIZ_AI_MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const QUIZ_AI_IMAGE_MEDIA_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

const QUIZ_AI_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          correctIndex: { type: "integer", minimum: 0, maximum: 3 },
        },
        required: ["question", "options", "correctIndex"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

// Chunked — a plain `String.fromCharCode(...bytes)` blows the call-stack
// argument limit on anything but a small image.
function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Pulls at most one photo per content slide (title + bullets), skipping
// decorative-only slides and anything not in a vision-supported format —
// screenshots of an actual system screen (see telegram-bot/README.md
// example) are exactly the kind of image worth spending a request on.
async function extractSlideImages(bytes, slides) {
  const entries = listZipEntries(bytes);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const usableNums = slides.filter((s) => s.title && s.bullets.length).map((s) => s.num).sort((a, b) => a - b);

  const picks = [];
  for (const num of usableNums) {
    if (picks.length >= QUIZ_AI_MAX_IMAGES) break;
    const relsEntry = byName.get(`ppt/slides/_rels/slide${num}.xml.rels`);
    if (!relsEntry) continue;
    const relsData = await readZipEntryData(bytes, relsEntry);
    if (!relsData) continue;
    const relsXml = new TextDecoder("utf-8").decode(relsData);
    const targets = [...relsXml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)].map((m) => m[1]);

    for (const fileName of targets) {
      const ext = (fileName.split(".").pop() || "").toLowerCase();
      const mediaType = QUIZ_AI_IMAGE_MEDIA_TYPES[ext];
      const mediaEntry = byName.get(`ppt/media/${fileName}`);
      if (!mediaType || !mediaEntry || mediaEntry.compSize > QUIZ_AI_MAX_IMAGE_BYTES) continue;
      const data = await readZipEntryData(bytes, mediaEntry);
      if (!data || data.length > QUIZ_AI_MAX_IMAGE_BYTES) continue;
      picks.push({ num, mediaType, base64: bytesToBase64(data) });
      break; // one image per slide is enough context, keeps the request bounded
    }
  }
  return picks;
}

async function generateQuizWithClaude(env, slides, images) {
  const usable = slides.filter((s) => s.title && s.bullets.length);
  const slideText = usable
    .map((s) => `Слайд ${s.num}: ${s.title}${s.bullets.length ? "\n" + s.bullets.join("\n") : ""}`)
    .join("\n\n");
  if (!slideText.trim()) return null;

  const content = [{ type: "text", text: `Текст презентації (по слайдах):\n\n${slideText}` }];
  for (const img of images) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  }
  content.push({
    type: "text",
    text:
      "Склади короткий квіз (5-8 запитань) щодо ЗМІСТУ цієї презентації для тренінгу магазинів " +
      "JYSK — реальні питання на розуміння (означення термінів, правильні дії, причини), а НЕ " +
      "\"на якому слайді згадано...\". Спирайся і на текст, і на фото (якщо на фото видно " +
      "конкретну інформацію — код, статус, цифру — онови питання саме про неї). Українською. " +
      "Кожне запитання не довше 290 символів, кожен варіант відповіди не довше 95 символів, " +
      "рівно 4 варіанти, лише один правильний. Пропускай суто декоративні/титульні слайди без " +
      "змістовного матеріалу.",
  });

  // A hard timeout so a slow/hung Claude response can't stall the whole
  // presentation upload — the caller already falls back to the free
  // mechanical quiz on any failure here, including an aborted fetch.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  let res;
  try {
    res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        output_config: { format: { type: "json_schema", schema: QUIZ_AI_SCHEMA } },
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    console.error("Claude API request failed or timed out", err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    console.error("Claude API error", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === "text");
  if (!block) return null;
  let parsed;
  try {
    parsed = JSON.parse(block.text);
  } catch (err) {
    console.error("Claude API: failed to parse JSON response", err, block.text);
    return null;
  }

  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  return questions
    .filter(
      (q) =>
        q &&
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex <= 3
    )
    .map((q) => ({
      question: truncateText(q.question, 290),
      options: q.options.map((o) => truncateText(String(o), 95)),
      correctOptionId: q.correctIndex,
    }));
}

// Awards POINTS.quizCorrect once per person per question — info.awardedUsers
// (persisted on the same poll-index entry) prevents double-crediting if
// Telegram resends the same poll_answer update, and never revokes points if
// someone changes their answer away from correct afterwards.
async function handleQuizPollAnswer(pollId, info, optionIds, user, env) {
  if (!optionIds.includes(info.correctOptionId)) return;
  const uid = String(user.id);
  info.awardedUsers = info.awardedUsers || [];
  if (info.awardedUsers.includes(uid)) return;
  info.awardedUsers.push(uid);
  await setPollIndex(env, pollId, info);

  const state = await getState(env, info.chatId);
  addPoints(state, user, POINTS.quizCorrect);
  await setState(env, info.chatId, state);
}

// A slide without its own short heading (a continuation of a list, say) has
// its whole first paragraph stand in as "title" — fine as a source of quiz
// content, but a poor multiple-choice answer at 90+ characters. Falling
// back to "Слайд N" keeps the game mechanic (match content to its slide)
// without an unwieldy answer option.
const QUIZ_LABEL_MAX_LEN = 60;
function slideLabel(slide) {
  return slide.title.length <= QUIZ_LABEL_MAX_LEN ? slide.title : `Слайд ${slide.num}`;
}

function buildQuizQuestions(slides) {
  const usable = slides
    .filter((s) => s.title && s.bullets.length)
    .map((s) => ({ ...s, label: slideLabel(s) }));
  const labels = [...new Set(usable.map((s) => s.label))];
  if (usable.length < QUIZ_MIN_USABLE_SLIDES || labels.length < 2) return [];

  const pool = shuffle(usable).slice(0, QUIZ_MAX_QUESTIONS);
  return pool.map((slide) => {
    const bullet = shuffle(slide.bullets)[0];
    const distractors = shuffle(labels.filter((t) => t !== slide.label)).slice(0, 3);
    const options = shuffle([slide.label, ...distractors]);
    return {
      question: truncateText(`❓ До якого слайду належить: "${bullet}"?`, 290),
      options: options.map((t) => truncateText(t, 95)),
      correctOptionId: options.indexOf(slide.label),
    };
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function truncateText(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function tgGetFilePath(env, fileId) {
  const data = await tg(env, "getFile", { file_id: fileId });
  return data?.result?.file_path || null;
}

async function tgDownloadFileBytes(env, filePath) {
  const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

// ---- minimal ZIP reader ----------------------------------------------------
// A .pptx is a plain ZIP archive. This pulls just the slide XML parts out of
// it — no external library (this worker has no build step / npm deps) — by
// reading the ZIP central directory by hand and inflating each slide with
// the runtime's own DecompressionStream (raw DEFLATE, same as ZIP uses).

const SLIDE_NAME_RE = /^ppt\/slides\/slide(\d+)\.xml$/;

function findEndOfCentralDirectory(bytes, view) {
  const sig = 0x06054b50;
  const maxBack = Math.min(bytes.length, 65557); // 22-byte EOCD + up to 65535-byte comment
  for (let i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--) {
    if (view.getUint32(i, true) === sig) return i;
  }
  return -1;
}

function listZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes, view);
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record)");

  const numEntries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < numEntries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break; // central directory file header sig
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    entries.push({ name, method, compSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipEntryData(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lo = entry.localHeaderOffset;
  if (view.getUint32(lo, true) !== 0x04034b50) return null; // local file header sig
  const nameLen = view.getUint16(lo + 26, true);
  const extraLen = view.getUint16(lo + 28, true);
  const dataStart = lo + 30 + nameLen + extraLen;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compSize);
  if (entry.method === 0) return compressed; // stored (no compression)
  if (entry.method === 8) {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return null; // unsupported compression method — skip this part
}

async function extractPptxSlides(bytes) {
  const entries = listZipEntries(bytes).filter((e) => SLIDE_NAME_RE.test(e.name));
  const slides = [];
  for (const entry of entries) {
    const num = Number(SLIDE_NAME_RE.exec(entry.name)[1]);
    const data = await readZipEntryData(bytes, entry);
    if (!data) continue;
    const xml = new TextDecoder("utf-8").decode(data);
    // Group text by paragraph (<a:p>), not by individual run (<a:r>) —
    // PowerPoint routinely splits one visual sentence across several runs
    // (a formatting change mid-word, a differently-colored first letter,
    // a language-check underline, ...), so reading run-by-run fragments
    // real sentences into unusable pieces (e.g. "П" + "ісля" → "ісля").
    // Joining every <a:t> inside the same paragraph reconstructs the line
    // as it was actually typed.
    const lines = xml.split("</a:p>")
      .map((para) => [...para.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1])).join(""))
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const [title, ...rest] = lines;
    slides.push({ num, title, bullets: rest.filter((t) => t.length >= 4) });
  }
  slides.sort((a, b) => a.num - b.num);
  return slides;
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

// ------------------------------------------------------ store membership --
// Links a Telegram user to a store code so reports still count when a
// message has no store code written in it — used as a fallback by
// resolveStoreCodes() for both the evening text reports and the morning
// photo reports.

async function cmdMyStore(chatId, msg, argsText, env) {
  const code = argsText.trim().toUpperCase();
  if (!code) return replyTo(env, msg, "Формат: /mystore J104");
  const stores = await getStoreCodes(env);
  const match = stores.find((s) => s.code.toUpperCase() === code);
  if (!match) return replyTo(env, msg, `Код магазину "${code}" не знайдено. Перевірте написання (напр. /mystore J104).`);
  const state = await getState(env, chatId);
  state.storeMembers = state.storeMembers || {};
  state.storeMembers[String(msg.from.id)] = match.code;
  await setState(env, chatId, state);
  await replyTo(env, msg, `✅ Записав: ${displayName(msg.from)} → магазин ${match.code}. Тепер ваші повідомлення в темах звітів зараховуються навіть без коду магазину в тексті.`);
}

async function cmdLinkStore(chatId, msg, argsText, env) {
  const target = msg.reply_to_message?.from;
  if (!target) return replyTo(env, msg, "Дайте команду відповіддю на повідомлення потрібного учасника. Приклад: /linkstore J104");
  const code = argsText.trim().toUpperCase();
  if (!code) return replyTo(env, msg, "Формат (відповіддю на повідомлення учасника): /linkstore J104");
  const stores = await getStoreCodes(env);
  const match = stores.find((s) => s.code.toUpperCase() === code);
  if (!match) return replyTo(env, msg, `Код магазину "${code}" не знайдено.`);
  const state = await getState(env, chatId);
  state.storeMembers = state.storeMembers || {};
  state.storeMembers[String(target.id)] = match.code;
  await setState(env, chatId, state);
  await tg(env, "sendMessage", { chat_id: chatId, text: `✅ ${displayName(target)} прив'язаний(а) до магазину ${match.code}.` });
}

async function cmdStoreMembers(chatId, env) {
  const state = await getState(env, chatId);
  const entries = Object.entries(state.storeMembers || {});
  if (!entries.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Ще нікого не прив'язано. /mystore J104 — прив'язати себе, /linkstore J104 (відповіддю) — прив'язати когось іншого." });
    return;
  }
  const lines = entries.map(([uid, code]) => `• ${state.names?.[uid] || uid} → ${code}`);
  await tg(env, "sendMessage", { chat_id: chatId, text: `👥 Прив'язки учасників до магазинів:\n${lines.join("\n")}` });
}

// Shared by /storepoll (typed by an admin) and the cron-triggered one-shot
// below (state.pendingStorePoll, set directly in Firestore when nobody's
// available to type the command): a non-anonymous poll (is_anonymous:
// false — required so poll_answer tells us who picked what, same reasoning
// as the monthly checklist poll above) with one option per store, posted
// into the chat's Activities topic (state.activityTopic) if one is bound,
// otherwise into `threadId` (whatever the caller passes, e.g. wherever the
// command itself was typed). Answering it fills state.storeMembers exactly
// like /mystore — needed so future automated messages (reports, digests,
// reminders) reach the right person without asking again.
async function sendStorePoll(chatId, env, state, threadId) {
  const stores = await getStoreCodes(env);
  if (!stores.length) return false;

  const effectiveThreadId = state.activityTopic?.threadId ?? threadId ?? null;

  await tg(env, "sendMessage", withThread({
    chat_id: chatId,
    text: "📋 <b>Оберіть, будь ласка, свій магазин</b>\n\nЦе потрібно для подальшої комунікації — щоб важливі повідомлення, звіти й нагадування точно доходили до потрібної людини. Займе 5 секунд 👇",
    parse_mode: "HTML",
  }, effectiveThreadId));

  const pollRes = await tg(env, "sendPoll", withThread({
    chat_id: chatId,
    question: "На якому магазині ви працюєте?",
    options: stores.map((s) => ({ text: s.name ? `${s.code} — ${s.name}` : s.code })),
    is_anonymous: false,
    allows_multiple_answers: false,
  }, effectiveThreadId));

  const pollId = pollRes?.result?.poll?.id;
  if (pollId) await setPollIndex(env, pollId, { chatId, kind: "storepick", storeCodesByIndex: stores.map((s) => s.code) });
  return true;
}

// /storepoll — admin-triggered one-off survey asking every employee to pick
// the store they work at.
async function cmdStorePoll(chatId, msg, env) {
  const state = await getState(env, chatId);
  const sent = await sendStorePoll(chatId, env, state, msg.message_thread_id ?? null);
  if (!sent) await replyTo(env, msg, "Список магазинів порожній — перевірте вкладку «Магазини» на дашборді.");
}

// ---------------------------------------------------- photo reports (AM) --
// Morning counterpart to the evening store reports below: watches one topic
// for photo messages whose caption names a store code (e.g. a negative-
// stock photo report), within a configurable window (default 08:00–12:00).
// At the end of the window, nudges whichever stores haven't sent one.

async function cmdSetPhotoReportsTopic(chatId, msg, env) {
  if (msg.message_thread_id == null) {
    await replyTo(env, msg, "Цю команду треба написати всередині потрібної теми форуму, а не в General.");
    return;
  }
  const state = await getState(env, chatId);
  state.photoReportsTopic = { threadId: msg.message_thread_id, lastCheckedDate: null };
  await setState(env, chatId, state);
  await addToChatsIndex(env, chatId);
  const window = state.photoReportsWindow || DEFAULT_PHOTO_REPORTS_WINDOW;
  await tg(env, "sendMessage", {
    chat_id: chatId,
    message_thread_id: msg.message_thread_id,
    text: `✅ Ця тема встановлена для ранкових фотозвітів по мінусових залишках. Вікно: ${window.start}–${window.end}. Змінити: /photoreportswindow ГГ:ХХ ГГ:ХХ`,
  });
}

async function cmdPhotoReportsWindow(chatId, argsText, env) {
  const [a, b] = argsText.trim().split(/\s+/);
  const ma = /^(\d{1,2}):(\d{2})$/.exec(a || "");
  const mb = /^(\d{1,2}):(\d{2})$/.exec(b || "");
  if (!ma || !mb) return tg(env, "sendMessage", { chat_id: chatId, text: "Формат: /photoreportswindow 08:00 10:00" });
  const state = await getState(env, chatId);
  state.photoReportsWindow = { start: roundTo5(Number(ma[1]), Number(ma[2])), end: roundTo5(Number(mb[1]), Number(mb[2])) };
  await setState(env, chatId, state);
  await tg(env, "sendMessage", { chat_id: chatId, text: `✅ Вікно фотозвітів: ${state.photoReportsWindow.start}–${state.photoReportsWindow.end}.` });
}

async function cmdPhotoReportStatus(chatId, msg, env) {
  const state = await getState(env, chatId);
  if (!state.photoReportsTopic) {
    await replyTo(env, msg, "Тема фотозвітів ще не налаштована. Зайдіть у потрібну тему й напишіть там /setphotoreportstopic.");
    return;
  }
  const now = kyivNow(Date.now());
  const window = state.photoReportsWindow || DEFAULT_PHOTO_REPORTS_WINDOW;
  const stores = await getStoreCodes(env);
  const reportedToday = (state.photoReports && state.photoReports[now.dateStr]) || {};
  const missing = stores.filter((s) => s.code && !reportedToday[s.code]);
  const text = missing.length
    ? `📸 Станом на ${now.hhmm} (вікно ${window.start}–${window.end}) ще не надіслали фото+коментар:\n${missing.map((s) => `• ${s.code}`).join("\n")}`
    : "✅ Усі магазини вже надіслали фото та коментарі сьогодні.";
  await tg(env, "sendMessage", { chat_id: chatId, message_thread_id: state.photoReportsTopic.threadId, text });
}

// If no photo-reports topic is bound yet, a photo whose caption is EXACTLY
// a known store code (nothing else — matches how these reports are
// actually written, e.g. "J035") is a strong enough signal to auto-bind
// that topic, no /setphotoreportstopic needed.
function isBareStoreCode(caption, stores) {
  if (!caption) return null;
  const trimmed = caption.trim();
  const match = stores.find((s) => s.code.toUpperCase() === trimmed.toUpperCase());
  return match ? match.code : null;
}

async function trackPhotoReport(chatId, msg, env) {
  const state = await getState(env, chatId);
  let pt = state.photoReportsTopic;

  if (!pt && msg.message_thread_id != null) {
    const stores = await getStoreCodes(env);
    const bareCode = isBareStoreCode(msg.caption, stores);
    if (bareCode) {
      pt = { threadId: msg.message_thread_id, lastCheckedDate: null };
      state.photoReportsTopic = pt;
      const window = state.photoReportsWindow || DEFAULT_PHOTO_REPORTS_WINDOW;
      await tg(env, "sendMessage", withThread({
        chat_id: chatId,
        text: `🔎 Автоматично визначив цю тему як тему фотозвітів по мінусових залишках. Вікно перевірки: ${window.start}–${window.end} (змінити: /photoreportswindow ГГ:ХХ ГГ:ХХ).`,
      }, msg.message_thread_id));
    }
  }

  if (!pt || msg.message_thread_id !== pt.threadId) return;

  const now = kyivNow(Date.now());
  const window = state.photoReportsWindow || DEFAULT_PHOTO_REPORTS_WINDOW;
  if (now.hhmm < window.start || now.hhmm > graceEnd(window)) return;

  const stores = await getStoreCodes(env);
  const codes = resolveStoreCodes(msg, msg.caption, stores, state);
  if (!codes.length) return;

  state.photoReports = state.photoReports || {};
  state.photoReports[now.dateStr] = state.photoReports[now.dateStr] || {};
  for (const c of codes) {
    if (!state.photoReports[now.dateStr][c]) {
      state.photoReports[now.dateStr][c] = true;
      addPoints(state, msg.from, POINTS.photoReport);
    }
  }
  await setState(env, chatId, state); // always persist — resolveStoreCodes may have just learned a storeMembers mapping too
}

// -------------------------------------------------------- store reports --
// Watches one forum topic (e.g. "Звіти/показники") for daily manager
// reports. A report is recognized by the store code appearing anywhere in
// the message text (matched against ../index.html's staffing-stores list),
// and only counts if posted inside the configured time window. At the end
// of the window the cron job (processChatSchedule) reports who's missing.

async function cmdSetReportsTopic(chatId, msg, env) {
  if (msg.message_thread_id == null) {
    await replyTo(env, msg, "Цю команду треба написати всередині потрібної теми форуму (напр. «Звіти/показники»), а не в General.");
    return;
  }
  const state = await getState(env, chatId);
  state.reportsTopic = { threadId: msg.message_thread_id, lastCheckedDate: null };
  await setState(env, chatId, state);
  await addToChatsIndex(env, chatId);
  const window = state.reportsWindow || DEFAULT_REPORTS_WINDOW;
  await tg(env, "sendMessage", {
    chat_id: chatId,
    message_thread_id: msg.message_thread_id,
    text: `✅ Ця тема встановлена як тема звітів. Вікно перевірки: ${window.start}–${window.end}. Змінити: /reportswindow ГГ:ХХ ГГ:ХХ`,
  });
}

async function cmdReportsWindow(chatId, argsText, env) {
  const [a, b] = argsText.trim().split(/\s+/);
  const ma = /^(\d{1,2}):(\d{2})$/.exec(a || "");
  const mb = /^(\d{1,2}):(\d{2})$/.exec(b || "");
  if (!ma || !mb) return tg(env, "sendMessage", { chat_id: chatId, text: "Формат: /reportswindow 17:00 23:00" });
  const state = await getState(env, chatId);
  state.reportsWindow = { start: roundTo5(Number(ma[1]), Number(ma[2])), end: roundTo5(Number(mb[1]), Number(mb[2])) };
  await setState(env, chatId, state);
  await tg(env, "sendMessage", { chat_id: chatId, text: `✅ Вікно звітів: ${state.reportsWindow.start}–${state.reportsWindow.end}.` });
}

async function cmdReportStatus(chatId, msg, env) {
  const state = await getState(env, chatId);
  if (!state.reportsTopic) {
    await replyTo(env, msg, "Тема звітів ще не налаштована. Зайдіть у потрібну тему форуму й напишіть там /setreportstopic.");
    return;
  }
  const now = kyivNow(Date.now());
  const window = state.reportsWindow || DEFAULT_REPORTS_WINDOW;
  const stores = await getStoreCodes(env);
  const reportedToday = (state.reports && state.reports[now.dateStr]) || {};
  const missing = stores.filter((s) => s.code && !reportedToday[s.code]);
  const text = missing.length
    ? `📋 Станом на ${now.hhmm} ще чекаємо на звіт від:\n${missing.map((s) => `• ${s.code}`).join("\n")}\n\nЩе є час — встигніть надіслати показники до ${window.end} 👍`
    : "✅ Усі магазини вже відзвітували сьогодні. Дякуємо! 🙌";
  await tg(env, "sendMessage", { chat_id: chatId, message_thread_id: state.reportsTopic.threadId, text });
}

async function cmdStreaks(chatId, env) {
  const state = await getState(env, chatId);
  const section = (streaks, label) => {
    const entries = Object.entries(streaks || {}).filter(([, r]) => r.current > 0).sort((a, b) => b[1].current - a[1].current);
    if (!entries.length) return null;
    return `${label}:\n${entries.map(([code, r]) => `• ${escapeHtml(code)} — 🔥 ${r.current} дн. поспіль (рекорд: ${r.best})`).join("\n")}`;
  };
  const sections = [section(state.reportStreaks, "📋 Вечірні звіти"), section(state.photoStreaks, "📸 Фотозвіти мінусових залишків")].filter(Boolean);
  if (!sections.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Поки що жодних активних стріків — почніть відзвітувати вчасно, і рахунок піде! 🔥" });
    return;
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: `🔥 <b>Стріки магазинів</b>\n\n${sections.join("\n\n")}`, parse_mode: "HTML" });
}

async function getStoreCodes(env) {
  const stores = (await loadDashboardDoc(env, "staffing-stores")) || [];
  return stores.filter((s) => s.code).map((s) => ({ code: s.code, name: s.name || null }));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectStoreCodes(text, stores) {
  if (!text) return [];
  const found = [];
  for (const s of stores) {
    const re = new RegExp(`\\b${escapeRegExp(s.code)}\\b`, "i");
    if (re.test(text)) found.push(s.code);
  }
  return found;
}

// Prefer a store code written in the message; if none is found, fall back
// to who sent it — /mystore / /linkstore build that person→store mapping
// manually, but most of the time nobody needs to run either: the first
// time someone writes an unambiguous store code, we learn it for them
// automatically, so every report after that counts even without a code.
function resolveStoreCodes(msg, text, stores, state) {
  const fromText = detectStoreCodes(text, stores);
  if (fromText.length) {
    if (fromText.length === 1 && msg.from) {
      state.storeMembers = state.storeMembers || {};
      state.storeMembers[String(msg.from.id)] = fromText[0];
    }
    return fromText;
  }
  const mapped = state.storeMembers && msg.from && state.storeMembers[String(msg.from.id)];
  return mapped ? [mapped] : [];
}

// ------------------------------------------------------- dashboard data --

async function loadDashboardDoc(env, key) {
  const data = await firestoreGetRaw(env, DASHBOARD_COLLECTION, key);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

async function sendVacancyReport(chatId, env) {
  const vacancies = (await loadDashboardDoc(env, "vacancies")) || [];
  const today = kyivNow(Date.now()).dateStr;
  const open = vacancies.filter((v) => (v.hireStatus || "open") === "open");
  const overdue = open
    .map((v) => ({ v, daysOpen: daysBetween(v.openedDate, today) }))
    .filter((x) => x.daysOpen != null && x.daysOpen > OVERDUE_DAYS)
    .sort((a, b) => b.daysOpen - a.daysOpen);

  if (!vacancies.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "У дашборді ще немає жодної вакансії." });
    return;
  }

  const lines = [`📋 Вакансії: відкрито ${open.length}, прострочено (>${OVERDUE_DAYS} дн.) ${overdue.length}`];
  if (overdue.length) {
    lines.push("");
    lines.push("Прострочені:");
    for (const { v, daysOpen } of overdue.slice(0, 15)) {
      const who = v.responsiblePerson ? `, відп.: ${v.responsiblePerson}` : "";
      const pr = v.priority ? `, пріоритет ${v.priority}` : "";
      lines.push(`• ${v.storeCode} — ${v.position || "посада не вказана"} — ${daysOpen} дн.${who}${pr}`);
    }
    if (overdue.length > 15) lines.push(`…і ще ${overdue.length - 15}.`);
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n") });
}

async function sendActivityReport(chatId, env) {
  const users = (await loadDashboardDoc(env, "users")) || [];
  const loginLog = (await loadDashboardDoc(env, "login-log")) || [];
  const now = Date.now();
  const in7d = (iso) => now - new Date(iso).getTime() <= SILENT_DAYS * 86400000;
  const managerEvents = loginLog.filter((e) => !e.isAdmin);

  const perUser = users.map((u) => {
    const events = managerEvents.filter((e) => e.userId === u.id).sort((a, b) => new Date(b.at) - new Date(a.at));
    const last = events[0] || null;
    return { user: u, total: events.length, last7: events.filter((e) => in7d(e.at)).length, lastAt: last ? last.at : null };
  });

  const never = perUser.filter((p) => p.total === 0);
  const silent = perUser.filter((p) => p.total > 0 && p.last7 === 0);

  if (!never.length && !silent.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: `✅ Усі керуючі заходили на сайт за останні ${SILENT_DAYS} днів.` });
    return;
  }

  const lines = [`👤 Керуючі без активності (ціль: заходити не рідше ніж раз на ${SILENT_DAYS} днів)`];
  if (silent.length) {
    lines.push("", `Мовчать >${SILENT_DAYS} днів:`);
    for (const p of silent) {
      const daysAgoN = Math.floor((now - new Date(p.lastAt).getTime()) / 86400000);
      lines.push(`• ${p.user.name || p.user.store} (${p.user.store}) — востаннє ${daysAgoN} дн. тому`);
    }
  }
  if (never.length) {
    lines.push("", "Ще жодного входу:");
    for (const p of never) lines.push(`• ${p.user.name || p.user.store} (${p.user.store})`);
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n") });
}

// -------------------------------------------------------------- cron job --

async function runScheduled(event, env) {
  try {
    const now = kyivNow(event.scheduledTime);
    const chatIds = await getChatsIndex(env);
    for (const chatId of chatIds) {
      await processChatSchedule(chatId, now, env);
    }
  } catch (err) {
    console.error("runScheduled error", err);
  }
}

async function processChatSchedule(chatId, now, env) {
  const state = await getState(env, chatId);
  let changed = false;

  for (const r of state.reminders || []) {
    if (r.lastSentDate === now.dateStr) continue;
    if (r.time !== now.hhmm) continue;
    if (r.days !== "daily" && !r.days.includes(now.day)) continue;
    await tg(env, "sendMessage", { chat_id: chatId, text: `🔔 ${r.text}` });
    r.lastSentDate = now.dateStr;
    changed = true;
  }

  if (state.morning?.enabled && state.morning.time === now.hhmm && state.morning.lastSentDate !== now.dateStr) {
    const text = MORNING_MESSAGES[Math.floor(Math.random() * MORNING_MESSAGES.length)];
    await tg(env, "sendMessage", withThread({ chat_id: chatId, text, parse_mode: "HTML" }, state.morning.threadId));
    state.morning.lastSentDate = now.dateStr;
    changed = true;
  }

  if (state.birthdayGreeting?.enabled && state.birthdayGreeting.time === now.hhmm && state.birthdayGreeting.lastSentDate !== now.dateStr) {
    await sendBirthdayGreetings(chatId, env, state, now);
    state.birthdayGreeting.lastSentDate = now.dateStr;
    changed = true;
  }

  // One-shot trigger for /storepoll when nobody's available to type the
  // command in Telegram — set state.pendingStorePoll: true directly in
  // Firestore and the next cron tick (within 5 min) sends it, then clears
  // the flag so it never fires twice.
  if (state.pendingStorePoll) {
    await sendStorePoll(chatId, env, state, null);
    state.pendingStorePoll = false;
    changed = true;
  }

  if (state.digest?.enabled && state.digest.time === now.hhmm && state.digest.lastSentDate !== now.dateStr) {
    await sendVacancyReport(chatId, env);
    await sendActivityReport(chatId, env);
    state.digest.lastSentDate = now.dateStr;
    changed = true;
  }

  if (state.reportsTopic) {
    const window = state.reportsWindow || DEFAULT_REPORTS_WINDOW;
    if (graceEnd(window) === now.hhmm && state.reportsTopic.lastCheckedDate !== now.dateStr) {
      const stores = await getStoreCodes(env);
      const reportedToday = (state.reports && state.reports[now.dateStr]) || {};
      const missing = stores.filter((s) => s.code && !reportedToday[s.code]);
      state.reportStreaks = updateStreaks(state.reportStreaks, stores, reportedToday);
      const text = (missing.length
        ? `⏰ ${now.hhmm} — вікно звітів закрито.\nЩе не бачимо сьогоднішніх показників від:\n${missing.map((s) => `• ${s.code}`).join("\n")}\n\nБудь ласка, надішліть показники якнайшвидше — кожен звіт наближає дістрикт до цілі 💪`
        : `✅ Усі магазини дістрикту відзвітували сьогодні до ${now.hhmm}. Чудова дисципліна, команда! 🙌`) + topStreaksLine(state.reportStreaks);
      await tg(env, "sendMessage", { chat_id: chatId, message_thread_id: state.reportsTopic.threadId, text });
      state.reportsTopic.lastCheckedDate = now.dateStr;
      changed = true;
    }
  }

  if (state.photoReportsTopic) {
    const window = state.photoReportsWindow || DEFAULT_PHOTO_REPORTS_WINDOW;
    if (graceEnd(window) === now.hhmm && state.photoReportsTopic.lastCheckedDate !== now.dateStr) {
      const stores = await getStoreCodes(env);
      const reportedToday = (state.photoReports && state.photoReports[now.dateStr]) || {};
      const missing = stores.filter((s) => s.code && !reportedToday[s.code]);
      state.photoStreaks = updateStreaks(state.photoStreaks, stores, reportedToday);
      const text = (missing.length
        ? `📸 Станом на ${now.hhmm}: ще не надіслали фото + коментар по мінусових залишках:\n${missing.map((s) => `• ${s.code}`).join("\n")}\n\nБудь ласка, опрацюйте мінусові залишки і пропишіть коментарі якнайшвидше 🙏`
        : `✅ Усі магазини надіслали фото та коментарі по мінусових залишках сьогодні до ${now.hhmm}. Дякуємо! 🙌`) + topStreaksLine(state.photoStreaks);
      await tg(env, "sendMessage", { chat_id: chatId, message_thread_id: state.photoReportsTopic.threadId, text });
      state.photoReportsTopic.lastCheckedDate = now.dateStr;
      changed = true;
    }
  }

  if (state.activityTopic) {
    state.activityDigest = state.activityDigest || {};
    if (now.hhmm === "10:00" && state.activityDigest.lastSent10 !== now.dateStr) {
      const motivation = ACTIVITY_MOTIVATION_MORNING[Math.floor(Math.random() * ACTIVITY_MOTIVATION_MORNING.length)];
      await sendActivityDigest(chatId, env, state, "🌅 ТОП 10 активності за вчора", motivation, yesterdaysPoints(state, now));
      state.activityDigest.lastSent10 = now.dateStr;
      changed = true;
    }
    if (now.hhmm === "17:00" && state.activityDigest.lastSent17 !== now.dateStr) {
      const motivation = ACTIVITY_MOTIVATION_EVENING[Math.floor(Math.random() * ACTIVITY_MOTIVATION_EVENING.length)];
      await sendActivityDigest(chatId, env, state, "🌇 ТОП 10 активності сьогодні — зріз на 17:00", motivation, todaysPoints(state, now));
      state.activityDigest.lastSent17 = now.dateStr;
      changed = true;
    }
    if (now.day === "mon" && now.hhmm === "10:01" && state.activityDigest.lastSentWeekly !== now.dateStr) {
      await sendWeeklyDigest(chatId, env, state, now);
      state.activityDigest.lastSentWeekly = now.dateStr;
      changed = true;
    }
  }

  if (await processMonthlyChecklist(chatId, now, env, state)) changed = true;

  if (changed) await setState(env, chatId, state);
}

function kyivNow(ts) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((p) => [p.type, p.value]));
  const dayMap = { Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun" };
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: `${parts.hour}:${parts.minute}`,
    day: dayMap[parts.weekday] || "mon",
    dayOfMonth: Number(parts.day),
    month: `${parts.year}-${parts.month}`,
  };
}

// --------------------------------------------------------- Telegram API --

async function tg(env, method, params) {
  const res = await fetch(`${TELEGRAM_API}${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) console.error("Telegram API error", method, data);
  return data;
}

// ------------------------------------------------------------- Firestore --
// Same free Firebase project as ../index.html, REST API, no auth needed
// (see firestore.rules — `telegram-bot/{doc}` is opened for this bot the
// same way `kyiv1/{doc}` already is for the dashboard).

async function firestoreGetRaw(env, collection, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("Firestore get failed", collection, docId, res.status);
    return null;
  }
  const data = await res.json();
  return data.fields?.value?.stringValue ?? null;
}

async function firestoreSetRaw(env, collection, docId, rawString) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}?updateMask.fieldPaths=value`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { value: { stringValue: rawString } } }),
  });
  if (!res.ok) console.error("Firestore set failed", collection, docId, res.status);
}

async function getState(env, chatId) {
  const raw = await firestoreGetRaw(env, BOT_COLLECTION, `chat-${chatId}`);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function setState(env, chatId, state) {
  await firestoreSetRaw(env, BOT_COLLECTION, `chat-${chatId}`, JSON.stringify(state));
}

async function getChatsIndex(env) {
  const raw = await firestoreGetRaw(env, BOT_COLLECTION, "chats-index");
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function addToChatsIndex(env, chatId) {
  const list = await getChatsIndex(env);
  if (!list.includes(chatId)) {
    list.push(chatId);
    await firestoreSetRaw(env, BOT_COLLECTION, "chats-index", JSON.stringify(list));
  }
}

// Keeps the real Telegram group name in sync (shown in the dashboard's
// Telegram-бот tab) — a plain read most of the time, only writes when the
// title actually changed (first sync, or the group got renamed).
async function syncChatTitle(chatId, title, env) {
  const state = await getState(env, chatId);
  if (state.chatTitle === title) return;
  state.chatTitle = title;
  await setState(env, chatId, state);
}
