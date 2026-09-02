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

const MORNING_MESSAGES = [
  "☀️ Доброго ранку, команда Kyiv-1! Новий день — нові можливості показати клас у сервісі. Гарного дня та легких продажів! 💪",
  "🌅 Ранок починається з посмішки! Нехай сьогодні кожен покупець піде задоволеним, а команда — гордою за результат. Вперед! 🚀",
  "☕ Доброго ранку! Дякуємо, що щодня робите Kyiv-1 кращим дістриктом. Хай сьогоднішній день принесе класні продажі й гарний настрій усій команді! ✨",
  "🌞 Прокидаємось і сяємо! Сьогодні новий шанс перевершити вчорашній результат. Гарного дня, колеги! 🙌",
  "💪 Доброго ранку, команда! Кожен покупець — це можливість показати сервіс на найвищому рівні. Успішного дня всім магазинам! 🔥",
  "🌅 Новий день — новий рахунок з нуля. Вірю у кожного з вас! Гарного настрою та високих продажів сьогодні! ☀️",
  "☀️ Ранкова мотивація: маленькі перемоги щодня складаються у великий успіх дістрикту. Гарного дня, команда Kyiv-1! 💪",
  "🙌 Доброго ранку! Хай сьогодні все складеться легко — і з покупцями, і з планами. Ми одна команда, і ми крутезні! 🚀",
  "🌞 Новий ранок — новий заряд енергії! Дякую кожному з вас за працю щодня. Успіхів і гарного настрою на весь день! ✨",
  "☕ Доброго ранку! Нехай сьогодні буде більше усмішок, ніж проблем, і більше продажів, ніж очікувалось 😉 Гарного дня всім!",
  "🔥 Ранок — час діяти! Сьогодні у кожного магазину є шанс стати найкращим. Вперед, команда Kyiv-1! 💪",
  "🌅 Доброго ранку! Ваша робота щодня робить різницю для покупців. Дякую й гарного продуктивного дня! 🙏",
  "☀️ Новий день починається з вас! Гарного настрою, енергії та впевненості на цілий день, команда! 🚀",
  "🙌 Доброго ранку, колеги! Хай сьогодні всі цілі будуть досяжними, а покупці — задоволеними. Успішного дня всій команді Kyiv-1! ✨",
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
    "🎉 Із днем народження{NAME}! Хай рік буде яскравим і успішним! 🎂",
    "🥳 І ми вітаємо{NAME}! Нехай усе задумане здійсниться цього року! 🎁",
    "🎂 Приєднуємось до теплих слів{NAME}! Гарного настрою й тільки добрих новин! 🥳",
    "🎈 З днем народження{NAME}! Хай мрії збуваються, а дні будуть щасливими! 🎉",
  ],
  promotion: [
    "🚀 Вітаємо{NAME} з підвищенням! Заслужений результат — так тримати! 💪",
    "🎉 Чудова новина{NAME}! Вітаємо з новою посадою й бажаємо успіху на новому рівні! 🚀",
    "👏 Вітаємо{NAME}! Праця не залишилась непоміченою — вперед до нових цілей! 🔥",
  ],
  anniversary: [
    "🎊 Вітаємо{NAME} з ювілеєм! Дякуємо за внесок у нашу команду! 🙌",
    "🎉 Особлива дата{NAME}! Вітаємо й бажаємо ще багато таких вагомих подій! 🎊",
  ],
  victory: [
    "🏆 Вітаємо з перемогою{NAME}! Заслужений результат — пишаємось! 🔥",
    "🎉 Оце так результат{NAME}! Вітаємо і бажаємо тримати цей темп! 🚀",
    "👏 Вітаємо{NAME}! Класна робота — так тримати! 💪",
  ],
  generic: [
    "🙌 Приєднуємось до привітань{NAME}! Хай усе буде якнайкраще! ✨",
    "🎉 І ми вітаємо{NAME}! Гарного настрою й тільки приємних новин! 😊",
    "👏 Вітаємо{NAME}! Раді за вас! 🙌",
  ],
};
const CONGRATS_COOLDOWN_MS = 2 * 60 * 60 * 1000; // don't re-join the same thread's celebration more than once per 2h

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

Звіти магазинів (у темі форуму, адміни чату):
/setreportstopic — прив'язати ПОТОЧНУ тему (написати команду всередині неї) як тему звітів
/reportswindow ГГ:ХХ ГГ:ХХ — вікно перевірки (типово 17:00–23:00)
/reportstatus — хто ще не звітував станом на зараз
О кінці вікна (типово 23:00) бот сам напише в цій темі, які магазини не надіслали звіт (розпізнає код магазину на початку повідомлення).`;

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

  if (Array.isArray(msg.new_chat_members) && msg.new_chat_members.length) {
    await handleNewMembers(chatId, msg.new_chat_members, env);
  }

  if (msg.text && msg.text.startsWith("/")) {
    await handleCommand(msg, env);
    return;
  }

  if (msg.from && !msg.from.is_bot && msg.text) {
    await trackActivity(chatId, msg, env);
    await maybeJoinCongrats(chatId, msg, env);
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

function displayName(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name || (user.username ? `@${user.username}` : "колего");
}

// --------------------------------------------------------------- commands --

const ADMIN_ONLY_COMMANDS = new Set([
  "ban", "unban", "kick", "mute", "unmute", "warn", "unwarn",
  "pin", "unpin", "del", "setrules", "addreminder", "delreminder", "digest",
  "setreportstopic", "reportswindow", "morning", "congrats",
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

    case "congrats":
      await cmdCongrats(chatId, argsText, env);
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

  if (state.reportsTopic && msg.message_thread_id === state.reportsTopic.threadId) {
    const window = state.reportsWindow || DEFAULT_REPORTS_WINDOW;
    if (nowInfo.hhmm >= window.start && nowInfo.hhmm <= window.end) {
      const stores = await getStoreCodes(env);
      const codes = detectStoreCodes(msg.text, stores);
      if (codes.length) {
        state.reports = state.reports || {};
        state.reports[day] = state.reports[day] || {};
        for (const c of codes) state.reports[day][c] = true;
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
  return template.replace("{NAME}", name ? `, ${name}` : "");
}

async function maybeJoinCongrats(chatId, msg, env) {
  const replyText = buildCongratsReply(msg);
  if (!replyText) return;

  const state = await getState(env, chatId);
  if (state.congratsEnabled === false) return;

  const threadKey = String(msg.message_thread_id ?? "general");
  const now = Date.now();
  state.congrats = state.congrats || {};
  if (now - (state.congrats[threadKey] || 0) < CONGRATS_COOLDOWN_MS) return;

  await tg(env, "sendMessage", withThread({ chat_id: chatId, reply_to_message_id: msg.message_id, text: replyText }, msg.message_thread_id));

  state.congrats[threadKey] = now;
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

async function getStoreCodes(env) {
  const stores = (await loadDashboardDoc(env, "staffing-stores")) || [];
  return stores.filter((s) => s.code).map((s) => ({ code: s.code }));
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
    await tg(env, "sendMessage", withThread({ chat_id: chatId, text }, state.morning.threadId));
    state.morning.lastSentDate = now.dateStr;
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
    if (window.end === now.hhmm && state.reportsTopic.lastCheckedDate !== now.dateStr) {
      const stores = await getStoreCodes(env);
      const reportedToday = (state.reports && state.reports[now.dateStr]) || {};
      const missing = stores.filter((s) => s.code && !reportedToday[s.code]);
      const text = missing.length
        ? `⏰ ${now.hhmm} — вікно звітів закрито.\nЩе не бачимо сьогоднішніх показників від:\n${missing.map((s) => `• ${s.code}`).join("\n")}\n\nБудь ласка, надішліть показники якнайшвидше — кожен звіт наближає дістрикт до цілі 💪`
        : `✅ Усі магазини дістрикту відзвітували сьогодні до ${now.hhmm}. Чудова дисципліна, команда! 🙌`;
      await tg(env, "sendMessage", { chat_id: chatId, message_thread_id: state.reportsTopic.threadId, text });
      state.reportsTopic.lastCheckedDate = now.dateStr;
      changed = true;
    }
  }

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
