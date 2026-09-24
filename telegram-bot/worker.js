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


// Copy style across MORNING_MESSAGES / ACTIVITY_MOTIVATION_* / WEEKLY_MOTIVATION
// / CONGRATS_TEMPLATES below follows one house voice: confident and warm, no
// empty slogans, short lines, <b>one bolded key idea</b> per message, and —
// per the engagement-copywriter brief this district manager gave — a light
// call-to-action closing almost every message (a question or a one-emoji
// reaction) so people actually reply in the chat instead of just reading.
// Sent with parse_mode: "HTML" (see the sendMessage calls that use these).
// To grow any of these pools (or add a new situational one), see
// .claude/skills/kyiv1-bot-copywriter/SKILL.md — the recipe for staying in
// this voice and shipping it safely.
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
  "🌤️ <b>Ранок — це перезавантаження.</b>\nВчорашні цифри вже неважливі, важливо, що ви зробите сьогодні.\nПоставте 💪, якщо готові дати сьогодні максимум",
  "🔑 <b>Ключ до гарного дня — перший впевнений крок.</b>\nВи його вже зробили, раз читаєте це :)\nНапишіть у чаті, з якою метою заходите в магазин сьогодні 🎯",
  "🌞 <b>Доброго ранку, дістрикт!</b>\nСьогодні — ще один шанс зробити покупця щасливим.\nХто перший розповість у чаті про сьогоднішній план? 👇",
  "⚡ <b>Заряджайтесь енергією — день чекає на результат!</b>\nВаша щоденна робота — те, що рухає дістрикт вперед.\nПоставте 🔥 в чаті, якщо готові до нових звершень",
  "🏁 <b>Старт дня — старт нових можливостей.</b>\nКожен ранок — це чистий аркуш для нових перемог.\nНапишіть, яку одну ціль ставите собі на сьогодні 🎯",
  "🌻 <b>Доброго ранку, команда!</b>\nВаша посмішка й енергія — перше, що бачить покупець.\nПоставте 😊, якщо готові дарувати гарний настрій сьогодні",
  "📈 <b>Сьогодні — ще один крок до цілей місяця.</b>\nМаленькі щоденні перемоги роблять велику різницю.\nХто сьогодні йде на рекорд? Пишіть у чаті 🚀",
  "🎬 <b>Дія — краще за очікування.</b>\nНе чекайте ідеального моменту, створюйте його самі.\nПоставте 💪 в чаті — і вперед до роботи",
  "🌈 <b>Доброго ранку!</b>\nПісля будь-якого дня завжди настає новий шанс.\nНапишіть у чаті одним словом, яким буде сьогоднішній день 👇",
  "🥇 <b>Кожен ранок — шанс стати кращими за вчора.</b>\nВи вже на правильному шляху, просто продовжуйте.\nПоставте 🔥, якщо готові до сильного старту",
  "🌄 <b>Кожен ранок — це стартова смуга.</b>\nВи вже готові для злету, лишилось тільки почати.\nПоставте 🚀, якщо сьогодні на максимум",
  "🍀 <b>Гарний ранок — половина гарного дня.</b>\nДовірся собі і своїй команді.\nНапишіть у чаті, з яким настроєм заходите сьогодні 👇",
  "🎈 <b>Сьогодні знову є шанс здивувати покупця.</b>\nВи вмієте це робити краще, ніж думаєте.\nПоставте 😊, якщо готові дарувати гарний сервіс",
  "🧭 <b>Компас на сьогодні простий — результат і командний дух.</b>\nВи знаєте, куди йти.\nНапишіть, яка перша задача на сьогодні 👇",
  "🌻 <b>Новий ранок — новий шанс проявити себе.</b>\nВіримо у вашу команду.\nПоставте 🔥, якщо готові показати клас сьогодні",
  "⛅ <b>Хай яка погода за вікном — настрій робимо самі.</b>\nПочнімо день з посмішки.\nНапишіть у чаті одним словом настрій зранку 👇",
  "🚦 <b>Зелене світло увімкнено — вперед до цілей дня!</b>\nКожен крок наближає до результату.\nПоставте 💪, якщо стартуєте на повну",
  "🎇 <b>Сьогодні — ще один день, щоб пишатись собою ввечері.</b>\nВи це вже вмієте.\nНапишіть, чим сьогодні хочете здивувати покупців 👇",
  "🌊 <b>День тільки почався — а можливості вже тут.</b>\nЛовіть момент.\nПоставте 🚀, якщо готові рухатись на повній швидкості",
  "🕊️ <b>Спокій і впевненість — найкращий старт для дня.</b>\nВи впораєтесь із будь-яким викликом.\nНапишіть у чаті, що додає впевненості саме вам 👇",
  "🔔 <b>Новий день — новий дзвінок на старт!</b>\nКожна зміна — це шанс проявитись.\nПоставте 🔥, якщо готові до сильного дня",
  "🌤️ <b>Погода за вікном змінюється, а ваш настрій — вирішувати вам.</b>\nОберіть впевненість.\nНапишіть 💪, якщо готові рухатись далі",
  "🎯 <b>Мета дня проста — зробити трохи краще, ніж учора.</b>\nЦього достатньо, щоб рухатись вперед.\nПоставте ✅, якщо приймаєте виклик",
  "🏔️ <b>Кожна вершина починається з одного кроку.</b>\nВи вже зробили перший — прокинулись і готові діяти.\nНапишіть у чаті, яка ваша вершина на сьогодні 👇",
  "🍃 <b>Легкість у діях — важкість лишаємо вчора.</b>\nСьогодні йдемо вперед без зайвого баласту.\nПоставте 🌟, якщо готові до легкого й продуктивного дня",
  "🎨 <b>Кожен день — це чистий аркуш для вашої історії.</b>\nМалюйте його впевнено.\nНапишіть у чаті, яким буде сьогоднішній штрих 👇",
  "🛎️ <b>Дзвіночок на старт зранку — і понеслась робота!</b>\nВи знаєте свою справу.\nПоставте 🔥, якщо сьогодні йдете на рекорд",
  "🌾 <b>Маленькі щоденні дії дають великий урожай наприкінці місяця.</b>\nСійте сьогодні.\nНапишіть, яку дію зробите вже найближчу годину 👇",
  "🚴 <b>Темп задаєте ви самі — почніть із впевненого старту.</b>\nОстальне докладеться.\nПоставте 💪, якщо тримаєте темп",
  "🎪 <b>Кожен магазин сьогодні — своя маленька сцена для покупця.</b>\nПокажіть найкраще шоу.\nНапишіть у чаті, чим здивуєте сьогодні 👇",
];

// Short one-liners appended to the twice-a-day activity digest (see
// sendActivityDigest) — free, no external API, same picked-at-random
// pattern as MORNING_MESSAGES above.
const ACTIVITY_MOTIVATION_MORNING = [
  "💪 <b>Дякуємо за вчорашню активність!</b> Сьогодні рахунок з нуля — покажемо ще краще 🚀\nХто сьогодні поб'є вчорашній рекорд? Пишіть у чаті 👇",
  "🔥 <b>Гарний результат учора, команда!</b>\nСьогодні — шанс закріпити темп.\nПоставте 👍, якщо налаштовані повторити вчорашній рівень активності",
  "☀️ <b>Вчора хтось точно старався — і це видно!</b>\nСьогодні всі шанси знову бути в топі.\nХто сьогодні бореться за перше місце? Заявляйте про себе в чаті 😉",
  "🙌 <b>Кожен голос і кожне повідомлення важливі для команди.</b>\nГарного і активного дня!\nНапишіть у чаті, чим плануєте зайнятись сьогодні найперше 👇",
  "⭐ <b>Стабільність — це теж перемога.</b>\nВчорашній результат — гарна база для сьогоднішнього.\nХто продовжить серію сьогодні? Пишіть у чаті 👇",
  "📊 <b>Активність — це не про кількість, а про залученість.</b>\nДякуємо всім, хто був з нами вчора!\nПоставте 🙌, якщо готові додати сьогодні ще більше енергії",
  "🚦 <b>Зелене світло на новий день!</b>\nВчорашня активність задала темп — тримаємо його.\nХто сьогодні виходить у топ активності? Заявляйтесь 🔥",
  "🧩 <b>Кожне повідомлення — маленька частинка спільного результату.</b>\nДякуємо за вчорашню участь!\nНапишіть, чим плануєте поділитись у чаті сьогодні 👇",
  "🎈 <b>Вчора команда показала клас!</b>\nСьогодні — шанс не зупинятись.\nПоставте 💪, якщо готові тримати темп",
  "🌟 <b>Дякуємо, що ви активні щодня.</b>\nЦе саме те, що робить дістрикт сильним.\nХто розкаже в чаті свою маленьку перемогу вчора? 😉",
  "🧡 <b>Вчорашня активність — це вже частина вашої історії успіху.</b>\nСьогодні пишемо наступний розділ.\nХто продовжить сьогодні? Пишіть у чаті 👇",
  "🌤️ <b>Дякуємо, що вчора чат був живим!</b>\nСьогодні можна ще краще.\nПоставте 🔥, якщо готові додати активності сьогодні",
  "📣 <b>Кожен голос вчора зробив чат сильнішим.</b>\nСьогодні черга за новими.\nХто заявить про себе сьогодні першим? 👇",
  "🧠 <b>Активність — це показник, що команда жива й залучена.</b>\nВчора це було видно.\nПоставте 🙌, якщо плануєте бути активними сьогодні",
  "🏹 <b>Вчора хтось точно влучив у ціль своєю активністю.</b>\nСьогодні — ваша черга.\nХто сьогодні йде на топ? Пишіть 👇",
  "🌼 <b>Дякуємо за вчорашню участь — це помітно.</b>\nСьогодні продовжуємо разом.\nПоставте 💫, якщо готові підтримати темп",
  "🎇 <b>Учора команда показала, що вміє бути активною.</b>\nСьогодні — ще один доказ цього.\nХто сьогодні перший відгукнеться в чаті? 👇",
  "🔋 <b>Активність — це енергія команди, і вчора її було достатньо.</b>\nЗарядимось знову сьогодні.\nПоставте ⚡, якщо готові до нового заряду",
  "🪁 <b>Вчорашня активність задала гарний вітер у вітрила.</b>\nСьогодні летимо далі.\nПоставте 🚀, якщо тримаєте курс",
];
const WEEKLY_MOTIVATION = [
  "🚀 <b>Дякуємо за цей тиждень, команда!</b>\nНовий тиждень — нові рекорди.\nЯка ціль номер один на цей тиждень? Пишіть у чаті 👇",
  "💪 <b>Кожен внесок цього тижня наближає дістрикт до цілі.</b>\nВперед до нового рекорду!\nХто цього тижня бореться за топ-3? Заявляйтесь 😉",
  "☀️ <b>Чудова динаміка!</b>\nНехай наступний тиждень буде ще активнішим.\nПоставте 🔥, якщо готові побити результат цього тижня",
  "🙌 <b>Дякуємо всім, хто був активний і підтримував команду.</b>\nНа новий тиждень — з новими силами!\nЩо плануєте покращити цього тижня? Напишіть у чаті 👇",
  "📅 <b>Новий тиждень — чистий рахунок.</b>\nМинулий тиждень заклав хорошу базу.\nЯкий результат хочете побачити в п'ятницю? Пишіть 👇",
  "🔑 <b>Стабільність тижня за тижнем — ось що дає результат.</b>\nДякуємо за минулий тиждень!\nПоставте 💪, якщо готові тримати темп і цього тижня",
  "🚀 <b>Новий тиждень — нові можливості для рекордів.</b>\nКожен внесок наближає нас до цілі місяця.\nХто заявить про свою мету тижня? 🎯",
  "🏆 <b>Дякуємо командою за минулий тиждень!</b>\nПопереду — ще один шанс показати клас.\nЯкий магазин цього тижня йде на топ? Пишіть у чаті 👇",
  "🌱 <b>Кожен тиждень — крок до великих цілей.</b>\nДинаміка є, тримаємо курс.\nПоставте 🔥, якщо готові до нового рекорду",
  "🎉 <b>Новий тиждень — нова сторінка спільної історії.</b>\nДякуємо, що робите її разом з нами!\nЩо плануєте зробити по-іншому цього тижня? Поділіться 😉",
  "🧭 <b>Новий тиждень — новий напрямок для рекордів.</b>\nМинулий заклав основу.\nЯку ціль ставите на цей тиждень? Пишіть у чаті 👇",
  "🌈 <b>Тиждень за тижнем ми стаємо сильнішою командою.</b>\nДякуємо за внесок кожного!\nПоставте 🙌, якщо готові до нового тижня",
  "🏗️ <b>Кожен тиждень — ще одна цеглинка в спільний результат.</b>\nБудуємо далі разом.\nЩо плануєте зробити цього тижня по-новому? 👇",
  "🎢 <b>Тиждень може бути різним — головне тримати курс.</b>\nДякуємо за минулий!\nПоставте 🔥, якщо готові до нових звершень",
  "🌱 <b>Новий тиждень — новий посів для майбутнього врожаю.</b>\nСійте якісно.\nЯкий результат хочете зібрати в п'ятницю? Пишіть у чаті 👇",
  "🎬 <b>Новий тиждень — новий епізод спільної історії команди.</b>\nДякуємо за попередній!\nПоставте 🍿, якщо готові до цікавого тижня",
  "🛠️ <b>Тиждень — час допрацювати те, що ще можна покращити.</b>\nМинулий дав хороший досвід.\nЩо доопрацюєте цього тижня? Пишіть 👇",
  "🌟 <b>Кожен новий тиждень — це шанс перевершити попередній.</b>\nВи вже це вмієте.\nПоставте 🚀, якщо готові до нового рекорду",
  "🎒 <b>Пакуємо в новий тиждень досвід минулого й нову енергію.</b>\nВперед разом!\nЯка перша ціль тижня? Пишіть у чаті 👇",
  "🔔 <b>Дзвінок на новий тиждень — і команда знову в грі.</b>\nДякуємо за минулий внесок!\nПоставте 💪, якщо готові тримати темп",
];

// Adam asked directly: every Friday, post the cumulative result since the
// start of the month, and announce a prize from him personally to the
// winner at month's end (see monthToDateDays/isLastDayOfMonth above and
// processChatSchedule's activityTopic block below). This pool is for the
// Friday progress digest specifically — deliberately mentions the prize
// as a running incentive, not just a recap, since that's the whole point
// of announcing it up front rather than only at the finish line.
const MONTH_PROGRESS_MOTIVATION = [
  "🏁 <b>Ось де ми зараз цього місяця.</b>\nПопереду ще є час піднятись вище — і не забувайте, наприкінці місяця на переможця чекає приз від Адама 🎁\nХто цими вихідними додає темп? 👇",
  "📈 <b>Місяць у розпалі — результат уже видно.</b>\nКожен бал наближає до призу від Адама в кінці місяця 🎁\nПоставте 🔥, якщо йдете за топ-3",
  "🎯 <b>Проміжний підсумок місяця перед вами.</b>\nПопереду ще достатньо днів, щоб змінити картину — і приз від Адама чекає найактивнішого 🎁\nЯка ваша ціль до кінця місяця? Пишіть 👇",
  "💪 <b>Ось хто зараз тримає темп цього місяця.</b>\nДо фінішу ще є час — і є заради чого: приз від Адама переможцю місяця 🎁\nПоставте 🚀, якщо готові піднятись у рейтингу",
  "🌟 <b>Місяць триває — результат ще можна покращити.</b>\nНагадуємо: наприкінці місяця Адам особисто вручить приз найактивнішим 🎁\nХто заявляє про фінішний ривок? 👇",
  "🔑 <b>Ось проміжна картина цього місяця.</b>\nЧас до фінішу ще є, а приз від Адама в кінці місяця — реальна ціль 🎁\nПоставте 💪, якщо йдете на рекорд",
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
    "🎁 <b>З днем народження{NAME}!</b> Хай кожен день нового року дарує привід для посмішки 😊",
    "🌟 <b>{NAME}, вітаємо з днем народження!</b> Нехай усе заплановане стане реальністю 🚀\nХто ще напише теплі слова? 👇",
    "🥂 <b>За{NAME} сьогодні!</b> Хай рік буде повний хороших моментів і нових перемог 🎉",
    "🎀 <b>Вітаємо{NAME} з днем народження!</b> Нехай усе, що задумано, обов'язково здійсниться 🎂",
    "🎊 <b>Хай сьогоднішній день{NAME} буде особливо теплим!</b> Приєднуйтесь із вітаннями 👇",
    "🌟 <b>{NAME}, нехай цей рік стане роком нових звершень!</b> Вітаємо всією командою 🎉",
    "🎂 <b>Свято{NAME} — привід зібрати найкращі побажання разом!</b> Пишіть свої нижче 💬",
    "🥂 <b>З днем народження{NAME}!</b> Нехай кожен день наступного року дарує привід для гордості 🌟",
    "🎁 <b>Вітаємо{NAME}!</b> Хай здійсниться найбажаніше, а решта докладеться сама 😊",
    "🎉 <b>{NAME}, хай цей рік буде щедрим на приємні несподіванки!</b> Приєднуйтесь до вітань 👇",
    "🌸 <b>З днем народження{NAME}!</b> Нехай тепло цього дня лишається з вами весь рік 🎈",
    "🎇 <b>Особливий день для{NAME}!</b> Вітаємо і бажаємо яскравого, щасливого року 🥳",
  ],
  promotion: [
    "🚀 <b>Вітаємо{NAME} з підвищенням!</b> Заслужений результат — так тримати 💪\nХто приєднається з вітаннями? 👏",
    "🎉 <b>Чудова новина{NAME}!</b> Вітаємо з новою посадою й бажаємо успіху на новому рівні 🚀",
    "👏 <b>Вітаємо{NAME}!</b> Праця не залишилась непоміченою — вперед до нових цілей 🔥",
    "🌟 <b>{NAME}, вітаємо з новою посадою!</b> Заслужено й по праву — вперед до нових звершень 🚀",
    "🔥 <b>Класна новина про{NAME}!</b> Результат говорить сам за себе — вітаємо з підвищенням 💪",
    "🎊 <b>Вітаємо{NAME}!</b> Нова роль — нові можливості проявити себе ще яскравіше 🌟",
    "👏 <b>{NAME}, це заслужено!</b> Вітаємо з підвищенням і бажаємо швидкої адаптації на новому рівні 🚀",
    "🌠 <b>{NAME}, це справді заслужено!</b> Вітаємо з новою посадою і бажаємо впевненого старту 🚀",
    "🎖️ <b>Вітаємо{NAME} з підвищенням!</b> Результат говорить сам за себе 💪",
    "🧗 <b>{NAME} піднявся(-лась) ще на одну сходинку!</b> Вітаємо з новою посадою 🔥",
    "🌟 <b>Класна новина{NAME}!</b> Вітаємо з підвищенням і бажаємо реалізувати всі задуми на новій ролі 🚀",
    "🏅 <b>Вітаємо{NAME}!</b> Нова посада — новий рівень можливостей проявити себе 👏",
    "🎯 <b>{NAME}, влучно і заслужено!</b> Вітаємо з підвищенням 🔥",
    "🚀 <b>Вітаємо{NAME} з новою роллю!</b> Попереду ще більше цікавих викликів і перемог 💪",
  ],
  anniversary: [
    "🎊 <b>Вітаємо{NAME} з ювілеєм!</b> Дякуємо за внесок у нашу команду 🙌",
    "🎉 <b>Особлива дата{NAME}!</b> Вітаємо й бажаємо ще багато таких вагомих подій 🎊",
    "🥳 <b>{NAME}, вітаємо з важливою датою!</b> Дякуємо за все, що вже зроблено разом 🙌",
    "🎈 <b>Особлива нагода для{NAME}!</b> Вітаємо і бажаємо ще багато таких моментів попереду 🎊",
    "🌟 <b>Вітаємо{NAME} з ювілеєм!</b> Кожен рік з вами — це справжня цінність для команди 🙌",
    "🎉 <b>{NAME}, з ювілеєм!</b> Дякуємо за досвід і внесок — попереду ще багато хороших сторінок 📖",
    "🎗️ <b>Дякуємо{NAME} за роки внеску в команду!</b> Вітаємо з особливою датою 🙌",
    "🌟 <b>{NAME}, ця дата — привід згадати, скільки вже пройдено разом!</b> Вітаємо 🎊",
    "🎈 <b>Вітаємо{NAME} з важливим ювілеєм!</b> Дякуємо, що ви з командою 🙌",
    "📖 <b>{NAME}, ще одна вагома сторінка спільної історії!</b> Вітаємо з ювілеєм 🎉",
    "🌿 <b>Вітаємо{NAME}!</b> Роки досвіду — це справжня цінність для дістрикту 🙌",
    "🎊 <b>{NAME}, дякуємо за відданість команді!</b> Вітаємо з особливою датою 🥳",
  ],
  victory: [
    "🏆 <b>Вітаємо з перемогою{NAME}!</b> Заслужений результат — пишаємось 🔥\nХто ще додасть слова підтримки? 👇",
    "🎉 <b>Оце так результат{NAME}!</b> Вітаємо і бажаємо тримати цей темп 🚀",
    "👏 <b>Вітаємо{NAME}!</b> Класна робота — так тримати 💪",
    "💥 <b>{NAME}, вітаємо з перемогою!</b> Ось так виглядає результат наполегливої роботи 🔥",
    "🎯 <b>Влучно в ціль{NAME}!</b> Вітаємо з перемогою і бажаємо не зупинятись 🚀",
    "🌟 <b>{NAME} показує клас!</b> Вітаємо з перемогою — це заслужено 👏",
    "🏅 <b>Вітаємо{NAME} з результатом!</b> Саме такі перемоги надихають усю команду 🔥",
    "🔥 <b>{NAME} зробив(-ла) це!</b> Вітаємо з перемогою і бажаємо не зупинятись 🏆",
    "🎯 <b>Точно в ціль,{NAME}!</b> Вітаємо з результатом 👏",
    "🚀 <b>Вітаємо{NAME}!</b> Ось так виглядає наполеглива робота на практиці 🔥",
    "🏆 <b>{NAME}, це справжня перемога!</b> Пишаємось усією командою 🎉",
    "💪 <b>Вітаємо{NAME} з перемогою!</b> Хай це буде першою з багатьох цього року 🚀",
    "🌟 <b>{NAME} показав(-ла) клас!</b> Вітаємо з результатом і бажаємо тримати темп 🔥",
    "🥇 <b>Вітаємо{NAME}!</b> Саме такі перемоги надихають на нові рекорди 🏆",
  ],
  generic: [
    "🙌 <b>Приєднуємось до привітань{NAME}!</b> Хай усе буде якнайкраще ✨",
    "🎉 <b>І ми вітаємо{NAME}!</b> Гарного настрою й тільки приємних новин 😊",
    "👏 <b>Вітаємо{NAME}!</b> Раді за вас 🙌",
    "🌟 <b>{NAME}, це чудова новина!</b> Раді за вас і вітаємо всією командою 🙌",
    "🎊 <b>Вітаємо{NAME}!</b> Нехай гарних моментів у житті буде якомога більше ✨",
    "💐 <b>{NAME}, вітаємо!</b> Хай усе складається якнайкраще далі 😊",
    "🥳 <b>Раді за{NAME}!</b> Вітаємо і бажаємо ще більше приводів для радості 🎉",
    "🌸 <b>{NAME}, рада(-ий) за вас!</b> Хай усе складається так само гарно й далі 😊",
    "🎉 <b>Вітаємо{NAME}!</b> Приємні новини завжди варто відсвяткувати 🥳",
    "🙌 <b>{NAME}, це чудово!</b> Вітаємо всією командою і бажаємо ще більше приводів для радості ✨",
    "🌟 <b>Раді за{NAME}!</b> Нехай гарних новин буде ще більше попереду 🎊",
    "💐 <b>Вітаємо{NAME}!</b> Хай усе задумане й далі здійснюється так само легко 😊",
    "🎈 <b>{NAME}, це привід для радості для всієї команди!</b> Вітаємо 🙌",
    "✨ <b>Раді поділити цю новину з{NAME}!</b> Хай приємних моментів буде ще більше 🎉",
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
  "Хай цей рік принесе нові перемоги, сили на великі цілі й впевненість, що будь-який виклик тобі по плечу 💪🎂",
  "Нехай усе задумане — і особисте, і професійне — здійсниться саме цього року, а енергії вистачить на всі амбіції 🚀🎁",
  "Гарного настрою, драйву й тільки добрих новин — і нехай кожен успіх цього року буде ще яскравішим за минулий 🥳🔥",
  "Хай мрії збуваються, сили примножуються, а віра у власні можливості росте з кожним днем 🎉✨",
  "Хай кожен день нового року дарує нові можливості для зростання й привід пишатись собою 🌟🎂",
  "Нехай цей рік стане роком нових висот — і особистих, і командних 🏆🎈",
  "Хай наснаги вистачить на всі задуми, а підтримка команди відчувається щодня 🙌🎁",
  "Нехай кожен виклик цього року стане ще однією маленькою перемогою на шляху до великої мети 🚀🎉",
  "Хай попереду буде рік, наповнений впевненими кроками, теплими людьми поруч і справжніми приводами для гордості 🌟🎂",
  "Нехай енергії вистачить на всі задумані плани, а підтримка команди відчувається кожного дня 🙌🎉",
  "Хай цей рік стане часом нових можливостей — і в роботі, і в особистому житті 🚀🎁",
  "Нехай кожен виклик перетворюється на цікаву історію успіху, а втома — на заслужений відпочинок 💪🎈",
  "Хай усе, що плануєш, здійснюється легко, а несподіванки будуть тільки приємними 🎉✨",
  "Нехай сила духу й наснага супроводжують тебе весь рік, а результати радують ще більше 🔥🎂",
  "Хай цей день стане початком по-справжньому яскравого й щасливого року 🌈🎁",
  "Нехай кожна ціль цього року здається легкою, а підтримка близьких — завжди поруч 🙌🎉",
];

function buildBirthdayMessage(b) {
  const fullName = escapeHtml(`${b.firstName || ""} ${b.lastName || ""}`.trim());
  const wish = BIRTHDAY_WISHES[Math.floor(Math.random() * BIRTHDAY_WISHES.length)];
  return `🎉 <b>Сьогодні святкує день народження ${fullName}!</b>\n\n${wish}\n\nОсобисто приєднуюсь до вітань — ${DISTRICT_MANAGER_SIGNATURE} 🙌\n\nХто ще приєднається? Пишіть теплі слова в чаті 👇`;
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

// Ukrainian Cyrillic → Latin, the official transliteration table (KMU
// resolution No.55) — needed because a lot of people's Telegram profiles
// are in Latin script (e.g. "Oleh Hatsenko") while the HR roster is always
// Cyrillic ("Олег Гаценко"). й/є/ї/ю/я transliterate differently at the
// START of a word ("Юлія" → "Yuliia") than mid-word ("Наталія" →
// "Nataliia") — since this only ever runs on one already-split name token
// at a time (first name, or last name, never "first+last" as one string),
// index 0 of the input IS always a word start, so a single start/mid table
// pair covers it correctly without extra word-splitting logic here.
const CYR_TRANSLIT_MID = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
  и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ю: "iu", я: "ia", ь: "", "'": "",
};
const CYR_TRANSLIT_START = { ...CYR_TRANSLIT_MID, є: "ye", ї: "yi", й: "y", ю: "yu", я: "ya" };

// `word` is expected already normalizeName()-d (lowercase, apostrophes
// folded to '). Latin/digit/punctuation characters have no table entry and
// pass through unchanged — transliterating an already-Latin word is a
// harmless no-op, which is what lets the same comparison work regardless
// of which script either side happens to be in.
function transliterateWord(word) {
  let out = "";
  for (let i = 0; i < word.length; i++) {
    const table = i === 0 ? CYR_TRANSLIT_START : CYR_TRANSLIT_MID;
    out += table[word[i]] ?? word[i];
  }
  return out;
}

// True if two already-normalizeName()-d strings refer to the same name,
// directly or via transliteration in either direction — covers a Cyrillic
// HR name ("гаценко") against either a Cyrillic ("гаценко") or Latin
// ("hatsenko") Telegram name.
function namesEqual(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const wordsA = a.split(" ").map(transliterateWord).join(" ");
  const wordsB = b.split(" ").map(transliterateWord).join(" ");
  return wordsA === b || a === wordsB;
}

function exactNameMatches(state, b) {
  const first = normalizeName(b.firstName);
  const last = normalizeName(b.lastName);
  const candidates = [normalizeName(`${first} ${last}`), normalizeName(`${last} ${first}`)].filter(Boolean);
  if (!candidates.length) return [];
  return Object.entries(state.names || {})
    .filter(([, name]) => candidates.some((c) => namesEqual(c, normalizeName(name))))
    .map(([uid]) => uid);
}

// Common Ukrainian nicknames/diminutives, keyed by the full first name
// (normalizeName()-d Cyrillic), whose usual LATIN spelling bears no
// letter-level resemblance to the official transliteration at all — e.g.
// "Olya" for "Ольга" (official translit: "olha"). Listed directly in both
// scripts rather than relying on transliterateWord() for the nickname
// itself, since informal spelling of a nickname diverges from the official
// table just as often as the full name does (that's the whole problem).
const UA_NICKNAMES = {
  "ольга": ["оля", "olya", "olia"],
  "анастасія": ["настя", "nastya", "nastia"],
  "олександр": ["саша", "сашко", "sasha", "sashko"],
  "олександра": ["саша", "sasha"],
  "катерина": ["катя", "katya", "katia"],
  "наталія": ["наташа", "natasha"],
  "тетяна": ["таня", "tanya", "tania"],
  "михайло": ["міша", "misha"],
  "марія": ["маша", "masha"],
  "юлія": ["юля", "yulya", "yulia"],
  "вікторія": ["віка", "vika"],
  "владислав": ["влад", "vlad"],
  "роман": ["рома", "roma"],
  "дмитро": ["діма", "dima"],
  "максим": ["макс", "max", "maks"],
  "ірина": ["іра", "ira"],
};

// г → h is the official transliteration (see CYR_TRANSLIT_MID above), but
// just as often written г → g informally ("Shulga" for "Шульга", official
// "Shulha") — comparison-only, doesn't change any transliterated text
// actually generated/sent elsewhere.
function foldGH(s) {
  return s.replace(/g/g, "h");
}

// True if `token` (a single word from a Telegram display name, trailing dot
// already allowed) could stand for `fullWord` IN FULL: an exact match
// (Cyrillic or transliterated, with the г/g spelling quirk folded away), or
// a known nickname/diminutive (see UA_NICKNAMES). Does NOT cover a bare
// initial — see tokenStandsFor below, which adds that on top.
function tokenStandsForStrong(token, fullWord) {
  const t = token.replace(/\.$/, "");
  if (!t || !fullWord) return false;
  const translit = transliterateWord(fullWord);
  if (t === fullWord || t === translit || foldGH(t) === foldGH(translit)) return true;
  return (UA_NICKNAMES[fullWord] || []).some((n) => t === n);
}

// The above, plus a bare initial — "м"/"m" or "м."/"m." for "марк" — which
// on its own is too weak a signal (see looseNameMatch's "at least one part
// STRONG" rule below), but is enough for the OTHER name part once one part
// has already matched strongly.
function tokenStandsFor(token, fullWord) {
  if (tokenStandsForStrong(token, fullWord)) return true;
  const t = token.replace(/\.$/, "");
  if (!t || !fullWord) return false;
  const translit = transliterateWord(fullWord);
  return t.length === 1 && (t === fullWord[0] || t === translit[0]);
}

// Catches the HR name and the Telegram profile name referring to the same
// person even when they don't match word-for-word — e.g. HR says "Афонічев
// Марк" but the person is registered in Telegram as "Марк А." (surname
// abbreviated to an initial), "М. Афонічев" (first name abbreviated), or
// "Mark A." (transliterated + abbreviated, both at once). Requires at
// least one of the two name parts to match STRONGLY (not both as bare
// initials) — "М. А." alone is too weak a signal and would match half
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
      if (tokenStandsForStrong(a, first) || tokenStandsForStrong(c, last)) return true;
    }
  }
  return false;
}

function looseNameMatches(state, b) {
  return Object.entries(state.names || {})
    .filter(([, name]) => looseNameMatch(b, name))
    .map(([uid]) => uid);
}

// A couple of birthday-roster store labels spell the same word differently
// than the dashboard's canonical store name ("Inzhur Park, Brovary" vs
// "Inghur") — same idea as CYR_TRANSLIT_MID, but between two already-Latin
// informal spellings rather than Cyrillic → Latin.
const STORE_LABEL_SPELLING_ALIASES = { levoberegny: "livoberegna", inzhur: "inghur" };
// City words repeat across multiple stores (two are both "Chernigiv"), so
// on their own they can't identify a SPECIFIC store — only count as a
// signal alongside the store's actual distinguishing word (skymall,
// hollywood, pohreby, ...), which is unique per store in this roster.
const STORE_LABEL_CITY_WORDS = new Set(["kyiv", "brovary", "chernigiv"]);

function storeLabelSignalTokens(label) {
  return (label || "")
    .toLowerCase()
    .split(/[^a-zа-яіїєґ]+/i)
    .filter((w) => w.length >= 4 && w !== "park")
    .map((w) => STORE_LABEL_SPELLING_ALIASES[w] || w)
    .filter((w) => !STORE_LABEL_CITY_WORDS.has(w));
}

// Resolves a birthday roster's store label (e.g. "Pohreby", "Chernigiv SC
// Hollywood", "Inzhur Park, Brovary") to the dashboard's store code (e.g.
// "J104") — the same code storeMembers keys on — so an ambiguous name
// match can be narrowed down by store. The two sides name the same store
// in different word order, with stray words/punctuation and sometimes
// details only one side mentions, so this compares by the store's actual
// distinguishing word rather than requiring the full strings to match
// letter-for-letter. A too-generic label (a bare city name shared by two
// stores, with no distinguishing word at all) correctly resolves to
// nothing rather than guessing between them.
async function resolveStoreCodeForBirthday(env, b) {
  if (!b.store) return null;
  const stores = await getStoreCodes(env);
  const wantSignal = storeLabelSignalTokens(b.store);
  if (!wantSignal.length) return null;
  const matches = stores.filter((s) => {
    const nameSignal = storeLabelSignalTokens(s.name);
    return wantSignal.some((t) => nameSignal.includes(t));
  });
  return matches.length === 1 ? matches[0].code : null;
}

// Key state.birthdayLearnedLinks is stored under — see learnBirthdayLink
// and maybeResolvePendingBirthday below.
function birthdayLookupKey(firstName, lastName) {
  return normalizeName(`${firstName || ""} ${lastName || ""}`);
}

// Tries an already-LEARNED link first (see learnBirthdayLink — this person
// was greeted un-tagged once before, and the chat's own reaction to that
// taught us who she actually is; no more guessing needed for her, ever
// again), then an exact name match, then the loose/abbreviated match above.
// Either name-matching tier can turn up more than one candidate (e.g. two
// people both fitting "М. А.", or two exact namesakes) — when that
// happens, narrow using the roster's store (via storeMembers, filled by
// /storepoll or /mystore) if it resolves to exactly one of them. Still
// ambiguous after that → return null — sendBirthdayGreetings below no
// longer skips the greeting for this (see maybeResolvePendingBirthday), it
// only means this specific send can't tag anyone by name.
async function findMemberUserId(env, state, b) {
  const learned = state.birthdayLearnedLinks?.[birthdayLookupKey(b.firstName, b.lastName)];
  if (learned) return learned;

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

// How long an un-tagged greeting's message id stays worth watching for a
// reply/mention that might identify her (see maybeResolvePendingBirthday).
// Long enough to cover a slow reply, short enough that a much-later,
// unrelated birthday-congrats mention in the same chat can't misattribute
// to a stale entry.
const BIRTHDAY_PENDING_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

// state.birthdayGreeting.oneTimeNote: an optional plain-text line prepended
// to today's greeting(s) only — set directly in Firestore for a one-off
// occasion (e.g. explaining a late/retried send), never persisted as part
// of the regular flow. The cron caller (processChatSchedule) clears it
// right after this runs, so it can never leak into a future day's greeting.
async function sendBirthdayGreetings(chatId, env, state, now) {
  const birthdays = (await loadDashboardDoc(env, "birthdays")) || [];
  const month = Number(now.month.slice(5));
  const todays = birthdays.filter((b) => Number(b.day) === now.dayOfMonth && Number(b.month) === month);
  const note = state.birthdayGreeting.oneTimeNote;
  const pending = (state.birthdayGreeting.pending = state.birthdayGreeting.pending || {});
  const cutoff = Date.now() - BIRTHDAY_PENDING_MAX_AGE_MS;
  for (const [mid, p] of Object.entries(pending)) {
    if (!p.ts || p.ts < cutoff) delete pending[mid];
  }
  for (const b of todays) {
    const uid = await findMemberUserId(env, state, b);
    if (uid && !(await isActiveMember(env, chatId, uid))) continue; // matched but left/was removed — still skip
    // Unmatched (uid is null) still gets greeted — better an untagged wish
    // than none, and the chat's own reaction to it teaches us who she is
    // (see maybeResolvePendingBirthday) so future birthdays for her resolve
    // directly, no more guessing.
    const text = note ? `${note}\n\n${buildBirthdayMessage(b)}` : buildBirthdayMessage(b);
    const res = await tg(env, "sendMessage", withThread({ chat_id: chatId, text, parse_mode: "HTML" }, state.birthdayGreeting.threadId));
    const sentId = res?.result?.message_id;
    if (!uid && sentId) pending[sentId] = { firstName: b.firstName, lastName: b.lastName, ts: Date.now() };
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
  {
    question: "🌟 Що найбільше допомагає в роботі?",
    options: ["🤝 Підтримка команди", "📚 Досвід і знання", "💡 Власна мотивація", "🎯 Чіткі цілі"],
    hook: "💬 Розкажіть у чаті, що особисто вам допомагає найбільше",
  },
  {
    question: "📈 Як оцінюєте цей тиждень?",
    options: ["🔥 Дуже продуктивний", "🙂 Нормальний, робочий", "😅 Був складнуватий", "🆘 Дуже важкий"],
    hook: "🙌 Якщо тиждень був важким — пишіть, чим можемо допомогти",
  },
  {
    question: "🎉 Що найбільше піднімає настрій на роботі?",
    options: ["😄 Гарний покупець", "🏆 Виконаний план", "🤝 Класна команда", "🎶 Щось інше — напишу"],
    hook: "💬 Діліться в чаті — цікаво прочитати відповіді всіх",
  },
  {
    question: "🚀 Що найбільше допомогло цього тижня?",
    options: ["🤝 Команда", "🎯 Чіткий план", "💡 Власна ініціатива", "📚 Досвід"],
    hook: "💬 Розкажіть у чаті трохи більше про це",
  },
  {
    question: "😄 Який момент тижня запам'ятався найбільше?",
    options: ["🛍️ Класний покупець", "🏆 Виконаний план", "🎉 Командна перемога", "😅 Кумедна ситуація"],
    hook: "💬 Пишіть у чаті — цікаво дізнатись деталі",
  },
  {
    question: "🔋 Наскільки заряджені на наступний тиждень?",
    options: ["🔥 На всі 100", "🙂 Помірно", "😌 Треба трохи відпочити", "🆘 Потрібна підтримка"],
    hook: "🙌 Якщо потрібна підтримка — пишіть, розберемось",
  },
  {
    question: "🎯 Що б хотіли покращити в роботі магазину?",
    options: ["🛒 Викладку", "📋 Процеси", "🤝 Комунікацію в команді", "💬 Щось інше — напишу"],
    hook: "💬 Діліться ідеями в чаті — розглянемо кожну",
  },
  {
    question: "🌟 Що для вас головний показник гарного дня?",
    options: ["💰 Виторг", "😊 Задоволені покупці", "🤝 Гарна атмосфера в команді", "🎯 Виконаний план"],
    hook: "💬 Розкажіть у чаті, чому саме це важливо для вас",
  },
  {
    question: "🧩 Що найчастіше заважає працювати ще краще?",
    options: ["⏱️ Брак часу", "📦 Логістика/поставки", "🧑‍🤝‍🧑 Нестача людей", "💬 Щось інше — напишу"],
    hook: "🙌 Пишіть чесно — це допоможе покращити процеси",
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

// ----------------------------------------------------- topic challenges --
// "Виклики по темах": Adam asked for the bot to notice WHO talks about
// which commercial technique (tied to their store), and when several
// mentions of the same one land close together, nudge whichever stores
// have been quieter about it lately — same spirit as SUCCESS_KEYWORDS/
// SUPPORT_KEYWORDS above (a soft substring signal, not a strict report
// field), just per-topic and per-store instead of chat-wide.
const SALES_TOPICS = {
  code7: { label: "7-й код", emoji: "🎯", keywords: ["7 код", "7-й код", "7й код", "7код", "сьомий код"] },
  energy: { label: "Енерджі", emoji: "🔋", keywords: ["енерджі", "енерджи", "energy"] },
  complex: { label: "Комплексні продажі", emoji: "🛍️", keywords: ["комплекс"] },
  b2b: { label: "Б2Б", emoji: "🤝", keywords: ["б2б", "b2b"] },
  clearance: { label: "Розпродаж", emoji: "🏷️", keywords: ["розпродаж", "знижк"] },
};

function detectSalesTopics(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return Object.entries(SALES_TOPICS)
    .filter(([, t]) => t.keywords.some((kw) => lower.includes(kw)))
    .map(([key]) => key);
}

// Tuning for the burst-detection: this many mentions of the SAME topic,
// from at least this many DIFFERENT stores, within this rolling window →
// worth a challenge. Kept modest on purpose — three real people bragging
// about the same thing within a few hours is a genuine little wave, not
// noise; requiring >1 store stops one chatty manager from triggering it
// solo. A per-topic cooldown then stops it from firing again the same day
// even if messages keep coming.
const TOPIC_BURST_THRESHOLD = 3;
const TOPIC_BURST_WINDOW_MS = 3 * 60 * 60 * 1000;
const TOPIC_BURST_MIN_STORES = 2;
const TOPIC_CHALLENGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const TOPIC_MENTION_MAX_AGE_DAYS = 14; // trailing window used to decide who's "less active" in a topic

const TOPIC_CHALLENGE_PHRASES = [
  "Хто наступний приєднається? 💪",
  "Ще є час і решті дістрикту показати клас 👇",
  "Давайте підтягнемо всіх до цього рівня 🙌",
  "Хто покаже такий самий результат сьогодні? 🔥",
  "Час і іншим магазинам заявити про себе 😉",
];

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
function nextDateStr(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function daysAgoStr(dateStr, n) {
  let d = dateStr;
  for (let i = 0; i < n; i++) d = prevDateStr(d);
  return d;
}
function daysAheadStr(dateStr, n) {
  let d = dateStr;
  for (let i = 0; i < n; i++) d = nextDateStr(d);
  return d;
}
// Every day from the 1st of the current calendar month through today,
// inclusive — used by the Friday "результат з початку місяця" digest and
// the end-of-month winner announcement below (see processChatSchedule's
// activityTopic block). now.month is already "YYYY-MM" (see kyivNow).
function monthToDateDays(now) {
  const days = [];
  let d = `${now.month}-01`;
  while (d <= now.dateStr) {
    days.push(d);
    d = nextDateStr(d);
  }
  return days;
}
// True exactly on the calendar month's last day — the trigger for the
// end-of-month winner announcement, without needing to hardcode 28/30/31.
function isLastDayOfMonth(now) {
  return nextDateStr(now.dateStr).slice(0, 7) !== now.month;
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
/topcontent — найпопулярніші фото/відео за реакціями (останні 14 днів), крім власних повідомлень District Manager'а
/topicactivity — хто найактивніше згадує 7 код / Енерджі / Комплексні продажі / Б2Б / Розпродаж (останні 14 днів)
/menu — швидке меню кнопками (рейтинг, стріки, довідка, мій магазин) — не треба нічого набирати
/help — цей список

Дані дістрикту (з дашборду):
/vacancies — прострочені та відкриті вакансії
/activity — керуючі, які давно не заходили на сайт
/kpi — останні показники дістрикту (вкладка "Звіти та показники" на сайті)

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
/zvit (або повідомлення "#звіт" тут) — бот надішле форму звіту в особисті: заповніть цифри, натисніть «Надіслати» — картка з результатом (і % виконання плану по кожному пункту) опублікується тут. Потрібен хоча б один /start боту в особистих заздалегідь
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
/unlinked — хто ще БЕЗ прив'язки (протилежність /storemembers)
/storepoll (адміни чату) — надіслати всім опитування "оберіть свій магазин" (одне натискання замість команди) — потрібно для подальшої комунікації, щоб повідомлення й нагадування точно доходили до потрібної людини; надсилається в тему «Активності», якщо вона прив'язана
/stores — список усіх магазинів дистрикту з керуючими (та сама реальна довідка, що вже показує дашборд і на яку відповідає ask-бот) — і кнопка в /menu

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
належить цей текст" прямо з тексту слайдів (див. telegram-bot/README.md).

Фотоконкурс (у темі форуму, адміни чату):
/photocontest start <назва> — старт у ПОТОЧНІЙ темі; надалі будь-яке фото туди — це заявка
/photocontest vote — закрити прийом заявок і оголосити голосування реакціями
/photocontest results — підсумувати голоси (реакції на фото), оголосити топ-3 (+30/+20/+10 балів) і завершити
/photocontest status — скільки заявок і (під час голосування) поточний топ-3
/photocontest cancel — скасувати без підсумків
Голосування — реакціями 👍❤️🔥 прямо під фото (не Telegram-опитуванням: там варіанти лише текстові, фото не показати). Потребує того самого одноразового webhook-налаштування з update-типом message_reaction_count, що й «чиє привітання зібрало найбільше реакцій» вище (див. README) — без цього заявки приймаються, але голоси не зараховуються.

Тиждень Energy (потребує прив'язаної теми звітів):
Триває постійно, цикл четвер—четвер: щочетверга бот сам стартує новий 7-денний конкурс на середній Energy по щоденних звітах, щодня в темі звітів — міні-лідерборд, наступної середи — переможець і одразу новий цикл.
/energyweek status — поточний рейтинг магазинів
/energyweek cancel — скасувати поточний цикл без оголошення переможця (наступного четверга стартує новий)
/energyweek start — вручну запустити цикл поза розкладом (адміни чату)

Веселі пости (у темі форуму, адміни чату):
/setfuntopic — прив'язати ПОТОЧНУ тему (напр. «Хіхоньки та хахаоньки») для веселих постів
У будні о 13:00 бот сам публікує туди короткий жарт чи веселий пост (генерує AI щоразу новий — не з готового списку). Без картинок і мемів з інтернету — лише текст, щоб не занести в робочий чат щось недоречне.

Звернення до бота (усім, без команди):
Досить написати слово "бот" (у будь-якому регістрі — бот/БОТ/Бот, навіть
просто в контексті фрази, не обов'язково на початку) — або згадати через @,
або відповісти на будь-яке його повідомлення. Бот відповідає як дружній,
з гумором співрозмовник: на реальне питання — конкретно по суті, на
привітання чи скаргу на втому — коротко підбадьорить. Можна прикріпити
фото чи документ (.pdf/.txt) із підписом "бот..." — розбере і його; на
голосові/відео поки що чесно відповість жартом, що не вміє їх "чути"/
"дивитись". Слова на кшталт "робота"/"робот" не рахуються — реагує лише
на окреме слово "бот". Якщо доданий секрет ANTHROPIC_API_KEY — відповідає
Claude, враховуючи і кілька останніх реплік чату, і РЕАЛЬНІ дані з бази
(хто вже відзвітував сьогодні, стріки, топ активності, стан чекліста —
з тих тем форуму, що прив'язані в цьому чаті, плюс довідка — код/назва/
керуючий кожного магазину), тож на "як у нас справи сьогодні" чи "хто
керуючий J104" відповідає предметно, а не вигадує; без ключа — коротка
заготовлена підтримка з тим самим духом (без доступу до даних). Ліміт —
20 AI-відповідей на годину на чат (далі теж відповідає, просто
заготовленою фразою, без виклику API).
Фідбек на відповіді ask-бота: поставте 👍 чи 👎 (або 🔥/❤️/👏 — теж
рахуються "за"; 💩/😡/🤡/😢 — "проти") реакцією на будь-яку AI-відповідь
бота. /askbotfeedback (адміни чату) — підсумок 👍/👎 і текст останніх
відповідей, що отримали 👎, для перегляду й, якщо треба, доопрацювання
промпту.
/askbotescalations (адміни чату) — список звернень, які Claude сам
позначив як такі, що можуть потребувати уваги людини (кадрове питання,
конфлікт, пряме прохання покликати людину, чи роздратований тон разом
із високою терміновістю) — нікого не пінгує в моменті, це список "чи
було щось, що варто переглянути".
/askbotdebug (адміни чату) — якщо ask-бот раз у раз відповідає лише
заготовленою фразою замість реальної відповіді Claude, ця команда
показує причину останньої невдалої спроби (немає ключа, мережева
помилка, відмова Anthropic API тощо) — без доступу до логів Cloudflare.
/registerwebhook (адміни чату) — одноразове налаштування: перереєструє
webhook у Telegram з повним списком типів оновлень, щоб запрацювали
кнопки в /menu та реакції-тригери. Треба лише раз після першого
розгортання бота чи якщо кнопки /menu не відповідають на натискання.`;

// ------------------------------------------------------------------ fetch --

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/reportform") {
      return new Response(REPORT_FORM_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (request.method !== "POST") {
      return new Response("kyiv1-telegram-bot is running", { status: 200 });
    }
    // Fail CLOSED, not open: previously this check only ran `if
    // (env.WEBHOOK_SECRET)` — meaning if the secret was ever missing
    // (unset, deleted, a fresh deploy before setup), the worker silently
    // accepted ANY POST as a real Telegram update, no auth at all. The
    // worker's URL is a predictable *.workers.dev subdomain, not a secret,
    // so that's a real exposure, not a theoretical one. Now a missing
    // secret means every webhook request is rejected instead — loud
    // breakage you'd notice, rather than quiet, unauthenticated access.
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!env.WEBHOOK_SECRET || secret !== env.WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    // The worker's own public URL, straight from this request — this is how
    // /registerwebhook can re-register the webhook with Telegram without
    // anyone needing to know or paste the exact workers.dev subdomain, and
    // how sendReportFormButton builds the /reportform link above.
    const selfUrl = url.origin;
    ctx.waitUntil(handleUpdate(update, env, selfUrl));
    ctx.waitUntil(maybeSelfHealWebhook(env, selfUrl));
    return new Response("OK");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(event, env));
  },
};

async function handleUpdate(update, env, selfUrl) {
  try {
    if (update.message) await handleMessage(update.message, env, selfUrl);
    if (update.poll) await handlePollUpdate(update.poll, env);
    if (update.poll_answer) await handlePollAnswer(update.poll_answer, env);
    if (update.message_reaction_count) await handleMessageReactionCount(update.message_reaction_count, env);
    if (update.message_reaction) await handleMessageReaction(update.message_reaction, env);
    if (update.callback_query) await handleCallbackQuery(update.callback_query, env);
  } catch (err) {
    console.error(`handleUpdate error: ${err?.message || err}`, err?.stack || "");
  }
}

// --------------------------------------------------------------- messages --

async function handleMessage(msg, env, selfUrl) {
  const chatId = msg.chat.id;

  // The /zvit "console window" (see sendReportFormButton/REPORT_FORM_HTML)
  // always opens in the employee's PRIVATE chat with the bot — Telegram
  // won't attach a web_app button to a message inside a group topic at
  // all — so this arrives here as a private-chat message, ahead of the
  // private-chat branch below. handleReportFormSubmit reads the actual
  // target group/thread out of the submitted payload itself.
  if (msg.web_app_data) {
    await handleReportFormSubmit(msg, env);
    return;
  }

  if (msg.chat.type === "private") {
    if (msg.text && msg.text.startsWith("/start")) {
      await tg(env, "sendMessage", {
        chat_id: chatId,
        text: "Привіт! Додайте мене в груповий чат і зробіть адміністратором — я стежитиму за порядком, вестиму статистику та надсилатиму нагадування.",
      });
      return;
    }
    // /zvit / "#звіт" typed directly here, in the bot's own private chat
    // (not the group topic) — Adam asked for this to actually work, not
    // just explain where the group version lives. The one thing this DM
    // can't know on its own is which GROUP/reports-topic to publish the
    // finished card into, so handleDmReportTrigger looks that up: which
    // group (of the ones this bot is in) already has this person linked
    // to a store (state.storeMembers, same mapping /mystore/resolveStoreCodes
    // use), or, given an explicit store code ("/zvit J104"), links them to
    // it in whichever group has a reports topic bound.
    const dmMatch = msg.text && msg.text.trim().match(DM_REPORT_TRIGGER_RE);
    if (dmMatch) {
      await handleDmReportTrigger(msg, env, selfUrl, dmMatch[1]);
    }
    // Video/video-note/voice auto-comment (see maybeCommentOnSpokenMessage)
    // works here too, not just in a group topic — testing it means sending
    // straight to the bot, and state is keyed by chatId either way (the
    // private chat's own id), so nothing else needs to change for this
    // to just work in DM.
    if (msg.from && !msg.from.is_bot && (msg.video || msg.video_note || msg.voice)) {
      await maybeCommentOnSpokenMessage(chatId, msg, env);
    }
    return;
  }

  await addToChatsIndex(env, chatId);
  if (msg.chat.title) await syncChatTitle(chatId, msg.chat.title, env);

  if (Array.isArray(msg.new_chat_members) && msg.new_chat_members.length) {
    await handleNewMembers(chatId, msg.new_chat_members, env);
  }

  if (msg.text && msg.text.startsWith("/")) {
    await handleCommand(msg, env, selfUrl);
    return;
  }

  if (msg.from && !msg.from.is_bot && isContentMessage(msg)) {
    await trackActivity(chatId, msg, env, selfUrl); // counts stats/flood for any kind of message content
  }

  if (msg.from && !msg.from.is_bot && msg.text) {
    await maybeJoinCongrats(chatId, msg, env);
    await maybeSendStoreMotivation(chatId, msg, env);
    await maybeTeaseAndriy(chatId, msg, env);
  }

  if (msg.from && !msg.from.is_bot && msg.photo) {
    await trackPhotoReport(chatId, msg, env);
    await trackPhotoContestEntry(chatId, msg, env);
  }

  if (msg.from && !msg.from.is_bot && msg.document) {
    await maybeGenerateQuizFromPresentation(chatId, msg, env);
  }

  if (msg.from && !msg.from.is_bot && (msg.video || msg.video_note || msg.voice)) {
    await maybeCommentOnSpokenMessage(chatId, msg, env);
  }

  const hasAskableContent = msg.text || msg.caption || msg.photo || msg.document || msg.voice || msg.audio || msg.video || msg.video_note;
  if (msg.from && !msg.from.is_bot && hasAskableContent && (await isAddressedToBot(msg, env))) {
    await cmdAskBot(chatId, msg, env);
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
  "trackack", "enginepoll", "setquiztopic", "birthdays", "storepoll", "askbotfeedback", "askbotescalations",
  "registerwebhook", "askbotdebug", "photocontest", "energyweek", "setfuntopic",
]);

// Every update Telegram can send that this bot actually reacts to — kept in
// one place so /registerwebhook and the README's manual setWebhook link
// can't drift apart. Adding "callback_query" here is what makes /menu's
// inline buttons actually respond to taps.
const WEBHOOK_ALLOWED_UPDATES = ["message", "poll", "poll_answer", "message_reaction", "message_reaction_count", "callback_query"];

async function handleCommand(msg, env, selfUrl) {
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

    case "topcontent":
      await cmdTopContent(chatId, env);
      break;

    case "topicactivity":
      await cmdTopicActivity(chatId, env);
      break;

    case "menu":
      await cmdMenu(chatId, msg, env);
      break;

    case "vacancies":
      await sendVacancyReport(chatId, env);
      break;

    case "activity":
      await sendActivityReport(chatId, env);
      break;

    case "kpi":
      await sendKpiReport(chatId, env);
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

    case "zvit":
      await cmdReportForm(chatId, msg, env, selfUrl);
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

    case "setfuntopic":
      await cmdSetFunTopic(chatId, msg, env);
      break;

    case "setquiztopic":
      await cmdSetQuizTopic(chatId, msg, env);
      break;

    case "photocontest":
      await cmdPhotoContest(chatId, msg, argsText, env);
      break;

    case "energyweek":
      await cmdEnergyWeek(chatId, msg, argsText, env);
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

    case "unlinked":
      await cmdUnlinked(chatId, env);
      break;

    case "storepoll":
      await cmdStorePoll(chatId, msg, env);
      break;

    case "stores":
      await cmdStores(chatId, env, msg.message_thread_id ?? null);
      break;

    case "askbotfeedback":
      await cmdAskBotFeedback(chatId, env);
      break;

    case "askbotescalations":
      await cmdAskBotEscalations(chatId, env);
      break;

    case "askbotdebug":
      await cmdAskBotDebug(chatId, env);
      break;

    case "registerwebhook":
      await cmdRegisterWebhook(chatId, env, selfUrl);
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

// Ukrainian evening-report field patterns — tolerant of how messy these
// actually are in practice: no separator, a dash, a colon, various emoji
// (💰💵📈👥💸), a trailing "грн"/"шт", space-separated thousands ("117 509").
// Real examples this was built against (from this district's own chat):
//   "Виторг💰117 509"     "Виторг- 200 000 грн"     "Виторг 176 000"
//   "Покупці👥 79"        "Покупці- 125"
//   "Середня покупка💸 1487"   "Покупка- 1770грн"   "Середня покупка💸4100"
// These three were the original explicitly-requested fields. "Артикул(и)"
// below was added later, once Adam actually asked for it (a report-card
// mock he sent shows it explicitly) — until then it showed far more format
// variance across stores than seemed worth the added fragility.
const REPORT_FIELD_PATTERNS = {
  revenue: /виторг\D{0,15}([\d\s]{2,12})/i,
  customers: /покупці\D{0,15}([\d\s]{1,8})/i,
  avgCheck: /(?:середня\s*покупка|покупка)\D{0,15}([\d\s]{1,8})/i,
  // "Енерджі" (often abbreviated "Ен") is reported far less consistently
  // than the other three — sometimes a whole number, sometimes one decimal
  // place (comma OR dot: "8.9", "42.2"), sometimes missing entirely when a
  // manager writes a comment instead ("завтра зріз, тривога😥"). The
  // (^|[^letter]) / (non-letter) lookaround is the same technique BOT_WORD_RE
  // uses for the "бот" trigger word — plain \b doesn't find a boundary
  // around Cyrillic in JS regex, so without it bare "ен" would also match
  // inside an unrelated word like "день".
  energy: /(?:^|[^а-яіїєґ'ʼa-z])(?:енерджі|ен)(?:$|[^а-яіїєґ'ʼa-z])\D{0,15}(\d+(?:[.,]\d{1,2})?)/i,
  // Same boundary trick as energy: matches the full "артикул"/"артикули"/
  // "артикула" stem, OR the bare short form "арт" — the boundary check on
  // the short form specifically is what stops it matching inside
  // "старт"/"чарт" etc.
  articles: /(?:^|[^а-яіїєґ'ʼa-z])(?:артикул[а-яіїєґ]*|арт)(?:$|[^а-яіїєґ'ʼa-z])\D{0,15}(\d+(?:[.,]\d{1,2})?)/i,
};
const REPORT_FIELD_BOUNDS = { revenue: [1, 10000000], customers: [1, 5000], avgCheck: [1, 100000], energy: [0.1, 100000], articles: [0.1, 20] };
const REPORT_FIELD_FLOAT = new Set(["energy", "articles"]); // the two fields real reports show with a decimal point

// Parses one raw form-field value (a plain string typed into the /zvit
// WebApp form, e.g. "117 509" or "8,9") through the exact same
// bounds/rounding rules as the free-text regex parsing above, so a number
// typed into the form and one typed into a chat message are held to
// identical rules — see handleReportFormSubmit.
function parseFieldRaw(key, raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = REPORT_FIELD_FLOAT.has(key) ? parseFloat(cleaned) : parseInt(cleaned, 10);
  const [min, max] = REPORT_FIELD_BOUNDS[key];
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// Store managers report both План (target) and Факт (actual) under the same
// field labels in one message — this pulls the FACT numbers specifically
// (the real result, not the target), since that's what a leaderboard of
// "who actually did best today" needs. Prefers whatever text comes after a
// "факт" label ("Факт", "Факт по BI", ...); a report with no План/Факт
// split at all (some stores just send one flat block) still works —
// factIdx stays -1, so the whole text is searched as-is.
function parseReportFactNumbers(text) {
  if (!text) return null;
  const factIdx = text.search(/факт/i);
  const section = factIdx >= 0 ? text.slice(factIdx) : text;
  const out = {};
  for (const [key, re] of Object.entries(REPORT_FIELD_PATTERNS)) {
    const m = section.match(re);
    if (!m) continue;
    const raw = m[1].replace(/\s/g, "");
    const n = REPORT_FIELD_FLOAT.has(key) ? parseFloat(raw.replace(",", ".")) : parseInt(raw, 10);
    const [min, max] = REPORT_FIELD_BOUNDS[key];
    if (Number.isFinite(n) && n >= min && n <= max) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}

// The mirror of parseReportFactNumbers above, for the ПЛАН half of the same
// message — only meaningful when the report actually has a план/факт split
// (a "факт" label to isolate the plan section from), so a flat report with
// no plan at all correctly yields null rather than treating the whole
// message as "plan". Adam asked for the bot to compare a store's own План
// against its Факт directly (not just today's number against this store's
// own 7-day history, which buildReportTrendComment already does) — see
// buildPlanVsFactComment below.
function parseReportPlanNumbers(text) {
  if (!text) return null;
  const factIdx = text.search(/факт/i);
  if (factIdx < 0) return null;
  const section = text.slice(0, factIdx);
  const out = {};
  for (const [key, re] of Object.entries(REPORT_FIELD_PATTERNS)) {
    const m = section.match(re);
    if (!m) continue;
    const raw = m[1].replace(/\s/g, "");
    const n = REPORT_FIELD_FLOAT.has(key) ? parseFloat(raw.replace(",", ".")) : parseInt(raw, 10);
    const [min, max] = REPORT_FIELD_BOUNDS[key];
    if (Number.isFinite(n) && n >= min && n <= max) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}

// A manager giving a heads-up that today's report is delayed ("звіту поки
// немає, скину пізніше", "без звіту сьогодні", "звіт буде пізніше", "ще
// нема звіту") rather than sending the actual report — recognized so
// trackActivity can thank them and ask for it later instead of silently
// crediting an empty heads-up message as "reported" (which used to happen:
// any message that resolves to a store code within the window counted,
// numbers or not). Matches the "звіт" word root near a
// "немає"/"нема"/"не буде"/"пізніше"/"затрим-"/"без" signal, in either
// order, tolerant of a few words between them. "нема" (the common
// colloquial short form) is listed as its own alternative rather than
// relying on it matching as a prefix of "немає" — no \b word-boundary
// trick here, since (same issue as BOT_WORD_RE elsewhere) JS regex \b
// never finds a boundary around Cyrillic at all.
const NO_REPORT_YET_RE = /зв[іi]т[а-яіїєґ]*.{0,20}(немає|нема|не\s*буде|пізніше|затрим|без)|(немає|нема|не\s*буде|пізніше|затрим|без)[а-яіїєґ]*.{0,20}зв[іi]т/i;
function detectNoReportYet(text) {
  return !!text && NO_REPORT_YET_RE.test(text);
}

const NO_REPORT_ACK_REPLIES = [
  "Дякую, що попередили! Надішли, будь ласка, звіт трохи пізніше 🙏",
  "Зрозуміло, дякую за повідомлення! Чекаємо на звіт пізніше 🙌",
  "Дякую, що дали знати! Надішли звіт, коли зможеш 🙏",
  "Добре, дякуємо за попередження! Звіт можна пізніше, без поспіху 🙌",
];

// Same heads-up problem as NO_REPORT_YET_RE above, but for the morning photo-
// reports topic ("фото пізніше скину", "фото поки немає"): without this, the
// text-only confirmation branch below (guarded by !msg.photo, for "J027 sent
// above"-style replies) would resolve the sender's own linked store via
// resolveStoreCodes' storeMembers fallback and credit a plain heads-up as a
// submitted photo report — awarding points for a photo that was never sent,
// mirroring the exact "any message that resolves to a store code counted,
// numbers or not" bug the evening-report version of this fix addressed.
const NO_PHOTO_YET_RE = /фото[а-яіїєґ]*.{0,20}(немає|нема|не\s*буде|пізніше|затрим|без)|(немає|нема|не\s*буде|пізніше|затрим|без)[а-яіїєґ]*.{0,20}фото/i;
function detectNoPhotoYet(text) {
  return !!text && NO_PHOTO_YET_RE.test(text);
}

const NO_PHOTO_ACK_REPLIES = [
  "Дякую, що попередили! Скинь, будь ласка, фото трохи пізніше 🙏",
  "Зрозуміло, дякую за повідомлення! Чекаємо на фото пізніше 🙌",
  "Дякую, що дали знати! Скинь фото, коли зможеш 🙏",
  "Добре, дякуємо за попередження! Фото можна пізніше, без поспіху 🙌",
];

function formatThousands(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatMetricNumber(n) {
  // formatThousands' digit-grouping regex isn't decimal-point-aware, so
  // route only whole numbers through it — energy's occasional decimal
  // values (8.9, 42.2) are small enough that a plain toString() is fine.
  return Number.isInteger(n) ? formatThousands(n) : n.toString();
}

// The "показники дня" line appended to the reports-window-closed message
// (see processChatSchedule) — real numbers pulled from parseReportFactNumbers
// above, not the report-count/streak bookkeeping this used to show instead.
// Returns "" when nothing was parseable that day (nobody's report had
// numbers in a recognized shape), so the caller's message isn't padded with
// an empty section. includeEnergy defaults true (used as-is on the "still
// waiting on some stores" branch below) but is turned off on the "all
// stores reported" branch, where buildEnergyChallengeLine already names
// the same day's Energy leader with its own playful framing — showing it
// twice back to back read as redundant.
function buildReportLeaderboardLine(state, day, { includeEnergy = true } = {}) {
  const metrics = (state.reportMetrics && state.reportMetrics[day]) || {};
  const entries = Object.entries(metrics);
  if (!entries.length) return "";
  const top = (field, label, unit) => {
    const ranked = entries.filter(([, m]) => typeof m[field] === "number").sort((a, b) => b[1][field] - a[1][field]);
    if (!ranked.length) return null;
    const [code, m] = ranked[0];
    return `${label}: <b>${escapeHtml(code)}</b> — ${formatMetricNumber(m[field])}${unit}`;
  };
  const lines = [
    top("revenue", "💰 Найбільший виторг", " грн"),
    top("customers", "👥 Найбільше покупців", ""),
    top("avgCheck", "💸 Найбільший середній чек", " грн"),
    includeEnergy ? top("energy", "🔋 Найвищий Енерджі", "") : null,
  ].filter(Boolean);
  if (!lines.length) return "";
  return `\n\n📊 <b>Показники дня</b>\n${lines.join("\n")}`;
}

// Adam asked for this after sending his own manual follow-up in the reports
// topic ("Вчора Район задав жару по енерджі, змагаємося сьогодні за перше
// місце? Зможе хтось «зделать» 120й?") as an example of what he wants the
// evening summary to do on its own — a playful, competitive callout. This
// message fires when TODAY's reports window closes, so the number it names
// is TODAY's real Energy leader (state.reportMetrics[day], not yesterday's —
// Adam corrected an earlier version that looked a day back) with a
// forward-looking nudge toward TOMORROW, real data instead of a made-up
// target. Energy specifically (not revenue/avgCheck) because that's what
// his own example called out. Returns "" when today has no energy numbers
// at all, so the caller's message isn't padded for nothing.
const ENERGY_CHALLENGE_PHRASES = [
  "Завтра піднажмемо ще? 🏆",
  "Завтра спробуємо перевершити? 🔥",
  "Хто завтра підніме планку ще вище? 💪",
  "Завтра є шанс закріпити результат 😉",
  "Завтра тримаємо той самий темп? 🎯",
  "Завтра йдемо ще на один рекорд? 🚀",
];
function buildEnergyChallengeLine(state, day) {
  const metrics = (state.reportMetrics && state.reportMetrics[day]) || {};
  const ranked = Object.entries(metrics)
    .filter(([, m]) => typeof m.energy === "number")
    .sort((a, b) => b[1].energy - a[1].energy);
  if (!ranked.length) return "";
  const [code, m] = ranked[0];
  const phrase = ENERGY_CHALLENGE_PHRASES[Math.floor(Math.random() * ENERGY_CHALLENGE_PHRASES.length)];
  return `\n\n🔋 Сьогодні найкращий результат по Енерджі: <b>${escapeHtml(code)}</b> — ${formatMetricNumber(m.energy)}. ${phrase}`;
}

// Varied phrasing pools for buildReportTrendComment below — same idea as
// BIRTHDAY_WISHES: general, MOTIVATING tone, not a data readout. Adam
// asked for this explicitly after seeing the first version (which named
// the exact field/percentage on every day, up or down) — a below-average
// day doesn't need a percentage put in front of the manager who sent it;
// it needs encouragement. An above-average day is real good news, still
// worth naming specifically (see REPORT_TREND_UP_PHRASES below); anything
// flat, below average, or with too little history to compare at all gets
// one of these general, always-safe-to-send phrases instead.
const REPORT_TREND_UP_PHRASES = [
  "Гарний результат, вище звичного рівня 💪",
  "Так тримати — це вище середнього за тиждень 🔥",
  "Відмінно, кращий показник, ніж зазвичай 👏",
  "Сильний день, помітно краще за звичний рівень 🚀",
];
const REPORT_TREND_GENERAL_PHRASES = [
  "Дякую за звіт! Кожен день у справі — це вже результат 🙌",
  "Дякую, що звітуєте вчасно — це справді цінно для команди 🙏",
  "Гарно попрацювали сьогодні! Дякую за звіт 🔥",
  "Дякую за звіт! Такі дні й складають хороший результат 🌟",
  "Дякую за роботу — тримаємо темп разом 💪",
  "Не всі дні однакові — головне не здаватись. Дякую за чесний звіт 🙌",
];

// Adam asked for the bot to name-drop him ("Адам", "Дістрикт менеджер",
// "бос" — his own words) as a light motivational touch on genuinely good
// moments, example he gave verbatim: "о круто, Адам точно оцінить".
// maybeDmShoutout appends one of these to a message THAT ALREADY EARNED
// it (a beaten trend, a plan hit) — never unconditionally, so it stays a
// occasional flourish instead of a tic repeated on every single report.
const DM_SHOUTOUT_PHRASES = [
  "Адам це точно оцінить 👀",
  "Бос буде задоволений таким результатом 😎",
  "Дістрикт менеджер це помітить 👏",
  "Адам такі результати любить бачити 🔥",
  "Це точно варто показати Адаму 📈",
  "Бос якраз такого і чекав 💪",
  "Адам оцінить цей рівень роботи 🙌",
  "Є чим пишатись перед Дістрикт менеджером 🏆",
  "Адаме, гляньте на це 👇",
  "Бос точно відмітить такий результат 😉",
  "Саме це любить бачити Адам 🔥",
  "Адам точно згадає цей день 📊",
  "Дістрикт менеджер оцінить старання команди 🙏",
  "Бос точно посміхнеться, побачивши це 😄",
  "Адам буде гордий такою командою 🚀",
  "Навіть бос підтримає такий результат 💯",
  "Адаме, це вам точно сподобається 😉",
  "Дістрикт менеджер це відмітить ✅",
  "Бос знає, коли команда старається 🙌",
  "Адам точно оцінить цей рух вперед 🔥",
];
function maybeDmShoutout(probability = 0.3) {
  if (Math.random() >= probability) return "";
  return " " + DM_SHOUTOUT_PHRASES[Math.floor(Math.random() * DM_SHOUTOUT_PHRASES.length)];
}

// Compares today's Факт-показники для одного магазину проти ЙОГО Ж
// власного середнього за попередні (до) 7 днів (state.reportMetrics,
// не включаючи сьогодні) — суть не в порівнянні магазинів між собою (для
// цього вже є buildReportLeaderboardLine), а в тому, чи сьогоднішній день
// кращий за звичний рівень САМЕ ЦЬОГО магазину. Free, без жодного
// AI-виклику — це спрацьовує на КОЖЕН звіт, тож платний виклик тут
// прямо суперечив би задуму "бот безкоштовний". Реальне відхилення все
// одно рахується (щоб чесно розрізнити "справді кращий день" від решти),
// але в текст потрапляє лише коли є що святкувати — конкретне число на
// поганий чи середній день замінюється на загальну мотивацію, так само як
// і коли історії замало для порівняння (замість мовчати, як у першій
// версії цієї функції — тепер ЩОРАЗУ є що відповісти, нехай і без цифр).
function buildReportTrendComment(state, day, code, numbers) {
  const pickGeneral = () => `📊 ${REPORT_TREND_GENERAL_PHRASES[Math.floor(Math.random() * REPORT_TREND_GENERAL_PHRASES.length)]}`;

  const history = [];
  let d = day;
  for (let i = 0; i < 7; i++) {
    d = prevDateStr(d);
    const m = state.reportMetrics?.[d]?.[code];
    if (m) history.push(m);
  }
  if (history.length < 2) return pickGeneral();

  const avg = (field) => {
    const vals = history.map((h) => h[field]).filter((v) => typeof v === "number");
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  const fields = [
    { key: "revenue", label: "Виторг", unit: " грн" },
    { key: "customers", label: "Покупці", unit: "" },
    { key: "avgCheck", label: "Середній чек", unit: " грн" },
  ];
  let best = null;
  for (const f of fields) {
    if (typeof numbers[f.key] !== "number") continue;
    const a = avg(f.key);
    if (!a) continue;
    const pct = ((numbers[f.key] - a) / a) * 100;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { ...f, pct, actual: numbers[f.key], avgVal: a };
  }
  if (!best) return pickGeneral();

  const rounded = Math.round(best.pct);
  if (rounded < 5) return pickGeneral(); // flat or below its own average -- stay general and warm, no number

  const phrase = REPORT_TREND_UP_PHRASES[Math.floor(Math.random() * REPORT_TREND_UP_PHRASES.length)];
  return `📊 ${best.label} сьогодні ${formatMetricNumber(best.actual)}${best.unit} — це на ${rounded}% вище звичного тижня (${formatMetricNumber(Math.round(best.avgVal))}${best.unit})! ${phrase}${maybeDmShoutout()}`;
}

// Adam asked explicitly for this: when a report has both План and Факт,
// compare execution against ITS OWN plan (not the 7-day-history comparison
// buildReportTrendComment does) and call out where to focus — an example he
// gave verbatim: "вдалося прирости по сер покупці чи виторгу, зверніть
// увагу на артикули (якщо не приросли), фокус на енерджи". Середній
// чек/виторг are the two fields with reliable, consistent parsing (see the
// comment above REPORT_FIELD_PATTERNS) so their % vs plan is shown; Энерджі
// varies too much in format store-to-store to trust a literal ratio (a
// store's plan might read "1500/12.5 грн" while fact reads "315" — same
// label, different units), so that comparison stays a plain below/at-plan
// call-out with no number attached. "Артикули" (items/complementary sales
// per receipt) is parsed too (REPORT_FIELD_PATTERNS), but buildReportCard
// now shows every Факт field's own "(NN% від плану)" suffix inline
// (including articles) — this comment no longer repeats that number, only
// the qualitative nudge when avg check missed plan (the two aren't
// mutually exclusive: articles can be reported even when avg check
// wasn't, or vice versa).
function buildPlanVsFactComment(plan, fact) {
  if (!plan || !fact) return "";
  const lines = [];

  const revenuePct = plan.revenue > 0 && typeof fact.revenue === "number" ? (fact.revenue / plan.revenue) * 100 : null;
  const avgCheckPct = plan.avgCheck > 0 && typeof fact.avgCheck === "number" ? (fact.avgCheck / plan.avgCheck) * 100 : null;

  if (avgCheckPct != null && avgCheckPct >= 100) {
    lines.push(`🎯 Середній чек виконано на ${Math.round(avgCheckPct)}% від плану — це витягує виторг вгору${maybeDmShoutout()}`);
  } else if (revenuePct != null && revenuePct >= 100) {
    lines.push(`💰 Виторг за планом (${Math.round(revenuePct)}%), навіть з нижчим середнім чеком${maybeDmShoutout()}`);
  } else if (avgCheckPct != null) {
    lines.push(`💡 Середній чек ${Math.round(avgCheckPct)}% від плану — зверніть увагу на артикули (крос-продажі до чека)`);
  }

  if (typeof plan.energy === "number" && typeof fact.energy === "number" && fact.energy < plan.energy) {
    lines.push("🔋 Фокус на Енерджі — поки нижче плану");
  }

  return lines.length ? `📊 ${lines.join("\n")}` : "";
}

// Adam asked for this directly: he wants a fill-in blank a manager can
// request from the bot (see REPORT_FORM_HTML/cmdReportForm below), fill
// with numbers, and send back — and for the bot to reply with a clean
// "published" card, branded with the store code, rather than just a bare
// trend comment tacked onto whatever text the manager typed. Reuses
// whichever numbers parseReportFactNumbers/parseReportPlanNumbers (or the
// WebApp form's own parseFieldRaw) already extracted — no new parsing
// here, just formatting what's already captured. `extra` is the existing
// trend/plan-vs-fact commentary (buildReportTrendComment/
// buildPlanVsFactComment), appended under the numbers rather than
// replacing them. `author`, when given, names who submitted it (only the
// WebApp form path passes this — Adam asked the published card show who
// sent it, not just which store).
//
// Each Факт row also gets its own "(NN% від плану)" suffix when that
// field has a plan number to compare against (plan > 0) — Adam asked for
// execution to be visible in brackets per line item, not just in the
// separate prose comment below. Telegram's HTML parse_mode has no way to
// color arbitrary text (no <span style>, no CSS at all — verified against
// the Bot API's actual supported tag list, not assumed), so the "colored
// by how far from 100%" effect Adam asked for is done with a coloured
// circle PLUS a directional arrow together (Adam asked for arrows "з
// кольором" after seeing the arrows-only version) — doubled up at the
// extremes for a rough "steeper" feel.
function pctColorEmoji(pct) {
  if (pct >= 120) return "🟢⬆️⬆️ ";
  if (pct >= 100) return "🟢⬆️ ";
  if (pct >= 90) return "🟡↘️ ";
  if (pct >= 75) return "🟠⬇️ ";
  return "🔴⬇️⬇️ ";
}
function buildReportCard(code, dateStr, plan, fact, extra, author) {
  const lines = [`📋 <b>Звіт ${escapeHtml(code)}</b> — ${formatUaDate(dateStr)}`];
  if (author) lines.push(`👤 ${escapeHtml(author)}`);
  lines.push("");
  const pctSuffix = (key) => {
    const p = plan?.[key];
    const f = fact?.[key];
    if (typeof p !== "number" || p <= 0 || typeof f !== "number") return "";
    const pct = Math.round((f / p) * 100);
    return ` (${pctColorEmoji(pct)}${pct}% від плану)`;
  };
  const section = (label, n, withPct) => {
    if (!n) return;
    const rows = [];
    if (typeof n.revenue === "number") rows.push(`💰 Виторг: ${formatMetricNumber(n.revenue)} грн${withPct ? pctSuffix("revenue") : ""}`);
    if (typeof n.customers === "number") rows.push(`👥 Покупці: ${formatMetricNumber(n.customers)}${withPct ? pctSuffix("customers") : ""}`);
    if (typeof n.avgCheck === "number") rows.push(`🛒 Серед. чек: ${formatMetricNumber(n.avgCheck)} грн${withPct ? pctSuffix("avgCheck") : ""}`);
    if (typeof n.articles === "number") rows.push(`📦 Артикул: ${n.articles}${withPct ? pctSuffix("articles") : ""}`);
    if (typeof n.energy === "number") rows.push(`🔋 Енерджі: ${formatMetricNumber(n.energy)}${withPct ? pctSuffix("energy") : ""}`);
    if (!rows.length) return;
    lines.push(`<b>${label}:</b>`, ...rows, "");
  };
  section("План", plan, false);
  section("Факт", fact, true);
  if (extra) lines.push(extra);
  return lines.join("\n").trim();
}

// The "console window" Adam asked for (his own words: "консольне вікно" —
// a form the manager just fills numbers into, not a copy-pasted text
// blank) — a Telegram Web App: a real HTML form Telegram opens as an
// in-app popup, submitted via Telegram.WebApp.sendData() rather than a
// typed message. Served straight off this same Worker (GET /reportform,
// see the fetch handler below), no separate hosting needed.
//
// Telegram only allows a `web_app` button on a message in a PRIVATE chat
// with the bot — never inside a group/forum topic — so this form is
// always opened from the manager's own DM with the bot (see
// sendReportFormButton), not from the "Звіти та показники" topic where
// /zvit or "#звіт" was actually typed. The group chat id and the reports
// topic's thread id travel with the form as URL query params and are
// echoed back inside the submitted JSON, since by the time the form is
// submitted the only chat context Telegram gives back is the private
// chat, not the group the report is actually meant for — see
// handleReportFormSubmit, which reads targetChat/targetThread from the
// payload rather than from msg.chat.
const REPORT_FORM_HTML = `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Звіт дня</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px 16px 96px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--tg-theme-bg-color, #ffffff);
    color: var(--tg-theme-text-color, #111111);
  }
  h1 { font-size: 18px; margin: 4px 0 16px; }
  .section { margin-bottom: 18px; }
  .section h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--tg-theme-hint-color, #888888);
    margin: 0 0 8px;
  }
  label { display: block; font-size: 14px; margin: 10px 0 4px; }
  input {
    width: 100%;
    font-size: 16px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--tg-theme-hint-color, #cccccc);
    background: var(--tg-theme-secondary-bg-color, #f4f4f5);
    color: var(--tg-theme-text-color, #111111);
  }
  .hint { font-size: 12px; color: var(--tg-theme-hint-color, #888888); margin-top: 4px; }
</style>
</head>
<body>
  <h1>📋 Звіт дня</h1>
  <div class="section">
    <h2>Магазин</h2>
    <input id="f-store" type="text" placeholder="напр. J104" autocapitalize="characters">
  </div>
  <div class="section">
    <h2>План</h2>
    <label for="p-revenue">Виторг, грн</label>
    <input id="p-revenue" type="text" inputmode="decimal">
    <label for="p-customers">Покупці</label>
    <input id="p-customers" type="text" inputmode="decimal">
    <label for="p-avgCheck">Середня покупка, грн</label>
    <input id="p-avgCheck" type="text" inputmode="decimal">
    <label for="p-articles">Артикул</label>
    <input id="p-articles" type="text" inputmode="decimal">
    <label for="p-energy">Енерджі</label>
    <input id="p-energy" type="text" inputmode="decimal">
  </div>
  <div class="section">
    <h2>Факт</h2>
    <label for="f-revenue">Виторг, грн</label>
    <input id="f-revenue" type="text" inputmode="decimal">
    <label for="f-customers">Покупці</label>
    <input id="f-customers" type="text" inputmode="decimal">
    <label for="f-avgCheck">Середня покупка, грн</label>
    <input id="f-avgCheck" type="text" inputmode="decimal">
    <label for="f-articles">Артикул</label>
    <input id="f-articles" type="text" inputmode="decimal">
    <label for="f-energy">Енерджі</label>
    <input id="f-energy" type="text" inputmode="decimal">
  </div>
  <p class="hint">Заповніть хоча б Факт — бот порахує % виконання плану і опублікує звіт у групі.</p>
<script>
  var tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();

  var params = new URLSearchParams(window.location.search);
  document.getElementById("f-store").value = params.get("store") || "";
  var chatParam = params.get("chat") || "";
  var threadParam = params.get("thread") || "";

  var FIELDS = ["revenue", "customers", "avgCheck", "articles", "energy"];

  function collect(prefix) {
    var out = {};
    for (var i = 0; i < FIELDS.length; i++) {
      var key = FIELDS[i];
      var el = document.getElementById(prefix + "-" + key);
      var v = el ? el.value.trim() : "";
      if (v) out[key] = v;
    }
    return out;
  }

  tg.MainButton.setText("Надіслати");
  tg.MainButton.show();
  tg.MainButton.onClick(function () {
    var store = document.getElementById("f-store").value.trim().toUpperCase();
    var fact = collect("f");
    if (!store) { tg.showAlert("Вкажіть код магазину."); return; }
    if (Object.keys(fact).length === 0) { tg.showAlert("Заповніть хоча б одне поле у Факті."); return; }
    tg.MainButton.showProgress();
    tg.sendData(JSON.stringify({
      store: store,
      targetChat: chatParam,
      targetThread: threadParam,
      plan: collect("p"),
      fact: fact
    }));
    tg.close();
  });
</script>
</body>
</html>
`;

// Matches /zvit or "#звіт" typed directly in the bot's own private chat
// (handleMessage's private-chat branch), optionally followed by a store
// code ("/zvit J104", "#звіт j104") — that code is the fallback when this
// person isn't linked to a store in any group yet (see
// handleDmReportTrigger). $1 is the code, or undefined when omitted.
const DM_REPORT_TRIGGER_RE = /^(?:\/zvit|#\s*зв[іi]т)(?:\s+([a-zа-яіїєґ0-9]+))?\s*$/i;

// The DM-typed counterpart to the group's /zvit-in-the-reports-topic flow.
// The one thing a bare private-chat message can't tell the bot is which
// GROUP (and which reports topic in it) to publish the finished card
// into — resolved here by finding a group this bot is in whose
// state.storeMembers already links this Telegram user to a store (the
// same lookup /mystore and resolveStoreCodes use elsewhere), or, when a
// store code was given explicitly, by linking them to it in whichever
// group has a reports topic bound at all. Only falls back to asking for
// the code when neither resolves — e.g. someone who's never reported
// from the group before and typed a bare "/zvit" here first.
async function handleDmReportTrigger(msg, env, selfUrl, codeArg) {
  const userId = String(msg.from.id);
  const chats = await getChatsIndex(env);
  let target = null;
  for (const gid of chats) {
    const gstate = await getState(env, gid);
    if (gstate.reportsTopic && gstate.storeMembers?.[userId]) {
      target = { chatId: gid, state: gstate };
      break;
    }
  }
  if (!target && codeArg) {
    const stores = await getStoreCodes(env);
    const match = stores.find((s) => s.code.toUpperCase() === codeArg.toUpperCase());
    if (!match) {
      await tg(env, "sendMessage", { chat_id: msg.chat.id, text: `Код магазину "${escapeHtml(codeArg)}" не знайдено. Перевірте написання (напр. /zvit J104).` });
      return;
    }
    for (const gid of chats) {
      const gstate = await getState(env, gid);
      if (gstate.reportsTopic) {
        gstate.storeMembers = gstate.storeMembers || {};
        gstate.storeMembers[userId] = match.code;
        await setState(env, gid, gstate);
        target = { chatId: gid, state: gstate };
        break;
      }
    }
  }
  if (!target) {
    await tg(env, "sendMessage", {
      chat_id: msg.chat.id,
      text: "Не знаю, до якого магазину вас прив'язати — вкажіть код у команді, напр. /zvit J104.",
    });
    return;
  }
  await sendReportFormButton(target.chatId, msg, env, selfUrl, target.state);
}

// Shared by /zvit and the "#звіт" hashtag trigger (see trackActivity
// below and handleDmReportTrigger above). DMs the requester the form
// button instead of posting it in the group, since (see REPORT_FORM_HTML's
// own comment) a `web_app` button only works in a private chat. NEVER
// posts a message into the group, success or failure — Adam flagged the
// success-case reply as spam, then flagged the once-per-day failure-case
// reply as spam too, after someone kept retyping #звіт in the reports
// topic without ever pressing Start. When the DM can't be delivered
// (Telegram refuses to let a bot message someone who has never started a
// chat with it), the only signal left is a reaction (👀) on their trigger
// message — visible to them, not a new line in the chat. Whoever can't
// figure out the 👀 has to be told about /start some other way (Adam's
// own announcement in the topic, not a bot reply).
//
// The button MUST be a `keyboard` (ReplyKeyboardMarkup) button, not an
// `inline_keyboard` one — Adam hit this live: the form opened and filled
// in fine, but "Надіслати" just spun forever. Telegram's Web App
// sendData() (what REPORT_FORM_HTML's submit button calls) only works
// for a Web App launched from a KeyboardButton; a Web App opened from an
// InlineKeyboardButton has no way to hand data back to the bot at all —
// verified against the Bot API's actual sendData docs, not assumed, after
// the inline-keyboard version shipped and silently couldn't submit.
// one_time_keyboard collapses it back to normal after one tap; safe to
// show every time since this is the person's own private chat with the
// bot, not the shared group.
async function sendReportFormButton(chatId, msg, env, selfUrl, state) {
  const known = state.storeMembers?.[String(msg.from.id)];
  const q = new URLSearchParams({ chat: String(chatId), thread: String(state.reportsTopic.threadId) });
  if (known) q.set("store", known);
  const formUrl = `${selfUrl}/reportform?${q.toString()}`;
  const res = await tg(env, "sendMessage", {
    chat_id: msg.from.id,
    text: "📋 Заповніть звіт і натисніть «Надіслати» — я опублікую результат у групі.",
    reply_markup: {
      keyboard: [[{ text: "📝 Відкрити форму звіту", web_app: { url: formUrl } }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
  if (res.ok) return;
  await tg(env, "setMessageReaction", {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    reaction: [{ type: "emoji", emoji: "👀" }],
  });
}

// The other half of sendReportFormButton above: Telegram delivers the
// form's submitted JSON as msg.web_app_data.data on a normal message in
// the user's PRIVATE chat with the bot (see handleMessage) — this reads
// the group/thread the form was opened for back out of that JSON, not out
// of msg.chat (which is the private chat, not the group). Otherwise does
// exactly what the free-text report flow further below does
// (state.reports/reportMetrics/points, buildReportCard), just sourced
// from structured fields via parseFieldRaw instead of regex-parsed text.
async function handleReportFormSubmit(msg, env) {
  let payload;
  try {
    payload = JSON.parse(msg.web_app_data.data);
  } catch {
    await replyTo(env, msg, "Не вдалося прочитати дані форми — спробуйте ще раз через /zvit у групі.");
    return;
  }
  const targetChat = Number(payload.targetChat);
  const targetThread = Number(payload.targetThread);
  if (!Number.isFinite(targetChat) || !Number.isFinite(targetThread)) {
    await replyTo(env, msg, "Форма застаріла — повторіть /zvit або #звіт у групі.");
    return;
  }
  const state = await getState(env, targetChat);
  if (!state.reportsTopic || Number(state.reportsTopic.threadId) !== targetThread) {
    await replyTo(env, msg, "Тема звітів змінилась — повторіть /zvit або #звіт у групі.");
    return;
  }
  const stores = await getStoreCodes(env);
  const code = String(payload.store || "").trim().toUpperCase();
  const match = stores.find((s) => s.code.toUpperCase() === code);
  if (!match) {
    await replyTo(env, msg, `Код магазину "${escapeHtml(code)}" не знайдено — перевірте написання і спробуйте ще раз.`);
    return;
  }
  const parseSection = (obj) => {
    if (!obj) return null;
    const out = {};
    for (const key of Object.keys(REPORT_FIELD_PATTERNS)) {
      const n = parseFieldRaw(key, obj[key]);
      if (n != null) out[key] = n;
    }
    return Object.keys(out).length ? out : null;
  };
  const planNumbers = parseSection(payload.plan);
  const numbers = parseSection(payload.fact);
  if (!numbers) {
    await replyTo(env, msg, "Не вказано жодного показника у Факті — спробуйте ще раз.");
    return;
  }

  const nowInfo = kyivNow(Date.now());
  const day = nowInfo.dateStr;
  state.storeMembers = state.storeMembers || {};
  state.storeMembers[String(msg.from.id)] = match.code;
  state.reports = state.reports || {};
  state.reports[day] = state.reports[day] || {};
  if (!state.reports[day][match.code]) {
    state.reports[day][match.code] = true;
    addPoints(state, msg.from, POINTS.eveningReport);
  }
  let trendComment = null;
  try {
    trendComment = (planNumbers && buildPlanVsFactComment(planNumbers, numbers)) || buildReportTrendComment(state, day, match.code, numbers);
  } catch (err) {
    console.error("handleReportFormSubmit: buildReportTrendComment failed", err);
  }
  state.reportMetrics = state.reportMetrics || {};
  state.reportMetrics[day] = state.reportMetrics[day] || {};
  state.reportMetrics[day][match.code] = { ...numbers, ts: Date.now() };
  if (typeof numbers.energy === "number") {
    recordTopicMention(state, "energy", match.code, day);
  }
  await setState(env, targetChat, state);
  // tg() never throws on a Telegram-side failure (bad chat/thread, rate
  // limit, etc.) — it just returns {ok: false, ...} and logs. This used
  // to be awaited and ignored, so a failed group post still told the
  // requester "✅ Дякую! Звіт опубліковано в групі." even though nothing
  // was posted — Adam hit exactly this (data saved, DM said success, no
  // card ever showed up in the group). Now actually checks the result and
  // says so honestly, including Telegram's own error text so it can be
  // relayed for debugging instead of vanishing into server-side logs
  // nobody watching this session can read.
  try {
    const card = buildReportCard(match.code, day, planNumbers, numbers, trendComment, displayName(msg.from));
    const sendRes = await tg(env, "sendMessage", withThread({ chat_id: targetChat, text: card, parse_mode: "HTML" }, targetThread));
    if (sendRes.ok) {
      await replyTo(env, msg, "✅ Дякую! Звіт опубліковано в групі.");
    } else {
      await replyTo(env, msg, `Дані звіту збережено, але не вдалося опублікувати картку в групі: ${sendRes.description || "невідома помилка Telegram"}. Спробуйте /zvit ще раз.`);
    }
  } catch (err) {
    console.error("handleReportFormSubmit: sending report card failed", err);
    await replyTo(env, msg, "Дані звіту збережено, але сталася помилка при публікації картки в групі. Спробуйте /zvit ще раз.");
  }
}

// A message that's JUST the hashtag "#звіт" (optionally "# звіт", any
// case), typed on its own in the reports topic — Adam's own trigger word
// for opening the /zvit form. Deliberately anchored start-to-end so a real
// report that happens to mention "звіт" in passing is never mistaken for
// this — only an otherwise-empty "#звіт" message matches.
const HASHTAG_REPORT_RE = /^#\s*зв[іi]т\s*$/i;

async function trackActivity(chatId, msg, env, selfUrl) {
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

  // Rolling short-term context for the @-mention/"бот" AI reply feature
  // (askBotAI) — piggybacks on this function's own setState below, so it
  // costs no extra Firestore write, just a little more data on one that
  // already happens on every message. Capped small on purpose.
  state.recentMessages = state.recentMessages || [];
  const mediaLabel = msg.photo ? "[фото]" : msg.document ? "[документ]" : msg.voice ? "[голосове]" : (msg.video || msg.video_note) ? "[відео]" : msg.sticker ? "[стікер]" : "[повідомлення]";
  state.recentMessages.push({ name: displayName(msg.from), text: truncateText(activityText || mediaLabel, 200) });
  if (state.recentMessages.length > ASK_BOT_CONTEXT_MESSAGES) state.recentMessages = state.recentMessages.slice(-ASK_BOT_CONTEXT_MESSAGES);

  // "Найпопулярніший контент" (/topcontent, і рядок у щотижневому
  // дайджесті нижче) — реакції на фото/відео від будь-кого, КРІМ самого
  // District Manager'а. Виключення за Telegram-роллю "creator"
  // (getChatCreatorId), а не за іменем у профілі — стабільніше й не
  // залежить від того, кирилицею чи латиницею записане ім'я. Реакції самі
  // заповнюються пізніше через handleMessageReactionCount, як і для
  // congratsTracked/photoContest вище. Обмежено фото/відео (не звичайний
  // текст) — саме на них реально ставлять реакції в робочому чаті, і це
  // тримає розмір стану чату розумним навіть у дуже активному чаті.
  if (msg.photo || msg.video) {
    try {
      const creatorId = await getChatCreatorId(env, chatId, state);
      if (userId !== creatorId) {
        state.contentReactions = state.contentReactions || {};
        state.contentReactions[msg.message_id] = {
          userId, name: displayName(msg.from), type: msg.photo ? "фото" : "відео", day, reactions: 0,
        };
        pruneContentReactions(state, nowInfo);
      }
    } catch (err) {
      console.error("trackActivity: content-reaction tracking failed", err);
    }
  }

  // "Виклики по темах" (7 код / Енерджі / Комплексні продажі / Б2Б /
  // Розпродаж) — Adam asked the bot to notice who talks about which
  // technique, tied to their store, and nudge stores that have been
  // quieter about it once several mentions land close together. Only
  // counts messages from someone whose store is already known
  // (state.storeMembers) — "less active" is meaningless to compare
  // otherwise — and excludes the District Manager, same as every other
  // per-store leaderboard in this file (getChatCreatorId).
  try {
    const topics = detectSalesTopics(activityText);
    if (topics.length) {
      const creatorId = await getChatCreatorId(env, chatId, state);
      const storeCode = state.storeMembers?.[key];
      if (userId !== creatorId && storeCode) {
        pruneTopicMentions(state, nowInfo);
        const stores = await getStoreCodes(env);
        for (const topicKey of topics) {
          recordTopicMention(state, topicKey, storeCode, day);
          const burst = recordBurstEvent(state, topicKey, storeCode, now);
          if (shouldFireTopicChallenge(burst, now)) {
            const text = buildTopicDigestMessage(state, stores);
            if (text) {
              try {
                // Adam asked for this to always land in the Активність topic,
                // not wherever the triggering burst of mentions happened to
                // be posted (falls back to that only if no topic is bound).
                await tg(env, "sendMessage", withThread({ chat_id: chatId, text, parse_mode: "HTML" }, state.activityTopic?.threadId ?? msg.message_thread_id));
              } catch (err) {
                console.error("trackActivity: topic challenge send failed", err);
              }
            }
            burst.lastChallengeTs = now;
            burst.events = [];
          }
        }
      }
    }
  } catch (err) {
    console.error("trackActivity: sales-topic challenge tracking failed", err);
  }

  if (state.reportsTopic && msg.message_thread_id === state.reportsTopic.threadId && msg.text && HASHTAG_REPORT_RE.test(msg.text.trim())) {
    await sendReportFormButton(chatId, msg, env, selfUrl, state);
  } else if (state.reportsTopic && msg.message_thread_id === state.reportsTopic.threadId) {
    const window = state.reportsWindow || DEFAULT_REPORTS_WINDOW;
    if (nowInfo.hhmm >= window.start && nowInfo.hhmm <= graceEnd(window)) {
      const stores = await getStoreCodes(env);
      const codes = resolveStoreCodes(msg, msg.text, stores, state);
      if (codes.length) {
        state.reports = state.reports || {};
        state.reports[day] = state.reports[day] || {};
        // Read the actual numbers out of the report text (revenue,
        // customers, average check, energy — see parseReportFactNumbers),
        // not just whether someone reported at all — this is what lets
        // buildReportLeaderboardLine name the real best-performing store
        // instead of only counting who showed up. If the text/caption had
        // nothing recognizable and a photo was sent instead (a screenshot
        // of the POS/BI system), try reading the numbers off the image —
        // see extractReportNumbersFromPhoto.
        let numbers = parseReportFactNumbers(msg.text || msg.caption || "");
        if (!numbers && msg.photo?.length) {
          numbers = await extractReportNumbersFromPhoto(env, msg);
        }
        // A heads-up that the report is coming later ("звіту поки немає,
        // скину пізніше") is NOT the report itself — only checked when no
        // numbers were found at all, so a real report that happens to also
        // mention "пізніше" in a side comment still counts normally. Skips
        // marking state.reports/awarding points entirely for this message,
        // so the store correctly still shows as outstanding at window-close
        // (see processChatSchedule's already-gentle "ще чекаємо" wording)
        // instead of being silently credited for a message with no report
        // in it at all.
        if (!numbers && detectNoReportYet(msg.text || msg.caption || "")) {
          try {
            await tg(env, "sendMessage", withThread({
              chat_id: chatId,
              text: NO_REPORT_ACK_REPLIES[Math.floor(Math.random() * NO_REPORT_ACK_REPLIES.length)],
              reply_to_message_id: msg.message_id,
            }, msg.message_thread_id));
          } catch (err) {
            console.error("trackActivity: no-report heads-up reply failed", err);
          }
        } else {
          for (const c of codes) {
            if (!state.reports[day][c]) {
              state.reports[day][c] = true;
              addPoints(state, msg.from, POINTS.eveningReport);
            }
            if (numbers) {
              // Compare against the PRIOR week's own history before this
              // report overwrites today's entry — buildReportTrendComment
              // only ever looks at days before `day` anyway, but computing
              // it first keeps the "what came before today" intent obvious.
              let trendComment = null;
              const planNumbers = parseReportPlanNumbers(msg.text || msg.caption || "");
              try {
                trendComment = (planNumbers && buildPlanVsFactComment(planNumbers, numbers)) || buildReportTrendComment(state, day, c, numbers);
              } catch (err) {
                console.error("trackActivity: buildReportTrendComment failed", err);
              }
              state.reportMetrics = state.reportMetrics || {};
              state.reportMetrics[day] = state.reportMetrics[day] || {};
              state.reportMetrics[day][c] = { ...numbers, ts: now };
              // A report with an Енерджі number in it is real engagement with
              // that topic whether it arrived as typed text or a photo read
              // via extractReportNumbersFromPhoto — but detectSalesTopics
              // above only scans msg.text/caption, so a photo report (no
              // caption) never counted toward topicMentions.energy even
              // though reportMetrics shows the store reporting it every day.
              // Adam caught this directly: the automatic topic-challenge
              // message named stores as "least mentioned Енерджі" that
              // actually report it every day.
              // Recorded into the history only (not recordBurstEvent) — every
              // report window would otherwise trigger a burst on its own,
              // drowning out the genuine chat-buzz signal that feature is for.
              if (typeof numbers.energy === "number") {
                recordTopicMention(state, "energy", c, day);
              }
              try {
                const card = buildReportCard(c, day, planNumbers, numbers, trendComment);
                await tg(env, "sendMessage", withThread({
                  chat_id: chatId, text: card, parse_mode: "HTML", reply_to_message_id: msg.message_id,
                }, msg.message_thread_id));
              } catch (err) {
                console.error("trackActivity: sending report card failed", err);
              }
            }
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
      // A heads-up ("фото пізніше скину") is NOT a confirmation — checked
      // BEFORE resolving/crediting a store, so it never gets silently
      // counted as a submitted report (see detectNoPhotoYet above).
      if (detectNoPhotoYet(msg.text)) {
        try {
          await tg(env, "sendMessage", withThread({
            chat_id: chatId,
            text: NO_PHOTO_ACK_REPLIES[Math.floor(Math.random() * NO_PHOTO_ACK_REPLIES.length)],
            reply_to_message_id: msg.message_id,
          }, msg.message_thread_id));
        } catch (err) {
          console.error("trackActivity: no-photo heads-up reply failed", err);
        }
      } else {
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
  // Same "not competing on his own leaderboard" exclusion as /rating,
  // /topcontent, and the activity digests — Telegram "creator" role.
  const creatorId = String(await getChatCreatorId(env, chatId, state));
  const rows = Object.entries(totals).filter(([uid]) => uid !== creatorId).sort((a, b) => b[1] - a[1]).slice(0, 10);
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
  // District Manager isn't competing for a spot on a leaderboard he's the
  // one running — excluded by Telegram's "creator" role (same
  // getChatCreatorId used for /topcontent), not by name, so this doesn't
  // depend on how his profile happens to be spelled.
  const creatorId = String(await getChatCreatorId(env, chatId, state));
  const rows = Object.entries(points).filter(([uid]) => uid !== creatorId).sort((a, b) => b[1] - a[1]).slice(0, 10);
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

// ------------------------------------------------------------------ menu --
// /menu — a tappable alternative to typing commands, per the "зрозуміла
// навігація: кнопки, quick replies" ask: Telegram inline keyboards, not a
// new concept, just wired to the read-only commands people actually reach
// for often. Every button reuses the SAME handler the equivalent /command
// calls — no duplicated logic, no risk of the two drifting apart.
const MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "🏆 Рейтинг", callback_data: "menu:rating" }, { text: "🔥 Стріки", callback_data: "menu:streaks" }],
    [{ text: "🏪 Мій магазин", callback_data: "menu:mystore" }, { text: "❓ Довідка", callback_data: "menu:help" }],
    [{ text: "🏬 Магазини дистрикту", callback_data: "menu:stores" }],
  ],
};

async function cmdMenu(chatId, msg, env) {
  await tg(env, "sendMessage", withThread({
    chat_id: chatId,
    text: "📋 <b>Швидке меню</b>\nОберіть, що показати 👇",
    parse_mode: "HTML",
    reply_markup: MENU_KEYBOARD,
  }, msg.message_thread_id ?? null));
}

// /stores — the exact same real roster (code, name, manager) matchFreeIntent
// already answers ask-bot questions like "хто керуючий J104" from
// (getStoreRoster/staffing-stores — same data the dashboard shows), exposed
// as a plain read command too so it doesn't require phrasing a question
// just right. Public, not admin-only — this is read-only reference info.
async function cmdStores(chatId, env, threadId) {
  const stores = await getStoreRoster(env);
  const usable = (stores || []).filter((s) => s.code);
  if (!usable.length) {
    await tg(env, "sendMessage", withThread({ chat_id: chatId, text: "Наразі немає даних про магазини дистрикту в базі." }, threadId));
    return;
  }
  const lines = usable.map((s) => {
    const name = s.name ? ` — ${escapeHtml(s.name)}` : "";
    const sm = s.sm ? `\n   Керуючий: ${escapeHtml(s.sm)}` : "";
    return `<b>${escapeHtml(s.code)}</b>${name}${sm}`;
  });
  await tg(env, "sendMessage", withThread({
    chat_id: chatId,
    text: `🏬 <b>Магазини дистрикту (${usable.length})</b>\n\n${lines.join("\n\n")}`,
    parse_mode: "HTML",
  }, threadId));
}

// A tap on a /menu button arrives as a `callback_query` update (not a
// message) — Telegram requires every one to be answered via
// answerCallbackQuery or the tapping client's button spinner just hangs;
// the `finally` guarantees that even if the underlying action throws.
async function handleCallbackQuery(cq, env) {
  const chatId = cq.message?.chat?.id;
  const threadId = cq.message?.message_thread_id ?? null;
  try {
    if (!chatId || !cq.data?.startsWith("menu:")) return;
    const action = cq.data.slice("menu:".length);
    if (action === "rating") await sendRating(chatId, env);
    else if (action === "streaks") await cmdStreaks(chatId, env);
    else if (action === "help") await tg(env, "sendMessage", { chat_id: chatId, text: HELP_TEXT });
    else if (action === "mystore") {
      await tg(env, "sendMessage", withThread({
        chat_id: chatId,
        text: "Напишіть /mystore J104 (свій код магазину) — прив'яжете себе, і звіти зараховуватимуться навіть без коду в тексті.",
      }, threadId));
    }
    else if (action === "stores") await cmdStores(chatId, env, threadId);
  } finally {
    await tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
  }
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

// A text_mention entity is a REAL, resolved Telegram contact (Telegram
// only creates this entity type when the author picked an actual member
// from the @-mention dropdown) — carries e.user.id directly, unlike a
// plain "mention" (someone just typed "@username" as text, which Telegram
// doesn't resolve to a user object at all). That id is what lets
// maybeResolvePendingBirthdayFromMention below learn who a not-yet-
// identified birthday greeting was actually for.
function extractCongratsMention(msg) {
  for (const e of msg.entities || []) {
    if (e.type === "text_mention" && e.user) return { name: displayName(e.user), userId: e.user.id };
  }
  for (const e of msg.entities || []) {
    if (e.type === "mention") return { name: msg.text.substr(e.offset, e.length), userId: null };
  }
  return null;
}

function extractCongratsName(msg) {
  return extractCongratsMention(msg)?.name || null;
}

// Learned once (see maybeResolvePendingBirthdayFromMention), remembered
// forever — findMemberUserId checks this before any name-matching at all,
// so this same person is never guessed at again for future birthdays.
function learnBirthdayLink(state, firstName, lastName, uid) {
  if (!uid) return;
  state.birthdayLearnedLinks = state.birthdayLearnedLinks || {};
  state.birthdayLearnedLinks[birthdayLookupKey(firstName, lastName)] = String(uid);
}

// When sendBirthdayGreetings couldn't confidently match today's birthday
// person to a chat member, it still posts the greeting un-tagged and
// remembers the message id (state.birthdayGreeting.pending — see there).
// If someone then posts a birthday-congrats message that @mentions a
// specific REAL member (a resolved text_mention, not just typed
// "@username" text) and there's currently exactly one such pending,
// unresolved birthday, that mentioned member IS who was being wished
// happy birthday — a congrats message addresses the person being
// congratulated, not the sender. More than one pending birthday at once
// is left alone (ambiguous which one this refers to) rather than guessed.
function maybeResolvePendingBirthdayFromMention(state, category, mentionedUid) {
  if (category !== "birthday" || !mentionedUid) return;
  const pending = state.birthdayGreeting?.pending;
  if (!pending) return;
  const entries = Object.entries(pending);
  if (entries.length !== 1) return;
  const [mid, p] = entries[0];
  learnBirthdayLink(state, p.firstName, p.lastName, mentionedUid);
  delete pending[mid];
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
  const category = detectCongratsCategory(msg.text);
  const replyText = buildCongratsReply(msg);
  if (!replyText) return;

  const state = await getState(env, chatId);

  // Someone else's birthday-congrats message can teach us who a pending,
  // not-yet-identified birthday greeting was for (see the function below)
  // — independent of congratsEnabled, which only toggles the BOT'S OWN
  // reply further down, not this.
  maybeResolvePendingBirthdayFromMention(state, category, extractCongratsMention(msg)?.userId);
  if (state.congratsEnabled === false) {
    await setState(env, chatId, state); // still persist any birthday link just learned above
    return;
  }

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

// Reaction totals on tracked congrats messages AND photo-contest entries
// (message_reaction_count — an aggregate update, no per-reactor identity,
// so no extra privacy exposure; also how /photocontest counts votes, since
// a Telegram poll's answer options are plain text and can't show a photo
// per choice). Silently a no-op if the message is neither (e.g. reactions
// on an unrelated message).
async function handleMessageReactionCount(mrc, env) {
  const chatId = mrc.chat.id;
  const state = await getState(env, chatId);
  const total = (mrc.reactions || []).reduce((sum, r) => sum + (r.total_count || 0), 0);
  let touched = false;
  const tracked = state.congratsTracked?.[mrc.message_id];
  if (tracked) {
    tracked.reactions = total;
    touched = true;
  }
  const entry = state.photoContest?.entries?.[mrc.message_id];
  if (entry) {
    entry.reactions = total;
    touched = true;
  }
  const content = state.contentReactions?.[mrc.message_id];
  if (content) {
    content.reactions = total;
    touched = true;
  }
  if (touched) await setState(env, chatId, state);
}

// Resolves and CACHES (state.chatCreatorId) the chat's creator user id —
// one Telegram call per chat, not one per message — so trackActivity's
// content-reaction tracking above can exclude the District Manager's own
// posts without a live API call on every single photo/video. Deliberately
// NOT cached on a failed lookup (network hiccup, rate limit) — leaving it
// undefined means the next message just retries instead of this staying
// permanently broken.
async function getChatCreatorId(env, chatId, state) {
  if (state.chatCreatorId !== undefined) return state.chatCreatorId;
  const res = await tg(env, "getChatAdministrators", { chat_id: chatId });
  if (!res?.ok) return null;
  const creator = (res.result || []).find((m) => m.status === "creator");
  state.chatCreatorId = creator ? creator.user.id : null;
  return state.chatCreatorId;
}

const CONTENT_REACTIONS_MAX_AGE_DAYS = 14;

// Drops contentReactions entries older than CONTENT_REACTIONS_MAX_AGE_DAYS
// — same idea as pruneCongratsTracked right below, needed even more here
// since this tracks every photo/video (not just detected congrats
// messages), so it could otherwise grow much faster in an active chat.
function pruneContentReactions(state, now) {
  if (!state.contentReactions) return;
  const cutoff = daysAgoStr(now.dateStr, CONTENT_REACTIONS_MAX_AGE_DAYS);
  for (const [msgId, c] of Object.entries(state.contentReactions)) {
    if (c.day < cutoff) delete state.contentReactions[msgId];
  }
}

// -------------------------------------------------------- topic challenges --
// state.topicMentions: { [topicKey]: { [storeCode]: { [day]: count } } } —
// one counter per store per topic per day, so pruning is just dropping old
// day-keys (same shape/idea as state.stats, just topic- and store-keyed
// instead of chat-wide). "Total mentions in the trailing window" is simply
// the sum of whatever day-keys survive pruning.
function pruneTopicMentions(state, now) {
  if (!state.topicMentions) return;
  const cutoff = daysAgoStr(now.dateStr, TOPIC_MENTION_MAX_AGE_DAYS);
  for (const byStore of Object.values(state.topicMentions)) {
    for (const byDay of Object.values(byStore)) {
      for (const day of Object.keys(byDay)) {
        if (day < cutoff) delete byDay[day];
      }
    }
  }
}

function recordTopicMention(state, topicKey, storeCode, day) {
  state.topicMentions = state.topicMentions || {};
  state.topicMentions[topicKey] = state.topicMentions[topicKey] || {};
  state.topicMentions[topicKey][storeCode] = state.topicMentions[topicKey][storeCode] || {};
  const byDay = state.topicMentions[topicKey][storeCode];
  byDay[day] = (byDay[day] || 0) + 1;
}

function topicMentionTotal(state, topicKey, storeCode) {
  const byDay = state.topicMentions?.[topicKey]?.[storeCode];
  if (!byDay) return 0;
  return Object.values(byDay).reduce((a, b) => a + b, 0);
}

// state.topicBurst: { [topicKey]: { events: [{ts, storeCode}], lastChallengeTs } }
// `events` is trimmed to the rolling window on every push, so it never
// grows past a handful of entries — this is a short-lived detector, not a
// history (topicMentions above is the actual history).
function recordBurstEvent(state, topicKey, storeCode, nowMs) {
  state.topicBurst = state.topicBurst || {};
  state.topicBurst[topicKey] = state.topicBurst[topicKey] || { events: [], lastChallengeTs: 0 };
  const b = state.topicBurst[topicKey];
  b.events.push({ ts: nowMs, storeCode });
  b.events = b.events.filter((e) => nowMs - e.ts <= TOPIC_BURST_WINDOW_MS);
  return b;
}

function shouldFireTopicChallenge(burst, nowMs) {
  if (nowMs - (burst.lastChallengeTs || 0) < TOPIC_CHALLENGE_COOLDOWN_MS) return false;
  if (burst.events.length < TOPIC_BURST_THRESHOLD) return false;
  const distinctStores = new Set(burst.events.map((e) => e.storeCode));
  return distinctStores.size >= TOPIC_BURST_MIN_STORES;
}

// The store with the highest topic-mention total in the trailing window —
// null if nobody has mentioned this topic at all yet.
function pickTopStore(state, topicKey, stores) {
  const ranked = stores
    .map((s) => ({ code: s.code, total: topicMentionTotal(state, topicKey, s.code) }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);
  return ranked[0] || null;
}

// Adam asked for this directly after seeing the old version (which only
// named ONE topic's laggards — "найменше згадували Енерджі"): instead show
// the current LEADER for EVERY tracked sales topic (7-й код / Комплексні
// продажі / Енерджі / Б2Б / Розпродаж) in a single digest — "найбільше
// згадок енерджи, найбільше комплексів, найбільше 7 код" was his own
// example. A positive leaderboard across all topics, not a "you're behind"
// callout on whichever one topic's burst happened to fire. Still triggered
// by the same burst detector (one topic crossing TOPIC_BURST_THRESHOLD,
// see shouldFireTopicChallenge) — only what the message SAYS changed, not
// when it fires. Topics nobody has mentioned in the window are skipped
// (pickTopStore returns null) rather than padding the message with "—".
function buildTopicDigestMessage(state, stores) {
  const lines = [];
  for (const [topicKey, topic] of Object.entries(SALES_TOPICS)) {
    const top = pickTopStore(state, topicKey, stores);
    if (top) lines.push(`${topic.emoji} Найбільше згадок «${escapeHtml(topic.label)}»: <b>${escapeHtml(top.code)}</b> (${top.total})`);
  }
  if (!lines.length) return null;
  const phrase = TOPIC_CHALLENGE_PHRASES[Math.floor(Math.random() * TOPIC_CHALLENGE_PHRASES.length)];
  return `📢 <b>Тема дня в чаті!</b>\n\nЗа останні ${TOPIC_MENTION_MAX_AGE_DAYS} днів:\n${lines.join("\n")}\n\n${phrase}`;
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
  let changed = false;

  const tracked = state.trackedAcks?.[mr.message_id];
  if (tracked) {
    tracked.reactedBy = tracked.reactedBy || {};
    if (!tracked.reactedBy[String(mr.user.id)]) {
      tracked.reactedBy[String(mr.user.id)] = displayName(mr.user);
      changed = true;
    }
  }

  // Feedback loop for AI ask-bot replies (see cmdAskBot, which records an
  // entry here right after sending): 👍-type reactions mark it good, 👎-type
  // mark it worth reviewing later via /askbotfeedback — a fast, free
  // substitute for a proper thumbs-up/down button, since Telegram bots
  // can't attach inline callback data to a plain sendMessage this simply.
  const askbotEntry = state.askBotReplies?.[mr.message_id];
  if (askbotEntry) {
    const emojis = mr.new_reaction.map((r) => r.emoji).filter(Boolean);
    let sentiment = null;
    if (emojis.some((e) => ASKBOT_NEGATIVE_EMOJI.has(e))) sentiment = "down";
    else if (emojis.some((e) => ASKBOT_POSITIVE_EMOJI.has(e))) sentiment = "up";
    if (sentiment) {
      askbotEntry.reactions = askbotEntry.reactions || {};
      if (askbotEntry.reactions[String(mr.user.id)] !== sentiment) {
        askbotEntry.reactions[String(mr.user.id)] = sentiment;
        changed = true;
      }
    }
  }

  if (changed) await setState(env, chatId, state);
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
  "🔔 Невеличке нагадування",
  "🔔 Про всяк випадок нагадуємо",
  "🔔 Не забуваємо, будь ласка",
  "🔔 Дружньо нагадуємо ще раз",
  "🔔 Швидке нагадування",
  "🔔 Коротко нагадуємо",
  "🔔 Тримаємо в полі зору",
  "🔔 Про це варто пам'ятати",
  "🔔 Ще один пункт на контролі",
  "🔔 Нагадуємо про це ще раз",
  "🔔 На контролі, як завжди",
  "🔔 Просимо не забути",
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

// Adam's own request: a dedicated topic ("Хіхоньки та хахаоньки") where the
// bot itself posts something funny/lighthearted on a schedule — separate
// from every other topic here, which is all work content. He explicitly
// ruled out pulling real meme images off the internet (no way to moderate
// that content before it lands in a work chat with his own subordinates in
// it) in favor of AI-written text jokes only — see buildFunnyPost/
// FUNNY_POST_SYSTEM_PROMPT below and processChatSchedule's state.funTopic
// block for the actual posting trigger (weekdays at 13:00).
async function cmdSetFunTopic(chatId, msg, env) {
  if (msg.message_thread_id == null) {
    await replyTo(env, msg, "Цю команду треба написати всередині потрібної теми форуму (напр. «Хіхоньки та хахаоньки»), а не в General.");
    return;
  }
  const state = await getState(env, chatId);
  state.funTopic = { threadId: msg.message_thread_id };
  await setState(env, chatId, state);
  await addToChatsIndex(env, chatId);
  await tg(env, "sendMessage", {
    chat_id: chatId,
    message_thread_id: msg.message_thread_id,
    text: "✅ Ця тема встановлена для веселих постів. У будні о 13:00 бот сам публікує сюди короткий жарт — щоразу новий, генерує AI. Без картинок і мемів з інтернету — лише текст.",
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
  // District Manager isn't competing for a spot on a leaderboard he's the
  // one running — excluded by Telegram's "creator" role (same
  // getChatCreatorId used for /topcontent/sendRating), not by name.
  const creatorId = String(await getChatCreatorId(env, chatId, state));
  const all = Object.entries(pointsMap).filter(([uid, pts]) => pts > 0 && uid !== creatorId).sort((a, b) => b[1] - a[1]);
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

  // District Manager isn't competing for a spot on a leaderboard he's the
  // one running — excluded by Telegram's "creator" role, same as the
  // daily digest/sendRating/topcontent.
  const creatorId = String(await getChatCreatorId(env, chatId, state));
  const totals = sumPointsByDay(state, days);
  const topPeople = Object.entries(totals).filter(([uid, p]) => p > 0 && uid !== creatorId).sort((a, b) => b[1] - a[1]).slice(0, 3);
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

  pruneContentReactions(state, now);
  const contentThisWeek = Object.values(state.contentReactions || {}).filter((c) => weekSet.has(c.day) && c.reactions > 0);
  contentThisWeek.sort((a, b) => b.reactions - a.reactions);
  if (contentThisWeek.length) {
    lines.push("");
    lines.push(`🔥 Найпопулярніший контент тижня: ${escapeHtml(contentThisWeek[0].name)} (${contentThisWeek[0].type}, ${contentThisWeek[0].reactions} реакцій)`);
  }

  lines.push("");
  lines.push(WEEKLY_MOTIVATION[Math.floor(Math.random() * WEEKLY_MOTIVATION.length)]);

  await tg(env, "sendMessage", withThread({ chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" }, threadId));
}

// End-of-month winner announcement, per Adam's own request: he personally
// gives the top scorer of the month a prize. Ranks the SAME cumulative
// points sumPointsByDay/monthToDateDays already compute for the Friday
// progress digest — by the last day of the month those two totals are
// identical, this just calls out the #1 spot specifically instead of a
// top-10 list. No prize amount/kind is named here (Adam hasn't specified
// one) — just the announcement that one's coming from him.
async function sendMonthWinnerAnnouncement(chatId, env, state, now) {
  const threadId = state.activityTopic.threadId;
  const creatorId = String(await getChatCreatorId(env, chatId, state));
  const totals = sumPointsByDay(state, monthToDateDays(now));
  const ranked = Object.entries(totals).filter(([uid, p]) => p > 0 && uid !== creatorId).sort((a, b) => b[1] - a[1]);
  const monthLabel = MONTH_NAMES_UA[Number(now.month.slice(5, 7)) - 1];
  if (!ranked.length) {
    await tg(env, "sendMessage", withThread({
      chat_id: chatId, text: `🏆 Місяць (${monthLabel}) завершено, але активності зафіксовано не було — цього разу без переможця.`,
    }, threadId));
    return;
  }
  const [winnerUid, winnerPts] = ranked[0];
  const winnerName = escapeHtml(state.names?.[winnerUid] || winnerUid);
  await tg(env, "sendMessage", withThread({
    chat_id: chatId,
    text: `🏆🎉 <b>Переможець місяця — ${monthLabel}!</b>\n\n${winnerName} — ${winnerPts} балів за активність цього місяця!\n\n🎁 Адам особисто готує приз переможцю — вітаємо і дякуємо за чудову роботу! 👏`,
    parse_mode: "HTML",
  }, threadId));
}

// /topcontent — on-demand version of the weekly digest's "найпопулярніший
// контент" line above, but over the full tracked window
// (CONTENT_REACTIONS_MAX_AGE_DAYS, currently 14 days) rather than just the
// past calendar week, and showing more than one entry.
async function cmdTopContent(chatId, env) {
  const state = await getState(env, chatId);
  const now = kyivNow(Date.now());
  pruneContentReactions(state, now);
  await setState(env, chatId, state); // persist the prune even when nothing else below changes

  const ranked = Object.values(state.contentReactions || {}).filter((c) => c.reactions > 0).sort((a, b) => b.reactions - a.reactions).slice(0, 5);
  if (!ranked.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: `Поки що немає фото чи відео з реакціями за останні ${CONTENT_REACTIONS_MAX_AGE_DAYS} днів.` });
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  const lines = [`🔥 <b>Найпопулярніший контент (останні ${CONTENT_REACTIONS_MAX_AGE_DAYS} днів)</b>`, ""];
  ranked.forEach((c, i) => lines.push(`${medals[i] || `${i + 1}.`} ${escapeHtml(c.name)} — ${c.type}, ${c.reactions} реакцій`));
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
}

// Manual status view for "Виклики по темах" (see trackActivity) — shows
// each topic's top-3 stores by mention count in the trailing window,
// without waiting for a burst to trigger a challenge.
async function cmdTopicActivity(chatId, env) {
  const state = await getState(env, chatId);
  const now = kyivNow(Date.now());
  pruneTopicMentions(state, now);
  await setState(env, chatId, state); // persist the prune even when nothing else below changes

  const stores = await getStoreCodes(env);
  const medals = ["🥇", "🥈", "🥉"];
  const lines = [`📊 <b>Активність по темах (останні ${TOPIC_MENTION_MAX_AGE_DAYS} днів)</b>`];
  for (const [topicKey, topic] of Object.entries(SALES_TOPICS)) {
    const ranked = stores
      .map((s) => ({ code: s.code, total: topicMentionTotal(state, topicKey, s.code) }))
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    lines.push("", `<b>${escapeHtml(topic.label)}</b>`);
    if (!ranked.length) {
      lines.push("Поки немає згадувань.");
    } else {
      ranked.forEach((s, i) => lines.push(`${medals[i] || `${i + 1}.`} ${escapeHtml(s.code)} — ${s.total}`));
    }
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
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

// ------------------------------------------------------ photo contest -----
// /photocontest — a UGC photo competition ("найкраще оформлення вітрини",
// "найкращий вихованець" etc.), voted on with reactions rather than a
// Telegram poll: poll answer OPTIONS are plain text, so a poll simply
// can't show a photo per choice — reactions directly on each entry's own
// photo message are the only way to "vote for this specific picture"
// without a paid API. Same aggregate-reaction-count mechanism the congrats
// digest already uses (message_reaction_count — no per-reactor identity,
// already in WEBHOOK_ALLOWED_UPDATES, nothing new to register).
// One active contest per chat at a time (state.photoContest) — a real
// district-manager competition here is an occasional, deliberate event,
// not a background feature running continuously, so simultaneous contests
// would only add confusion about which photo belongs to which one.
const PHOTO_CONTEST_PLACE_POINTS = [30, 20, 10]; // 🥇🥈🥉 bonus on top of the ordinary +2 for posting a photo at all
const PHOTO_CONTEST_MEDALS = ["🥇", "🥈", "🥉"];
const MAX_PHOTO_CONTEST_HISTORY = 20;

async function cmdPhotoContest(chatId, msg, argsText, env) {
  const [action, ...rest] = argsText.trim().split(/\s+/);
  const title = rest.join(" ").trim();
  switch ((action || "").toLowerCase()) {
    case "start":
      return cmdPhotoContestStart(chatId, msg, title, env);
    case "vote":
      return cmdPhotoContestVote(chatId, env);
    case "results":
      return cmdPhotoContestResults(chatId, env);
    case "cancel":
      return cmdPhotoContestCancel(chatId, env);
    case "status":
    case "":
      return cmdPhotoContestStatus(chatId, env);
    default:
      return replyTo(env, msg, "Використання: /photocontest start <назва> · vote · results · status · cancel");
  }
}

async function cmdPhotoContestStart(chatId, msg, title, env) {
  if (msg.message_thread_id == null) {
    return replyTo(env, msg, "Цю команду треба написати всередині потрібної теми форуму (напр. «Змагання Конкурси»), а не в General — фото-заявки прийматимуться саме там.");
  }
  if (!title) return replyTo(env, msg, "Вкажіть назву конкурсу: /photocontest start Найкраще оформлення вітрини");

  const state = await getState(env, chatId);
  if (state.photoContest) {
    return replyTo(env, msg, `Уже є активний конкурс «${state.photoContest.title}». Спершу /photocontest results (або /photocontest cancel).`);
  }
  state.photoContest = { title, topicId: msg.message_thread_id, phase: "submitting", startedTs: Date.now(), entries: {} };
  await setState(env, chatId, state);
  await addToChatsIndex(env, chatId);
  await tg(env, "sendMessage", withThread({
    chat_id: chatId,
    text: `📸 <b>Старт фотоконкурсу «${escapeHtml(title)}»!</b>\n\nНадсилайте фото прямо в цю тему — це і є ваша заявка. Коли прийом заявок закриється, голосуватимемо реакціями під фото. Успіхів! 🍀`,
    parse_mode: "HTML",
  }, msg.message_thread_id));
}

async function cmdPhotoContestVote(chatId, env) {
  const state = await getState(env, chatId);
  const pc = state.photoContest;
  if (!pc) return tg(env, "sendMessage", { chat_id: chatId, text: "Немає активного фотоконкурсу. Почати: /photocontest start <назва>." });
  if (pc.phase !== "submitting") {
    return tg(env, "sendMessage", { chat_id: chatId, text: "Прийом заявок уже закритий — голосування триває." });
  }
  pc.phase = "voting";
  await setState(env, chatId, state);
  const count = Object.keys(pc.entries).length;
  await tg(env, "sendMessage", withThread({
    chat_id: chatId,
    text: count
      ? `🗳 Прийом заявок закрито! Учасників: ${count}.\n\nГолосуємо реакціями 👍❤️🔥 прямо під фото, яке сподобалось найбільше — можна за декілька. Результати оголосимо командою /photocontest results.`
      : `Прийом заявок закрито, але жодної заявки не надійшло. Можна /photocontest cancel або дати ще трохи часу й запустити знову.`,
  }, pc.topicId));
}

async function cmdPhotoContestResults(chatId, env) {
  const state = await getState(env, chatId);
  const pc = state.photoContest;
  if (!pc) return tg(env, "sendMessage", { chat_id: chatId, text: "Немає активного фотоконкурсу." });
  if (pc.phase === "submitting") {
    return tg(env, "sendMessage", { chat_id: chatId, text: "Прийом заявок ще відкритий — спершу закрийте його: /photocontest vote." });
  }

  const ranked = Object.values(pc.entries).sort((a, b) => b.reactions - a.reactions).slice(0, 3);
  if (!ranked.length) {
    await tg(env, "sendMessage", withThread({ chat_id: chatId, text: `📸 Фотоконкурс «${escapeHtml(pc.title)}» завершено — на жаль, заявок не було.` }, pc.topicId));
  } else {
    const lines = ranked.map((e, i) => {
      addPoints(state, { id: e.userId, first_name: e.name }, PHOTO_CONTEST_PLACE_POINTS[i] || 0);
      const storeLabel = e.storeCode ? ` (${e.storeCode})` : "";
      return `${PHOTO_CONTEST_MEDALS[i]} ${escapeHtml(e.name)}${storeLabel} — ${e.reactions} реакцій, +${PHOTO_CONTEST_PLACE_POINTS[i]} балів`;
    });
    await tg(env, "sendMessage", withThread({
      chat_id: chatId,
      text: `🏆 <b>Фотоконкурс «${escapeHtml(pc.title)}» завершено!</b>\n\n${lines.join("\n")}\n\nДякуємо всім, хто взяв участь! 🙌`,
      parse_mode: "HTML",
    }, pc.topicId));
  }

  state.photoContestHistory = state.photoContestHistory || [];
  state.photoContestHistory.push({ title: pc.title, endedTs: Date.now(), winners: ranked.map((e) => ({ name: e.name, storeCode: e.storeCode, reactions: e.reactions })) });
  if (state.photoContestHistory.length > MAX_PHOTO_CONTEST_HISTORY) {
    state.photoContestHistory.splice(0, state.photoContestHistory.length - MAX_PHOTO_CONTEST_HISTORY);
  }
  delete state.photoContest;
  await setState(env, chatId, state);
}

async function cmdPhotoContestCancel(chatId, env) {
  const state = await getState(env, chatId);
  const pc = state.photoContest;
  if (!pc) return tg(env, "sendMessage", { chat_id: chatId, text: "Немає активного фотоконкурсу." });
  delete state.photoContest;
  await setState(env, chatId, state);
  await tg(env, "sendMessage", withThread({ chat_id: chatId, text: `Фотоконкурс «${escapeHtml(pc.title)}» скасовано без оголошення переможців.` }, pc.topicId));
}

async function cmdPhotoContestStatus(chatId, env) {
  const state = await getState(env, chatId);
  const pc = state.photoContest;
  if (!pc) {
    return tg(env, "sendMessage", { chat_id: chatId, text: "Немає активного фотоконкурсу. Почати: /photocontest start <назва>." });
  }
  const entries = Object.values(pc.entries);
  const phaseLabel = pc.phase === "submitting" ? "прийом заявок" : "голосування";
  const lines = [`📸 «${pc.title}» — ${phaseLabel}, заявок: ${entries.length}.`];
  if (pc.phase === "voting" && entries.length) {
    const top = entries.sort((a, b) => b.reactions - a.reactions).slice(0, 3);
    lines.push(...top.map((e, i) => `${PHOTO_CONTEST_MEDALS[i]} ${escapeHtml(e.name)} — ${e.reactions} реакцій`));
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n") });
}

// "Тиждень Energy" — the second of two contest ideas Adam picked (the
// first, a themed photo contest, needed no new code at all — /photocontest
// above already does exactly that). A 7-day contest scored on each store's
// OWN average Energy across the days it reported within the window, not a
// raw total — so a store that reports every day isn't automatically ahead
// of one that reports fewer days for reasons unrelated to Energy itself; a
// missed day still costs you, since it's a day you couldn't raise your
// average on. Ties into the existing daily "reports window closed"
// message in processChatSchedule (see state.energyWeek below) rather than
// its own separate schedule.
function computeEnergyWeekStandings(state, startDate, endDate) {
  const totals = {};
  let d = startDate;
  while (d <= endDate) {
    const metrics = (state.reportMetrics && state.reportMetrics[d]) || {};
    for (const [code, m] of Object.entries(metrics)) {
      if (typeof m.energy !== "number") continue;
      totals[code] = totals[code] || { sum: 0, count: 0 };
      totals[code].sum += m.energy;
      totals[code].count += 1;
    }
    d = nextDateStr(d);
  }
  return Object.entries(totals)
    .map(([code, t]) => ({ code, avg: t.sum / t.count, days: t.count }))
    .sort((a, b) => b.avg - a.avg);
}

async function cmdEnergyWeek(chatId, msg, argsText, env) {
  const action = argsText.trim().toLowerCase();
  if (action === "cancel") return cmdEnergyWeekCancel(chatId, env);
  if (action === "status" || action === "") return cmdEnergyWeekStatus(chatId, env);
  if (action !== "start") {
    return replyTo(env, msg, "Використання: /energyweek start · status · cancel");
  }
  const state = await getState(env, chatId);
  if (!state.reportsTopic) {
    return replyTo(env, msg, "Спершу прив'яжіть тему звітів: /setreportstopic.");
  }
  if (state.energyWeek?.active) {
    return replyTo(env, msg, `Тиждень Energy вже триває (до ${formatUaDate(state.energyWeek.endDate)}). Спершу /energyweek cancel, якщо хочете почати заново.`);
  }
  const startDate = kyivNow(Date.now()).dateStr;
  const endDate = daysAheadStr(startDate, 6);
  state.energyWeek = { active: true, startDate, endDate };
  await setState(env, chatId, state);
  await tg(env, "sendMessage", {
    chat_id: chatId,
    message_thread_id: state.reportsTopic.threadId,
    text: `🔋 <b>Старт «Тижня Energy»!</b>\n\nЗ ${formatUaDate(startDate)} по ${formatUaDate(endDate)} рахуємо середній показник Energy по щоденних звітах кожного магазину. В кінці тижня оголосимо переможця 🏆`,
    parse_mode: "HTML",
  });
}

async function cmdEnergyWeekStatus(chatId, env) {
  const state = await getState(env, chatId);
  const ew = state.energyWeek;
  if (!ew) return tg(env, "sendMessage", { chat_id: chatId, text: "Тиждень Energy зараз не триває. Автоматично стартує щочетверга — або вручну: /energyweek start." });
  const standings = computeEnergyWeekStandings(state, ew.startDate, ew.endDate);
  if (!standings.length) {
    return tg(env, "sendMessage", { chat_id: chatId, text: `🔋 Тиждень Energy (${formatUaDate(ew.startDate)}–${formatUaDate(ew.endDate)}): поки жодних даних.` });
  }
  const lines = standings.slice(0, 10).map((s, i) => `${i + 1}. ${escapeHtml(s.code)} — ${s.avg.toFixed(1)} (${s.days} дн.)`);
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: `🔋 <b>Тиждень Energy — поточний стан</b>${ew.active ? "" : " (завершено)"}\n${formatUaDate(ew.startDate)}–${formatUaDate(ew.endDate)}\n\n${lines.join("\n")}`,
    parse_mode: "HTML",
  });
}

async function cmdEnergyWeekCancel(chatId, env) {
  const state = await getState(env, chatId);
  if (!state.energyWeek?.active) return tg(env, "sendMessage", { chat_id: chatId, text: "Немає активного Тижня Energy." });
  state.energyWeek.active = false;
  await setState(env, chatId, state);
  await tg(env, "sendMessage", { chat_id: chatId, text: "Тиждень Energy скасовано, переможця не оголошуємо." });
}

// Records a photo posted in the contest's own topic, while it's still
// accepting entries, as one participant's submission — one entry per
// message (someone posting several photos gets several entries, each
// voted on separately, same as any other participant's single photo).
async function trackPhotoContestEntry(chatId, msg, env) {
  const state = await getState(env, chatId);
  const pc = state.photoContest;
  if (!pc || pc.phase !== "submitting" || msg.message_thread_id !== pc.topicId) return;
  pc.entries[msg.message_id] = {
    userId: msg.from.id,
    name: displayName(msg.from),
    storeCode: state.storeMembers?.[String(msg.from.id)] || null,
    ts: Date.now(),
    reactions: 0,
  };
  await setState(env, chatId, state);
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

// -------------------------------------------------- ask the bot (@mention) --
// Anyone who @mentions the bot, or replies to one of its own messages, gets
// an actual reply back — a quick explanation if they asked something, or a
// bit of motivation otherwise — instead of the bot staying silent outside
// its fixed commands. Optional AI path (env.ANTHROPIC_API_KEY), same
// "free mechanical fallback either way" design as the presentation quiz
// above: no key configured, or the API call fails/times out/hits the rate
// cap → a canned reply from ASK_BOT_FALLBACK_REPLIES instead, so the bot
// never just goes quiet.

const ASK_BOT_MODEL = "claude-sonnet-5"; // lighter/cheaper than the quiz's Opus — this can fire on every mention, not once per upload
const ASK_BOT_MAX_PER_HOUR = 20; // per chat — caps API spend if mentions get spammy; canned fallback still answers past the cap
const MAX_ASKBOT_FEEDBACK = 200; // oldest tracked AI replies drop off past this, per chat — same pattern as MAX_TRACKED_ACKS
const MAX_ASKBOT_ESCALATIONS = 100; // oldest requires_human entries drop off past this, per chat
const ASKBOT_POSITIVE_EMOJI = new Set(["👍", "❤", "❤️", "🔥", "👏", "🎉"]);
const ASKBOT_NEGATIVE_EMOJI = new Set(["👎", "💩", "😡", "🤡", "😢"]);
const ASK_BOT_CONTEXT_MESSAGES = 10; // how many recent chat lines get sent along as context

// Full persona brief as given, translated into a system prompt: a friendly,
// witty AI chat companion (not a "bot-помічник" in the formal sense) —
// natural tone, humor when it fits, reads the room, replies in Ukrainian by
// default (or whatever language it's addressed in), stays short (this is
// Telegram, not an essay), moderate emoji. Media/context handling below is
// what actually feeds it photos/documents/recent chat lines — this prompt
// just tells it how to use them.
const ASK_BOT_SYSTEM_PROMPT =
  "Ти — розумний, дружній та веселий AI-співрозмовник у робочому Telegram-чаті магазинів роздрібної мережі " +
  "JYSK. Ти підключаєшся до бесіди щоразу, коли тебе згадують. Спілкуйся невимушено, як добрий друг або " +
  "харизматичний учасник чату — уникай канцеляризмів, роботоподібних чи занадто офіційних відповідей. " +
  "Додавай легкий гумор, доречний жарт чи влучне іронічне зауваження, коли це доречно. За замовчуванням " +
  "відповідай українською мовою (або мовою, якою до тебе звернулись).\n\n" +
  "РОЗПІЗНАВАННЯ КОНТЕКСТУ. Перш ніж відповідати, подумки визнач: що людина насправді мала на увазі; це " +
  "питання, прохання, уточнення, скарга, жарт, провокація, подяка, агресія, сумнів, підтримка чи наказ; " +
  "який емоційний стан (спокійний, злий, роздратований, сумний, радісний, іронічний, саркастичний, " +
  "тривожний); чи звернення справді адресоване тобі, чи потрібна відповідь взагалі. Роби це навіть якщо " +
  "повідомлення коротке, неповне, з помилками, сленгом, суржиком чи матюками, є відповіддю на щось раніше " +
  "сказане, містить сарказм/іронію, чи стосується кількох тем одночасно. Не показуй цей внутрішній аналіз " +
  "користувачу — лише фінальний результат. Короткі репліки на кшталт «ясно», «ну таке», «ага», «серйозно?», " +
  "«і шо?», «норм», «дякую» ніколи не отримують шаблонної відповіді — визнач, що саме вони означають у " +
  "поточному діалозі (згода, роздратування, сарказм, завершення розмови тощо), і реагуй відповідно до " +
  "цього, а не до буквального тексту.\n\n" +
  "ЧИ ВІДПОВІДАТИ ВЗАГАЛІ. Постав should_respond: false (і залиш reply порожнім) замість генерування " +
  "відповіді, якщо: повідомлення насправді не адресоване тобі (наприклад містить слово «бот» побіжно, " +
  "в розповіді про щось інше, а не як звернення); це продовження чужої розмови, куди втручатися недоречно; " +
  "це флуд без змісту чи явний спам; це провокація без реального запиту; це односкладова репліка чи " +
  "емодзі-реакція, що не потребує продовження діалогу (наприклад просте «дякую» чи «👍» у відповідь на " +
  "твоє ж повідомлення). Не бійся мовчати — зайва відповідь там, де людина не чекає розмови, гірше, ніж " +
  "її відсутність. В усіх інших випадках, коли є реальний намір отримати відповідь — should_respond: true.\n\n" +
  "УТОЧНЕННЯ VS ВІДПОВІДЬ. Якщо сенс зрозумілий з контексту — відповідай одразу й конкретно, без уточнень " +
  "заради форми. Якщо сенс справді неоднозначний — постав ОДНЕ коротке уточнююче запитання, не більше.\n\n" +
  "ТОН І СТИЛЬ. Підлаштовуйся під стиль конкретного діалогу: невимушено в неформальній розмові, стриманіше " +
  "в діловому обміні. На агресію чи токсичність не відповідай конфліктом — залишайся спокійним, витягни " +
  "суть запиту і відповідай тільки по ній. На жарт можна відповісти легко й дотепно, якщо це справді " +
  "доречно. Якщо людина емоційно напружена чи ділиться чимось серйозним — підтримай м'яко й по суті, без " +
  "жартів не в тему. Якщо повідомлення містить кілька питань одразу — структуруй відповідь по пунктах " +
  "коротко, а не одним суцільним абзацом. Сучасно й живо — не занудно, але без перегравання: не форсуй " +
  "сленг, не будь вульгарним, токсичним чи занадто фамільярним навіть у жартівливому тоні. Якщо в " +
  "доданому контексті останніх реплік чату видно, якими фразами чи відкриттям ти вже відповідав — не " +
  "повторюй їх дослівно чи близько до тексту; формулюй по-новому щоразу, навіть у схожій ситуації, щоб " +
  "діалог не звучав шаблонно чи роботизовано.\n\n" +
  "ПРИКЛАДИ ТОНУ (орієнтир стилю, а НЕ фрази для дослівного копіювання — щоразу придумуй свій варіант у " +
  "цьому дусі, підлаштований під конкретне повідомлення, інакше відповіді почнуть повторюватись). " +
  "Привітання/відкриття розмови: «Привіт! Я тут, погнали 😎», «О, привіт-привіт! Що сьогодні вирішуємо?», " +
  "«Хей! Розповідай, що сталося». Підтвердження, що зрозумів: «Прийняв, зафіксував», «Ага, вловив суть», " +
  "«Так, картинка складається». Коли щось СПРАВДІ незрозуміло — чесно зізнайся, а не вдавай, що зрозумів: " +
  "«Хмм, здається, не до кінця вловив думку — можеш перефразувати?», «Тут я трохи заплутався 😅, поясниш " +
  "ще раз простіше?». Подяка у відповідь: «Радий, що допомогло!», «Завжди радий підтримати команду». " +
  "Готово/успіх: «Готово ✅, перевіряй», «Є, зафіксував — рухаємось далі». Помилка чи збій — спокійно, без " +
  "драми: «Тут щось не спрацювало, зараз розберемось», «Це не критично, просто треба скоригувати один " +
  "момент». Людина роздратована чи зла — без сарказму й жартів, одразу до суті: «Розумію твоє " +
  "роздратування, давай швидко розберемось», «Бачу, це справді дратує — ось що можна зробити». Людина " +
  "сумнівається — підтримай і поясни простіше: «Це логічне питання, давай поясню простіше», «Не дивно, що " +
  "виникло питання — ось як це насправді працює». Просять швидко — без води, одразу суть: «Коротко: ось " +
  "що треба», «По суті: …». Треба детально — структуровано, без поспіху: «Добре, розберемо детально», " +
  "«Йдемо по пунктах». Похвала чи згода — щиро, без підлабузництва: «Гарне питання», «Так, це влучно». " +
  "М'яка незгода чи корекція — тактовно, не сперечаючись різко: «Майже так, але є нюанс», «Не зовсім так " +
  "— зараз поясню». Порада: «Я б радив почати з цього». Немає прямого еквівалента для повідомлень типу " +
  "«секунду, перевіряю» — ти відповідаєш одним повідомленням одразу з готовою відповіддю, а не в два " +
  "етапи, тож проміжні фрази очікування тут не застосовні.\n\n" +
  "МЕДІА. Якщо в повідомленні є фото чи документ — проаналізуй його ПО СУТІ ЗМІСТУ, а не просто опиши, " +
  "що на ньому зображено. Якщо в тексті прямо сказано, що це один кадр-прев'ю з відео (а не саме відео) — " +
  "прокоментуй саме цей кадр по суті і явно зауваж, що бачив лише прев'ю, без руху й без звуку, а не роби " +
  "вигляд, що переглянув весь ролик. Коментар має відповідати типу зображення: це чек — прокоментуй по-справжньому " +
  "корисне (сума, дата, підозрілі чи мінусові позиції, щось незвичне), а не «бачу чек з цифрами»; це стенд, " +
  "викладка чи товар у магазині — оціни як людина, що розуміється на рітейлі (охайність, привабливість, " +
  "що впадає в очі покупцю); це скріншот з помилкою, інтерфейсом чи повідомленням — не просто перекажи, що " +
  "там написано, а поясни, що це означає, чому могло виникнути й що зробити далі; це просто документ — " +
  "витягни головне і скажи по суті. Якщо підпис до фото короткий і неоднозначний («ось», «дивись», «шо " +
  "це?», «знову це саме») — розшифровуй його сенс через те, що саме на фото, а не буквально. Виділяй лише " +
  "те, що справді важливо для відповіді, не переказуй усе зображення. Якщо фото нечітке чи не дає достатньо " +
  "інформації для впевненої відповіді — так і скажи, попроси чіткіше фото чи уточнення, замість того щоб " +
  "вигадувати деталі, яких не видно. Якщо повідомлення з фото/документом емоційне (роздратування, " +
  "стурбованість) — спершу коротко визнай емоцію одним реченням («так, бачу проблему» / «зрозуміло, це " +
  "справді неприємно»), потім переходь до суті. На фото можуть бути чутливі чи приватні дані — не " +
  "розголошуй і не коментуй їх без потреби, обмежся тим, що дійсно стосується запиту. Помічай кумедні чи " +
  "цікаві деталі, якщо справді є, відповідай на запитання щодо зображення, якщо його поставили. Ніколи не " +
  "обмежуйся описом «що на фото» замість реального коментаря по суті — опис сам по собі не відповідь. Якщо " +
  "додано рядок про те, хто звертається і (якщо є) на яке саме повідомлення це відповідь — це реальні " +
  "метадані, а не частина запиту; використовуй їх, щоб точніше зрозуміти, чи справді звернення до тебе, і " +
  "за потреби звернутись на ім'я, але не повторюй цю інформацію в самій відповіді як окрему фразу. Якщо " +
  "додано короткий контекст останніх " +
  "реплік чату — врахуй його для зв'язності, але відповідай саме на актуальне звернення, а не на кожну " +
  "репліку окремо. Якщо додано блок реальних даних дистрикту (звіти, фотозвіти, стріки, топ активності, " +
  "чекліст) — це актуальна інформація з бази, а не вигадка; використовуй її, якщо запитання про поточний " +
  "стан справ, прогрес чи хто відстає, але згадуй лише те, що доречно, а не перераховуй усе підряд. Якщо " +
  "додано довідку про магазини дистрикту (код, назва, керуючий) — це теж реальні дані, використовуй їх для " +
  "точних відповідей на кшталт «хто керуючий J104» чи «скільки в нас магазинів». Якщо потрібного блоку " +
  "немає — не вигадуй цифр чи імен і не роби вигляд, що знаєш поточні показники. Якщо запит — щось серйозне, " +
  "конфліктне чи явно поза межами того, що ти реально можеш вирішити текстом (кадрове питання, скарга, " +
  "щось, що потребує рішення керівника) — прямо скажи, що це краще адресувати District Manager'у чи " +
  "адміністратору чату, а не вдавай, що можеш це залагодити сам. Якщо запит небезпечний, незаконний чи " +
  "шкідливий — коректно відмовся, без моралізаторства. Не приписуй співрозмовнику намір, якого немає в " +
  "тексті, і не провокуй конфлікт власною відповіддю.\n\n" +
  "ФОРМАТ. Відповідай лаконічно та по суті, без довжелезних «простирадл» тексту без потреби (це Telegram, " +
  "тут цінують живий і швидкий діалог) — 2-6 речень, без списків, заголовків чи Markdown/HTML-розмітки, " +
  "звичайний текст (винятком, коли реально треба структурувати кілька питань по пунктах — тоді короткими " +
  "рядками, а не жирним чи заголовками). Максимум 0-2 емодзі на відповідь, і лише коли це справді доречно " +
  "— не став емодзі в кожному реченні і не став їх у серйозній чи діловій відповіді просто за звичкою.\n\n" +
  "СТРУКТУРОВАНА КЛАСИФІКАЦІЯ. Окрім should_respond і reply, заповни чесно: intent — один з greeting " +
  "(привітання/подяка/small talk), question_data (питання про реальні дані дистрикту — звіти, стріки, " +
  "магазини), question_general (загальне робоче питання чи прохання пояснити), complaint (скарга, " +
  "невдоволення, проблема), human_request (пряме прохання покликати людину/DM/адміна), feedback (відгук чи " +
  "пропозиція), media_comment (запит стосується прикріпленого фото/документа), small_talk (просто " +
  "спілкування без конкретного запиту), spam_or_irrelevant (безглуздий текст, спам, офтоп) або unknown, " +
  "якщо намір справді не зрозумілий; sentiment — тон повідомлення (positive/neutral/negative/frustrated); " +
  "urgency — наскільки терміново це потребує уваги людини (low/medium/high); requires_human — true, якщо " +
  "це кадрове питання, конфлікт, пряме прохання покликати людину, або sentiment=frustrated разом з " +
  "urgency=high — інакше false. Код гарантує валідний формат JSON, тобі потрібно лише чесно заповнити " +
  "значення — не занижуй і не завищуй оцінки, щоб покликати увагу; вони йдуть у внутрішній лог, а не в чат.";

// Structured output (Claude's native json_schema mode — the API itself
// enforces this shape, unlike a plain "return JSON only" instruction in the
// prompt, which a model can still deviate from) lets the SAME single call
// double as both the chat reply and a lightweight intent/urgency classifier
// the code can act on — no second API call, no extra cost or latency.
const ASK_BOT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    should_respond: { type: "boolean" },
    reply: { type: "string" },
    intent: {
      type: "string",
      enum: ["greeting", "question_data", "question_general", "complaint", "human_request", "feedback", "media_comment", "small_talk", "spam_or_irrelevant", "unknown"],
    },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative", "frustrated"] },
    urgency: { type: "string", enum: ["low", "medium", "high"] },
    requires_human: { type: "boolean" },
  },
  required: ["should_respond", "reply", "intent", "sentiment", "urgency", "requires_human"],
  additionalProperties: false,
};

const ASK_BOT_FALLBACK_REPLIES = [
  "🤖 <b>Я тут!</b> Поки що найкраще відповідаю на конкретні команди — глянь /help, там усе по пунктах 👇",
  "💪 <b>Уже те, що ти написав(-ла) — вже рух.</b> Далі буде простіше, крок за кроком.",
  "🙌 <b>Не зупиняйся — саме стабільність, а не ідеальність, дає результат.</b> Тримаємо темп командою.",
  "⚡ <b>Гарний день починається з малого кроку.</b> Зроби той, що перед тобою зараз — і рухаємось далі.",
  "😊 <b>Радий, що написав(-ла)!</b> Спробуй /help, якщо шукаєш конкретну команду 👇",
  "🌟 <b>Кожен виклик — це шанс стати трохи кращим за вчора.</b> Ти справляєшся краще, ніж думаєш.",
  "🔥 <b>Тримай темп — результат приходить саме до тих, хто не зупиняється.</b>",
  "🙌 <b>Команда — це сила.</b> Якщо щось важко — не соромся звернутись до колег чи керівника.",
  "💬 <b>Я тут, щоб підтримати!</b> Якщо шукаєш конкретну функцію — /help розкаже все по пунктах.",
  "✨ <b>Маленькі кроки щодня складаються у великий результат.</b> Продовжуй у своєму темпі.",
  "🌟 <b>Ти на правильному шляху.</b> Продовжуй у своєму темпі — результат прийде.",
  "🚀 <b>Кожне повідомлення — це рух вперед.</b> Спробуй /help, якщо шукаєш конкретну функцію 👇",
  "😊 <b>Радий бачити активність у чаті!</b> Якщо потрібна конкретна команда — /help підкаже.",
  "🔥 <b>Не зупиняйся — саме так і будуються великі результати.</b>",
  "💡 <b>Гарна ідея — написати в чат.</b> Якщо шукаєш щось конкретне — глянь /help 👇",
  "🙌 <b>Команда завжди поруч, якщо щось не виходить.</b> Не соромся звертатись.",
  "⭐ <b>Маленькі кроки щодня — це і є прогрес.</b> Продовжуй у тому ж дусі.",
  "💬 <b>Дякую, що написав(-ла)!</b> Спробуй /help — там усі команди по пунктах.",
  "🌈 <b>Кожен день — новий шанс зробити трохи краще.</b> Ти вже на цьому шляху.",
  "🤖 <b>Я на зв'язку!</b> Якщо шукаєш конкретну функцію бота — /help розкаже все 👇",
];

// Used when something was attached (photo/document/voice/video) but it
// couldn't be turned into something Claude/Workers AI can actually read —
// download failed, too large, or a type nothing here understands
// (docx/xlsx, or voice/audio — genuinely no visual frame to fall back on,
// unlike video — see buildAskBotMediaBlocks). Exactly the humor-on-failure
// behavior asked for, and it's honest: no pretending to have watched
// motion or heard audio it never received.
const ASK_BOT_MEDIA_FAIL_REPLIES = [
  "Ой, здається, мої штучні мізки трохи засліпли від цього файлу 😅 Спробуєш скинути ще раз?",
  "Хм, цей формат мені поки не піддається 🙈 Спробуй інший файл або просто опиши словами, що там.",
  "Тут я трохи загубився 😵‍💫 Голосові я поки що не «чую» — а от текстом, фото чи навіть кадром з відео — залюбки!",
  "Упс, цей файл виявився для мене міцним горішком 🥜 Спробуй, будь ласка, ще раз або іншим форматом.",
  "Здається, я тимчасово «осліп» 👀 Можеш переказати словами, що там — і я одразу підключусь!",
  "Ого, це поза межами моїх поточних здібностей 😅 Але текстом чи фото — я весь увага!",
  "Ем, здається, це поза межами того, що я можу «переварити» 😅 Спробуй текстом чи фото!",
  "Мої цифрові окуляри тут безсилі 🤓 Спробуй, будь ласка, інший формат.",
  "Тут я трохи заплутався в проводах 🔌😅 Текст чи фото — і я знову в грі!",
  "Це навіть для штучного інтелекту занадто штучно 😄 Спробуй ще раз іншим форматом.",
  "Ой, тут у мене повне «файл не знайдено» в голові 🙈 Спробуй, будь ласка, ще раз.",
  "Здається, цей формат — не мій коник 🐴 Але текст чи фото я опрацюю залюбки!",
];

let cachedBotUsername = null; // module-scope: survives while this isolate stays warm, refetched otherwise — cheap either way
async function getBotUsername(env) {
  if (cachedBotUsername) return cachedBotUsername;
  const res = await tg(env, "getMe", {});
  cachedBotUsername = res?.result?.username || null;
  return cachedBotUsername;
}

// Matches the standalone word "бот" in any case (бот/БОТ/Бот) anywhere in
// the message — "навіть в контексті", not just at the start — but NOT as
// part of a longer word. This matters a lot in a work chat: "робота"
// (work/job) and "робот" both contain "бот" as a substring and come up
// constantly, so a plain .includes("бот") would misfire on nearly every
// message about someone's workday. JS regex \b doesn't help here — \w
// doesn't cover Cyrillic letters, so \b never finds a boundary inside a
// Cyrillic word — hence the explicit non-letter lookaround instead.
const BOT_WORD_RE = /(^|[^а-яіїєґ'ʼa-z0-9_])бот([^а-яіїєґ'ʼa-z0-9_]|$)/i;
function textMentionsBotWord(text) {
  return !!text && BOT_WORD_RE.test(text);
}

// A reply to one of the bot's own messages always counts (single bot in the
// chat, so "the message being replied to is from a bot" is an unambiguous
// signal). Same for the standalone word "бот" anywhere in the text/caption.
// An @mention needs the bot's own username first — skipped entirely unless
// the text even contains "@", so the extra getMe() lookup only happens on
// messages that could plausibly be one. Photos/documents/voice/video have
// their accompanying text in `caption`, not `text` — checked the same way.
async function isAddressedToBot(msg, env) {
  if (msg.reply_to_message?.from?.is_bot) return true;
  const text = msg.text ?? msg.caption ?? "";
  if (!text) return false;
  if (textMentionsBotWord(text)) return true;
  if (!text.includes("@")) return false;
  const username = await getBotUsername(env);
  if (!username) return false;
  return text.toLowerCase().includes(`@${username.toLowerCase()}`);
}

function extractAskQuery(text, botUsername) {
  let cleaned = text || "";
  if (botUsername) cleaned = cleaned.replace(new RegExp(`@${escapeRegExp(botUsername)}`, "gi"), " ");
  return cleaned.replace(/\s+/g, " ").trim();
}

// Recent chat lines (see trackActivity, which maintains state.recentMessages
// as a side effect of a write it already makes — no extra Firestore cost)
// given to Claude as light context, not a transcript to respond to line by
// line — the system prompt says so explicitly.
function buildAskBotContext(recentMessages) {
  if (!recentMessages || !recentMessages.length) return "";
  const lines = recentMessages.map((m) => `${m.name}: ${m.text}`).join("\n");
  return `Контекст — останні репліки в чаті (лише для розуміння ситуації, не відповідай на кожну окремо):\n${lines}\n\n---\n\n`;
}

// Who's actually asking, and — separately from the general recentMessages
// buffer above — what SPECIFIC message this one is a reply to, if any.
// Telegram hands us the full replied-to message (msg.reply_to_message)
// regardless of whether it's still in the recent-messages window, and if
// it's a reply to the bot's OWN prior answer, that answer isn't in
// recentMessages at all (trackActivity only records human messages) — so
// without this, the model has no idea what its own earlier reply said.
// `askerStoreCode` (optional): the asker's own linked store — see
// state.storeMembers, set by /mystore or auto-detected from a report they
// sent. Without this, "як у нас сьогодні?"/"хто керуючий у нас?" had no way
// to resolve "нас" to anyone specific — the model/matchFreeIntent only ever
// saw the person's name, never which store they actually run.
function buildAskBotMeta(msg, senderName, askerStoreCode) {
  const lines = [`Звертається: ${senderName}${askerStoreCode ? ` (магазин ${askerStoreCode})` : ""}.`];
  const rt = msg.reply_to_message;
  if (rt) {
    const priorText = rt.text || rt.caption;
    if (rt.from?.is_bot) {
      lines.push(priorText
        ? `Це відповідь на власне попереднє повідомлення бота: «${truncateText(priorText, 300)}»`
        : "Це відповідь на попереднє повідомлення бота.");
    } else {
      const fromName = rt.from ? displayName(rt.from) : "когось у чаті";
      lines.push(priorText
        ? `Це відповідь на повідомлення від ${fromName}: «${truncateText(priorText, 200)}»`
        : `Це відповідь на повідомлення від ${fromName} (без тексту).`);
    }
  }
  return `${lines.join(" ")}\n\n---\n\n`;
}

function topStreaksList(streaks) {
  return Object.entries(streaks || {})
    .filter(([, r]) => r.current >= 2)
    .sort((a, b) => b[1].current - a[1].current)
    .slice(0, 3)
    .map(([code, r]) => `${code} — ${r.current} дн.`)
    .join(", ");
}

// "Аналізує паралельно активність по різних гілках" — a compact, real-data
// snapshot pulled from whatever topics are actually configured in this chat
// (evening reports, morning photo reports, streaks, today's activity
// leaderboard, the monthly checklist), so an AI reply to something like
// "як у нас справи сьогодні" is grounded in actual numbers instead of a
// generic pep talk. Only sections for topics this chat has set up appear —
// a chat with no reportsTopic bound gets no reports line, etc. The system
// prompt tells the model to mention only what's relevant, not recite it all.
// `stores` here is the FULL roster ({code, name, sm, ...} from
// staffing-stores), not the {code, name} shape getStoreCodes() returns —
// only .code is actually used below, but the caller (cmdAskBot) fetches
// the roster once and reuses it for buildDistrictInfo() too, rather than
// this function doing its own separate Firestore read of the same doc.
async function buildActivitySnapshot(stores, state, now) {
  const day = now.dateStr;
  const lines = [];

  if (state.reportsTopic && stores.length) {
    const reportedToday = (state.reports && state.reports[day]) || {};
    const missing = stores.filter((s) => s.code && !reportedToday[s.code]).map((s) => s.code);
    lines.push(`Вечірні звіти сьогодні: ${stores.length - missing.length}/${stores.length} магазинів.${missing.length ? ` Ще не звітували: ${missing.join(", ")}.` : ""}`);
  }

  if (state.photoReportsTopic && stores.length) {
    const reportedToday = (state.photoReports && state.photoReports[day]) || {};
    const missing = stores.filter((s) => s.code && !reportedToday[s.code]).map((s) => s.code);
    lines.push(`Фотозвіти (мінусові залишки) сьогодні: ${stores.length - missing.length}/${stores.length}.${missing.length ? ` Ще не надіслали: ${missing.join(", ")}.` : ""}`);
  }

  const reportStreaks = topStreaksList(state.reportStreaks);
  if (reportStreaks) lines.push(`Найдовші стріки вечірніх звітів: ${reportStreaks}.`);
  const photoStreaks = topStreaksList(state.photoStreaks);
  if (photoStreaks) lines.push(`Найдовші стріки фотозвітів: ${photoStreaks}.`);

  if (state.activityTopic) {
    const top = Object.entries(todaysPoints(state, now)).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) lines.push(`Топ активності сьогодні: ${top.map(([uid, p]) => `${state.names?.[uid] || uid} (${p})`).join(", ")}.`);
  }

  if (state.monthlyChecklist && state.monthlyChecklist.cycleMonth === now.month && stores.length) {
    const missing = stores.filter((s) => s.code && !(state.monthlyChecklist.confirmed || {})[s.code]).map((s) => s.code);
    lines.push(missing.length ? `Щомісячний чекліст: ще не підтвердили — ${missing.join(", ")}.` : "Щомісячний чекліст: усі магазини підтвердили.");
  }

  if (!lines.length) return "";
  return `Реальні дані дистрикту станом на зараз (згадуй лише те, що доречно для запитання, не перераховуй усе підряд):\n${lines.join("\n")}\n\n---\n\n`;
}

async function getStoreRoster(env) {
  return (await loadDashboardDoc(env, "staffing-stores")) || [];
}

// Static факти про сам дистрикт (не про сьогоднішню активність, а хто є
// хто) — щоб на "хто керуючий J104?" чи "скільки в нас магазинів?" бот
// відповідав реальними іменами й кодами замість вигаданих. `sm` (store
// manager) — те саме поле, що вже показує дашборд (index.html) і
// /storepoll — не нова інформація, лише вперше подана боту в текстовому
// вигляді.
function buildDistrictInfo(stores) {
  const usable = (stores || []).filter((s) => s.code);
  if (!usable.length) return "";
  const lines = usable.map((s) => `${s.code} — ${s.name || "без назви"}${s.sm ? `, керуючий: ${s.sm}` : ""}`);
  return `Довідка — магазини дистрикту (${usable.length} шт.):\n${lines.join("\n")}\n\n---\n\n`;
}

// A single word from the query is a plausible name reference to `fullName`
// (one entry from state.names) if it matches a word of that name directly,
// via transliteration in either direction (reuses the same table the
// birthday matcher uses — "Влад" typed in the chat needs to find a Telegram
// profile literally named "Vlad"), or as a prefix either way (short forms:
// "Марк" for "Марко", or someone typing just the start of a longer name).
function freeIntentNameMatches(token, fullName) {
  const t = token.toLowerCase();
  const tTranslit = transliterateWord(t);
  return (fullName || "")
    .toLowerCase()
    .split(/\s+/)
    .some((part) => {
      const p = part.replace(/[.,!?:;]+$/g, "");
      if (!p) return false;
      return p === t || p === tTranslit || transliterateWord(p) === t || p.startsWith(t) || t.startsWith(p);
    });
}

// Free, non-AI substantive answers for the handful of questions that
// actually come up constantly in this chat — "хто сьогодні активний",
// "хто керуючий J104", "<Ім'я> активний?" — pattern-matched against the
// SAME real Firestore data askBotAI would have handed to Claude
// (todaysPoints/state.names/the store roster), not a second data source.
// For a district manager who's deliberately keeping the bot on the free
// tier (no ANTHROPIC_API_KEY — see cmdAskBot), this is what stands in for
// "predметні відповіді" without any paid API call. Returns a plain-text
// answer, or null if nothing matched — the caller falls through to the
// random canned pool exactly as before.
// `asker` (optional): { id, storeCode } — the person addressing the bot,
// and their own linked store (state.storeMembers, from /mystore or an auto-
// detected report). Without this, first-person phrasing ("у нас", "наш
// магазин", "я сьогодні активний?") had nothing to resolve TO — the bot
// only ever recognized OTHER people's names or explicit store codes, never
// "the person asking, themselves".
function matchFreeIntent(query, state, stores, now, asker) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return null;
  const usableStores = (stores || []).filter((s) => s.code);

  // "скільки магазинів" / "скільки у нас магазинів в дістрикті"
  if (/скільки.*магазин/.test(q)) {
    return usableStores.length
      ? `У дістрикті ${usableStores.length} магазинів: ${usableStores.map((s) => s.code).join(", ")}.`
      : "Наразі немає даних про магазини дистрикту в базі.";
  }

  // "хто керуючий J104" / "керуючий J104" / "хто керуючий Погреби" /
  // "хто керуючий у нас" (resolves to the asker's own linked store)
  if (/керуюч/.test(q)) {
    const codeMatch = q.match(/\bj\d{2,4}\b/i);
    let store = null;
    if (codeMatch) {
      const code = codeMatch[0].toUpperCase();
      store = usableStores.find((s) => s.code.toUpperCase() === code);
    }
    if (!store) store = usableStores.find((s) => s.name && q.includes(s.name.toLowerCase()));
    if (!store && asker?.storeCode && /(у нас|наш\w*|мо[єї]му? магазин)/.test(q)) {
      store = usableStores.find((s) => s.code === asker.storeCode);
    }
    if (store) return store.sm ? `Керуючий ${store.code}${store.name ? ` (${store.name})` : ""}: ${store.sm}.` : `У ${store.code} наразі не вказано керуючого в базі.`;
    return null; // asked about a manager but couldn't identify the store — let the canned pool handle it rather than guess
  }

  // "хто сьогодні активний" / "хто найактивніший" / "топ активності"
  if (/(хто|топ).{0,15}актив/.test(q) || /актив\S*.{0,15}(хто|топ)/.test(q)) {
    if (!state.activityTopic) return null; // no real activity data configured in this chat
    const top = Object.entries(todaysPoints(state, now)).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!top.length) return "Сьогодні ще ніхто не набрав активності в чаті — попереду ще весь день 💪";
    return `Топ активності сьогодні: ${top.map(([uid, p], i) => `${i + 1}. ${state.names?.[uid] || uid} (${p})`).join(", ")}.`;
  }

  if (state.activityTopic) {
    // "Я сьогодні активний?" / "чи активний я?" — resolve directly via the
    // asker's own id, not name-matching (and "я"/"мене" are too short for
    // the generic name regex below anyway — it requires 2+ characters).
    if (asker?.id && /(^|[^а-яіїєґ'ʼa-z])(я|мене)(?:$|[^а-яіїєґ'ʼa-z]).{0,20}актив/i.test(q)) {
      const uid = String(asker.id);
      const points = todaysPoints(state, now)[uid] || 0;
      const name = state.names?.[uid] || "Ти";
      return points > 0 ? `${name} сьогодні активний(-а) — ${points} бал(ів) за участь у чаті.` : `${name} сьогодні ще не проявляв(-ла) активності в чаті.`;
    }
    // "<Ім'я> активний?" / "чи активний <Ім'я>" — one specific person, not the leaderboard
    const m = q.match(/([а-яіїєґ'a-z]{2,20})\s*(?:сьогодні\s*)?актив/i) || q.match(/актив\S*\s+(?:сьогодні\s*)?([а-яіїєґ'a-z]{2,20})/i);
    const rawName = m?.[1];
    if (rawName && !/^(хто|топ|команда|дістрикт|магазин\w*|сьогодні)$/.test(rawName)) {
      const entry = Object.entries(state.names || {}).find(([, name]) => freeIntentNameMatches(rawName, name));
      if (entry) {
        const [uid, name] = entry;
        const points = todaysPoints(state, now)[uid] || 0;
        return points > 0 ? `${name} сьогодні активний(-а) — ${points} бал(ів) за участь у чаті.` : `${name} сьогодні ще не проявляв(-ла) активності в чаті.`;
      }
    }
  }

  return null;
}

// mediaBlocks: Anthropic content blocks (image/document) built by
// buildAskBotMediaBlocks below — spliced in before the text block so Claude
// sees the attachment alongside whatever was asked about it.
// districtInfo/activitySnapshot/recentMessages are all plain text, prepended
// in front of the actual query, most-static-first.
// Returns { reply, intent, sentiment, urgency, requiresHuman } on success,
// or null on any failure (no key, network/timeout, non-OK response, or a
// malformed/missing reply) — the caller falls back to the free canned pool
// on null exactly like before this returned a plain string.
// `diag`, if passed, gets filled in on every failure path — {reason, status?,
// detail?} — so the CALLER can persist WHY this returned null. Without this,
// a null result is indistinguishable from any of: no key configured, a
// network/timeout failure, Claude/Anthropic returning a non-2xx (bad model
// id, invalid key, rate limit, overloaded...), an empty response body, or a
// malformed/incomplete JSON payload — all of which look identical from the
// outside (the canned fallback fires either way) and, without Cloudflare
// Worker log access, were previously impossible to tell apart after the
// fact. See cmdAskBot (state.askBotLastError) and /askbotdebug.
async function askBotAI(env, query, mediaBlocks, recentMessages, activitySnapshot, districtInfo, meta, diag) {
  if (!env.ANTHROPIC_API_KEY) {
    if (diag) diag.reason = "no_api_key";
    return null;
  }
  const content = [...(mediaBlocks || [])];
  content.push({ type: "text", text: `${districtInfo || ""}${activitySnapshot || ""}${buildAskBotContext(recentMessages)}${meta || ""}${query || "Привіт!"}` });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: ASK_BOT_MODEL,
        max_tokens: 500,
        system: ASK_BOT_SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: ASK_BOT_RESPONSE_SCHEMA } },
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    console.error("askBotAI request failed or timed out", err);
    if (diag) { diag.reason = controller.signal.aborted ? "timeout" : "fetch_failed"; diag.detail = truncateText(String(err?.message || err), 300); }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error("askBotAI error", res.status, bodyText);
    if (diag) { diag.reason = "http_error"; diag.status = res.status; diag.detail = truncateText(bodyText, 500); }
    return null;
  }
  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === "text");
  if (!block || !block.text.trim()) {
    if (diag) { diag.reason = "empty_response"; diag.detail = truncateText(JSON.stringify(data).slice(0, 500), 500); }
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(block.text);
  } catch (err) {
    console.error("askBotAI: failed to parse JSON response", err, block.text);
    if (diag) { diag.reason = "json_parse_failed"; diag.detail = truncateText(block.text, 300); }
    return null;
  }
  const classification = {
    intent: typeof parsed.intent === "string" ? parsed.intent : "unknown",
    sentiment: typeof parsed.sentiment === "string" ? parsed.sentiment : "neutral",
    urgency: typeof parsed.urgency === "string" ? parsed.urgency : "low",
    requiresHuman: parsed.requires_human === true,
  };
  // should_respond: false is a deliberate, valid outcome — the model judged
  // this doesn't need a reply (not really addressed to it, a one-word
  // reaction, spam, someone else's conversation) — distinct from a genuine
  // failure (which falls back to the canned pool instead of staying quiet).
  if (parsed.should_respond === false) return { shouldRespond: false, ...classification };
  if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
    if (diag) diag.reason = "empty_reply_field";
    return null;
  }
  return {
    shouldRespond: true,
    reply: truncateText(parsed.reply.trim(), 3500), // Telegram's 4096-char cap, with headroom
    ...classification,
  };
}

// Google's Gemma 4 26B A4B ("built from Gemini 3 research to maximize
// intelligence-per-parameter" — Cloudflare's own description), the model
// Cloudflare's current get-started guide showcases as its flagship example
// — the strongest signal of active support/testing among the catalog. A4B
// (~4B active params of the 26B total) keeps it cheap: at a typical reply's
// size (~1500 input + ~250 output tokens) this costs roughly 20 of the
// 10,000 free Neurons/day Cloudflare grants on the Workers Free plan —
// hundreds of free replies/day of headroom for this bot's actual traffic.
// Chosen over the smaller Llama 3.1 8B this used to run on for Google's
// generally stronger multilingual coverage (relevant for a Ukrainian-first
// chat) — see wrangler.toml's [ai] binding for how this connects.
const WORKERS_AI_MODEL = "@cf/google/gemma-4-26b-a4b-it";

// A short, direct persona for the free tier — deliberately NOT the full
// ASK_BOT_SYSTEM_PROMPT: that prompt's should_respond/intent/sentiment/
// urgency JSON instructions are meaningless without Claude's json_schema
// enforcement (Workers AI's JSON mode isn't reliably supported across
// models — see the JSON Mode docs — so this tier never asks for it), and a
// smaller model follows a short prompt more reliably than the long
// multi-section one built for Claude.
const WORKERS_AI_SYSTEM_PROMPT =
  "Ти — дружній AI-асистент у робочому Telegram-чаті магазинів роздрібної мережі JYSK. " +
  "Відповідай коротко (2-4 речення), українською мовою (або мовою звернення), простим текстом " +
  "без Markdown чи JSON-розмітки. Якщо в повідомленні є реальні дані дистрикту (звіти, активність, " +
  "магазини) — використовуй саме їх і не вигадуй цифр чи імен, яких там немає. На привітання чи " +
  "подяку відповідай тепло й коротко. Тримайся простого, живого тону, без канцеляризмів, з легким " +
  "гумором, коли це доречно, не більше 1-2 емодзі на відповідь і не повторюй ту саму фразу-відкриття, що " +
  "й у попередній репліці. " +
  "Якщо додано фото — прокоментуй його ПО СУТІ, а не просто опиши, що на ньому: це чек — назви суму, " +
  "дату, кількість позицій, щось незвичне (знижку, повернення, підозрілу позицію); це стенд чи " +
  "викладка — оціни охайність і привабливість для покупця; це скріншот помилки чи інтерфейсу — процитуй " +
  "ключовий текст помилки, поясни, що це означає, і порадь, що зробити далі; будь-яке інше фото — назви " +
  "головне, що на ньому видно, і перекажи текст, якщо він там є і важливий для відповіді. Якщо на фото " +
  "не видно чогось важливого для відповіді — так і скажи, не вигадуй. Якщо в тексті прямо сказано, що це " +
  "кадр-прев'ю з відео (не саме відео) — прокоментуй те, що видно на кадрі, і чесно уточни, що це лише " +
  "прев'ю, без руху й без звуку.";

// The free second AI tier: Cloudflare's own hosted model via env.AI, tried
// when Claude isn't configured/available (askBotAI returned null) for a
// plain-text question — no attachment, since this text model can't see
// images/PDFs the way askBotAI's Claude path can. No API key to manage:
// the binding itself is the credential. Unlike askBotAI, always returns
// shouldRespond:true when it succeeds (this tier has no silence/should-
// respond judgment) and a fixed, honest classification — there's no
// reliable structured output here to draw a real one from.
// `imageDataUrl` (optional): a photo attached to the question — a receipt,
// a shelf/stand photo, a screenshot — as a `data:...;base64,...` URL (see
// buildAskBotMediaBlocks, which builds this once alongside the Claude-
// shaped block, no second download). When present, the user message becomes
// an OpenAI-style content-block array (confirmed shape — see
// extractReportNumbersFromPhoto) instead of a plain string, so this free
// tier can also comment on photos, not just answer text questions.
async function askWorkersAI(env, query, recentMessages, activitySnapshot, districtInfo, meta, imageDataUrl) {
  if (!env.AI) return null; // binding not present (shouldn't happen once wrangler.toml declares it, but defensive)
  const queryText = `${districtInfo || ""}${activitySnapshot || ""}${buildAskBotContext(recentMessages)}${meta || ""}${query || "Привіт!"}`;
  const userContent = imageDataUrl
    ? [{ type: "text", text: queryText }, { type: "image_url", image_url: { url: imageDataUrl } }]
    : queryText;
  let result;
  try {
    result = await env.AI.run(WORKERS_AI_MODEL, {
      messages: [
        { role: "system", content: WORKERS_AI_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 400,
      // Gemma 4 supports extended reasoning ("reasoning": true in its model
      // card) — off by default here: a short chat reply doesn't need it,
      // and skipping it keeps latency and Neuron cost down.
      chat_template_kwargs: { enable_thinking: false },
    });
  } catch (err) {
    console.error("askWorkersAI failed", err);
    return null;
  }
  // Defensive on the response shape: the classic Workers AI text-generation
  // format is { response: "..." }, but some newer/flagship models instead
  // return an OpenAI-style { choices: [{ message: { content } }] } object —
  // accept either rather than assume.
  const text = (typeof result?.response === "string" && result.response.trim())
    || result?.choices?.[0]?.message?.content?.trim();
  if (!text) return null;
  return {
    shouldRespond: true,
    reply: truncateText(text, 3500),
    intent: "unknown",
    sentiment: "neutral",
    urgency: "low",
    requiresHuman: false,
  };
}

const ASK_BOT_MAX_MEDIA_BYTES = 4 * 1024 * 1024; // Telegram photos are well under this; guards oversized documents
const ASK_BOT_MAX_TEXT_DOC_BYTES = 200 * 1024; // plenty for a text file, keeps token cost sane
const ASK_BOT_TEXT_DOC_EXT = new Set(["txt", "md", "csv", "log", "json", "yaml", "yml", "ini", "conf"]);

// Turns whatever's attached to the triggering message into Claude content
// blocks. Returns { attempted, ok, blocks }: `attempted` is true whenever
// there WAS something to try reading (photo/document/voice/audio/video);
// `ok` says whether that attempt produced something usable. The caller
// treats "attempted but not ok" as the one case worth an explicit
// I-couldn't-read-this reply — a plain text mention has nothing attached at
// all, so `attempted` stays false and that path is untouched.
async function buildAskBotMediaBlocks(env, msg) {
  if (msg.photo && msg.photo.length) {
    const largest = msg.photo[msg.photo.length - 1];
    const filePath = await tgGetFilePath(env, largest.file_id);
    if (!filePath) return { attempted: true, ok: false, blocks: [] };
    const bytes = await tgDownloadFileBytes(env, filePath);
    if (!bytes || !bytes.length || bytes.length > ASK_BOT_MAX_MEDIA_BYTES) return { attempted: true, ok: false, blocks: [] };
    const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
    const mediaType = QUIZ_AI_IMAGE_MEDIA_TYPES[ext] || "image/jpeg";
    const base64 = bytesToBase64(bytes);
    // imageDataUrl: the SAME image, reshaped for Workers AI's OpenAI-style
    // image_url content block instead of Claude's {type:"image", source}
    // shape — computed once here (not re-downloaded) so askWorkersAI can
    // also see photos (receipts, stand/shelf photos, screenshots) when
    // Claude isn't available, not just plain text questions.
    return {
      attempted: true,
      ok: true,
      blocks: [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }],
      imageDataUrl: `data:${mediaType};base64,${base64}`,
    };
  }

  if (msg.document) {
    const fileName = msg.document.file_name || "";
    const mime = msg.document.mime_type || "";
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    const filePath = await tgGetFilePath(env, msg.document.file_id);
    if (!filePath) return { attempted: true, ok: false, blocks: [] };
    const bytes = await tgDownloadFileBytes(env, filePath);
    if (!bytes || !bytes.length || bytes.length > ASK_BOT_MAX_MEDIA_BYTES) return { attempted: true, ok: false, blocks: [] };

    if (mime === "application/pdf" || ext === "pdf") {
      return { attempted: true, ok: true, blocks: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytesToBase64(bytes) } }] };
    }
    if (ASK_BOT_TEXT_DOC_EXT.has(ext) || mime.startsWith("text/")) {
      if (bytes.length > ASK_BOT_MAX_TEXT_DOC_BYTES) return { attempted: true, ok: false, blocks: [] };
      const text = new TextDecoder("utf-8").decode(bytes);
      return { attempted: true, ok: true, blocks: [{ type: "text", text: `Вміст файлу «${fileName}»:\n\n${text}` }] };
    }
    return { attempted: true, ok: false, blocks: [] }; // e.g. .docx/.xlsx — not something this can read
  }

  // Video/video_note: neither Claude's API nor this Workers AI model takes
  // video input, and decoding frames ourselves isn't practical in a
  // Workers runtime (no ffmpeg-equivalent here) — but Telegram already
  // extracts a JPEG thumbnail for every video on upload
  // (Video/VideoNote.thumbnail — some older clients still send the field
  // as `thumb`, so both are checked). Treated exactly like a regular photo
  // from there, PLUS `mediaNote`: a short caveat the caller (cmdAskBot)
  // folds into both models' shared `meta` context, so neither one ever
  // claims to have watched motion or heard audio — only seen one still
  // frame from the clip.
  const videoThumb = msg.video?.thumbnail || msg.video?.thumb || msg.video_note?.thumbnail || msg.video_note?.thumb;
  if (videoThumb) {
    const filePath = await tgGetFilePath(env, videoThumb.file_id);
    if (!filePath) return { attempted: true, ok: false, blocks: [] };
    const bytes = await tgDownloadFileBytes(env, filePath);
    if (!bytes || !bytes.length || bytes.length > ASK_BOT_MAX_MEDIA_BYTES) return { attempted: true, ok: false, blocks: [] };
    const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
    const mediaType = QUIZ_AI_IMAGE_MEDIA_TYPES[ext] || "image/jpeg";
    const base64 = bytesToBase64(bytes);
    return {
      attempted: true,
      ok: true,
      blocks: [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }],
      imageDataUrl: `data:${mediaType};base64,${base64}`,
      mediaNote: "Додано один кадр-прев'ю з відео (не саме відео і без звуку) — проаналізуй, що видно на цьому кадрі, і чесно уточни в відповіді, що це лише прев'ю, а не весь перегляд ролика.",
    };
  }

  // A video/video_note that for some reason has no thumbnail at all (rare,
  // but possible) still needs to count as "attempted" — otherwise it'd
  // silently fall through to `attempted: false` below, which the caller
  // reads as "nothing was even attached" and skips the honest failure
  // reply entirely instead of explaining it couldn't read it.
  // Voice/audio: genuinely nothing visual to fall back on either way — no
  // frame, no transcription — so this stays an honest (and, per the brief,
  // funny) "can't do this" reply instead of pretending to have listened.
  if (msg.video || msg.video_note || msg.voice || msg.audio) {
    return { attempted: true, ok: false, blocks: [] };
  }

  return { attempted: false, ok: false, blocks: [] };
}

// Best-effort visual reading of a report sent as a screenshot (POS/BI
// dashboard, or a photo of a handwritten note) instead of typed-out
// numbers — tried by trackActivity only when the report message's own
// text/caption had nothing parseReportFactNumbers could find. Reuses the
// SAME free Workers AI model/binding as askWorkersAI, and the content-block
// shape is confirmed straight from that model's own input schema
// (@cf/google/gemma-4-26b-a4b-it's card documents `content` as an array of
// {type: "text"} / {type: "image_url", image_url: {url}} blocks — the
// standard OpenAI vision convention, not the older top-level `image` field
// some other Workers AI vision models use). The model is asked to answer in
// the exact same "Виторг: N" line format the text parser already expects,
// so the result just gets handed to parseReportFactNumbers — no second
// parser to maintain.
async function extractReportNumbersFromPhoto(env, msg) {
  if (!env.AI || !msg.photo?.length) return null;
  const largest = msg.photo[msg.photo.length - 1];
  const filePath = await tgGetFilePath(env, largest.file_id);
  if (!filePath) return null;
  const bytes = await tgDownloadFileBytes(env, filePath);
  if (!bytes || !bytes.length || bytes.length > ASK_BOT_MAX_MEDIA_BYTES) return null;
  const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
  const mediaType = QUIZ_AI_IMAGE_MEDIA_TYPES[ext] || "image/jpeg";
  try {
    const result = await env.AI.run(WORKERS_AI_MODEL, {
      messages: [
        {
          role: "system",
          content: "Це фото/скріншот вечірнього звіту магазину роздрібної мережі (каса, BI-система чи рукописний список). " +
            "Знайди РЕАЛЬНІ (фактичні, не план чи ціль) значення показників і виведи ТІЛЬКИ рядки у форматі, без жодних " +
            "інших слів чи пояснень:\nВиторг: <число>\nПокупці: <число>\nСередня покупка: <число>\nЕнерджі: <число>\n" +
            "Пропускай рядок повністю, якщо відповідного значення не видно на фото — не вигадуй цифр.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Що тут написано?" },
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${bytesToBase64(bytes)}` } },
          ],
        },
      ],
      max_tokens: 200,
      chat_template_kwargs: { enable_thinking: false },
    });
    const text = (typeof result?.response === "string" && result.response)
      || result?.choices?.[0]?.message?.content;
    if (!text) return null;
    return parseReportFactNumbers(text);
  } catch (err) {
    console.error("extractReportNumbersFromPhoto failed", err);
    return null;
  }
}

// Adam asked directly: the bot should "understand" video/video-note
// messages ("кружечки") and comment based on that context — a step up
// from buildAskBotMediaBlocks' existing video handling, which only ever
// looks at a single thumbnail frame (see its own comment: "neither
// Claude's API nor this Workers AI model takes video input"). That's
// still true for the FRAME, but the free Whisper model on this same
// env.AI binding accepts audio (MP4's audio track, or a voice OGG/Opus
// note directly — confirmed against a real working example, not
// assumed) — no ffmpeg, no frame extraction, no new API key. So the
// actual context this reads is what the person SAID, not what's
// visually in frame — the right trade for a colleague talking to camera
// (or just talking) in a work chat. Adam then asked for the same
// treatment on plain voice messages too, once he saw this work.
//
// Unlike the @mention ask-bot (cmdAskBot), this fires automatically on
// every video/video_note/voice message in a tracked chat, not on
// request — so it deliberately stays on the FREE Workers AI tier for
// the comment step too (not Claude), even when ANTHROPIC_API_KEY is
// set, so an active chat full of voice/video notes can't run up API
// spend nobody opted into. Silent on any failure (no speech, download
// too big, model error) — an automatic feature nagging "couldn't
// understand this" on every music clip or silent recording would be
// worse than saying nothing.
const SPOKEN_COMMENT_MAX_BYTES = 15 * 1024 * 1024; // Telegram's own getFile cap is 20MB; stay well under it
const SPOKEN_COMMENT_MAX_PER_HOUR = 10; // per chat — bounds Neuron spend if a topic gets flooded with voice/video notes

function underSpokenCommentRateCap(state, now) {
  state.videoComment = state.videoComment || { log: [] };
  state.videoComment.log = (state.videoComment.log || []).filter((t) => now - t < 3600000);
  return state.videoComment.log.length < SPOKEN_COMMENT_MAX_PER_HOUR;
}

async function transcribeSpokenMessage(env, msg) {
  if (!env.AI) return null;
  const media = msg.video || msg.video_note || msg.voice;
  if (!media) return null;
  const filePath = await tgGetFilePath(env, media.file_id);
  if (!filePath) return null;
  const bytes = await tgDownloadFileBytes(env, filePath);
  if (!bytes || !bytes.length || bytes.length > SPOKEN_COMMENT_MAX_BYTES) return null;
  try {
    const result = await env.AI.run("@cf/openai/whisper", { audio: [...bytes] });
    const text = typeof result?.text === "string" ? result.text.trim() : "";
    return text || null;
  } catch (err) {
    console.error("transcribeSpokenMessage failed", err);
    return null;
  }
}

const SPOKEN_COMMENT_SYSTEM_PROMPT =
  "Ти — доброзичливий колега в робочому Telegram-чаті мережі магазинів JYSK. " +
  "Тобі дають транскрипт того, що людина щойно сказала у голосовому чи відеоповідомленні в чаті. " +
  "Напиши КОРОТКИЙ (1–2 речення) теплий, конкретний по суті сказаного коментар-реакцію українською — " +
  "не загальну фразу на кшталт \"дякую за повідомлення\". Якщо з транскрипту незрозуміло, про що йдеться " +
  "(обірваний, беззмістовний чи надто короткий текст) — просто доброзичливо відреагуй, не вигадуючи деталей.";

async function buildSpokenContextComment(env, transcript) {
  if (!env.AI || !transcript) return null;
  let result;
  try {
    result = await env.AI.run(WORKERS_AI_MODEL, {
      messages: [
        { role: "system", content: SPOKEN_COMMENT_SYSTEM_PROMPT },
        { role: "user", content: `Транскрипт повідомлення: "${transcript}"` },
      ],
      max_tokens: 200,
      chat_template_kwargs: { enable_thinking: false },
    });
  } catch (err) {
    console.error("buildSpokenContextComment failed", err);
    return null;
  }
  const text = (typeof result?.response === "string" && result.response.trim())
    || result?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

// Powers the "Хіхоньки та хахаоньки" fun-topic posts (see cmdSetFunTopic
// and processChatSchedule's state.funTopic block) — free env.AI only, same
// as buildSpokenContextComment above, so this never touches the paid
// Claude path or costs anything. A rotating "angle" is picked per call and
// folded into the prompt (not stored anywhere) purely to stop consecutive
// posts from converging on the same joke shape every time — the model has
// no memory between calls otherwise.
const FUNNY_POST_ANGLES = [
  "короткий анекдот",
  "каламбур або гра слів",
  "смішне спостереження про офісне чи торгове життя",
  "жартівлива мотивація на сьогодні",
  "коротка абсурдна гіпотетична ситуація",
  "жарт у форматі запитання-відповідь",
];

const FUNNY_POST_SYSTEM_PROMPT =
  "Ти — колега в робочому Telegram-чаті мережі магазинів JYSK в Україні, у темі, яка існує ЛИШЕ для того, щоб " +
  "піднімати настрій команді. Напиши ОДИН короткий (1–3 речення) смішний, добрий пост українською — без сарказму, " +
  "без політики, без нічого, що могло б когось образити чи бути недоречним у робочому чаті з керівником і колегами. " +
  "Можна один доречний емодзі в кінці. Без вступних фраз на кшталт \"ось жарт\" — одразу сам пост.";

async function buildFunnyPost(env) {
  if (!env.AI) return null;
  const angle = FUNNY_POST_ANGLES[Math.floor(Math.random() * FUNNY_POST_ANGLES.length)];
  let result;
  try {
    result = await env.AI.run(WORKERS_AI_MODEL, {
      messages: [
        { role: "system", content: FUNNY_POST_SYSTEM_PROMPT },
        { role: "user", content: `Формат на цей раз: ${angle}.` },
      ],
      max_tokens: 200,
      chat_template_kwargs: { enable_thinking: false },
    });
  } catch (err) {
    console.error("buildFunnyPost failed", err);
    return null;
  }
  const text = (typeof result?.response === "string" && result.response.trim())
    || result?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

async function maybeCommentOnSpokenMessage(chatId, msg, env) {
  if (!env.AI) return;
  const state = await getState(env, chatId);
  const now = Date.now();
  if (!underSpokenCommentRateCap(state, now)) return;
  const transcript = await transcribeSpokenMessage(env, msg);
  if (!transcript) return;
  const comment = await buildSpokenContextComment(env, transcript);
  if (!comment) return;
  state.videoComment.log.push(now);
  await setState(env, chatId, state);
  try {
    await tg(env, "sendMessage", withThread({
      chat_id: chatId, text: comment, reply_to_message_id: msg.message_id,
    }, msg.message_thread_id));
  } catch (err) {
    console.error("maybeCommentOnSpokenMessage: sending reply failed", err);
  }
}

// Simple per-chat rate limit on the (paid) AI path — a burst of mentions
// still gets an instant canned reply either way, this only decides whether
// that reply costs an API call. Reuses the free-fallback pool once the cap
// is hit within the last hour, same graceful-degradation shape as no key
// being configured at all.
function underAskBotRateCap(state, now) {
  state.askBot = state.askBot || { log: [] };
  state.askBot.log = (state.askBot.log || []).filter((t) => now - t < 3600000);
  return state.askBot.log.length < ASK_BOT_MAX_PER_HOUR;
}

// Everything here is behind try/catch on purpose: this used to have zero
// error handling, so a single transient failure ANYWHERE in the chain (a
// Telegram getMe hiccup, a Firestore blip, a malformed roster doc) threw all
// the way up to handleUpdate's outer catch — which only logs and swallows
// it — leaving the person who typed "бот" with total silence, not even the
// canned fallback that's supposed to be the worst case. A real occurrence
// of this (four separate messages, zero replies, zero askBot.log entries)
// is what this rewrite fixes: every risky step below degrades to "send the
// canned fallback" instead of aborting the whole function.
async function cmdAskBot(chatId, msg, env) {
  let media;
  try {
    media = await buildAskBotMediaBlocks(env, msg);
  } catch (err) {
    console.error("cmdAskBot: buildAskBotMediaBlocks failed", err);
    media = { attempted: false, ok: false, blocks: [] };
  }
  if (media.attempted && !media.ok) {
    // Something was attached but nothing here can read it (unsupported
    // type, download failed, too large, or voice/audio — genuinely no
    // visual frame to fall back on) — the humor-fallback reply from the
    // brief, no AI call, no cost.
    try {
      await tg(env, "sendMessage", withThread({
        chat_id: chatId,
        text: ASK_BOT_MEDIA_FAIL_REPLIES[Math.floor(Math.random() * ASK_BOT_MEDIA_FAIL_REPLIES.length)],
        reply_to_message_id: msg.message_id,
      }, msg.message_thread_id ?? null));
    } catch (err) {
      console.error("cmdAskBot: media-fail sendMessage failed", err);
    }
    return;
  }

  const nowMs = Date.now();
  let state = null;
  try {
    state = await getState(env, chatId);
  } catch (err) {
    console.error("cmdAskBot: getState failed", err);
  }

  // Real-data context (store roster, activity snapshot, district info) is
  // shared by EVERY tier below — Claude, Workers AI, and matchFreeIntent
  // all want the same facts. Computed once here (rather than once per
  // tier, as before) so falling through several tiers in one request
  // doesn't re-read the same Firestore doc multiple times.
  const nowInfo = kyivNow(nowMs);
  let stores = [];
  let snapshot = "";
  let districtInfo = "";
  if (state) {
    try {
      stores = await getStoreRoster(env);
      snapshot = await buildActivitySnapshot(stores, state, nowInfo);
      districtInfo = buildDistrictInfo(stores);
    } catch (err) {
      console.error("cmdAskBot: loading district data failed", err);
    }
  }

  let query = "";
  let result = null;
  let diag = null;
  // The asker's own linked store (state.storeMembers, set by /mystore or
  // auto-detected from a report they sent) — threaded through both the AI
  // meta line and the free-intent matcher below (outside the try, since
  // matchFreeIntent runs later even when the AI tiers throw) so "у нас"/
  // "я активний?" can resolve to THIS person, not just names/codes
  // mentioned explicitly.
  const asker = { id: msg.from?.id, storeCode: state?.storeMembers?.[String(msg.from?.id)] };
  try {
    // getBotUsername() is a live Telegram call (getMe) — only needed to
    // strip "@BotName" out of the query text, purely cosmetic — not worth
    // letting it take the whole reply down if Telegram hiccups.
    const username = await getBotUsername(env);
    query = extractAskQuery(msg.text ?? msg.caption ?? "", username);
    if (state && underAskBotRateCap(state, nowMs)) {
      // media.mediaNote (only set for a video/video_note thumbnail — see
      // buildAskBotMediaBlocks) folds into this same shared meta text, so
      // BOTH models (Claude's text block and Workers AI's queryText both
      // already include `meta`) see the "this is one preview frame, not
      // the full video" caveat, not just whichever tier happens to run.
      const meta = buildAskBotMeta(msg, displayName(msg.from), asker.storeCode) + (media.mediaNote ? `${media.mediaNote}\n\n---\n\n` : "");
      diag = {};
      result = await askBotAI(env, query, media.blocks, state.recentMessages, snapshot, districtInfo, meta, diag);
      if (result) {
        state.askBot.log.push(nowMs); // counts against the cap regardless of shouldRespond — it was still a real API call
      } else if (env.AI && (!media.attempted || media.imageDataUrl)) {
        // Claude unavailable (no key, or the call failed — diag already has
        // why) — try Cloudflare's own free hosted model (see askWorkersAI)
        // before dropping to the rule-based/canned tiers. Covers a plain
        // text question (!media.attempted) AND a photo (media.imageDataUrl
        // — a receipt, a shelf photo, a screenshot), since this model has
        // vision too; a document/PDF (media.attempted but no imageDataUrl —
        // this free tier has no confirmed document-input shape) still falls
        // through instead. Doesn't touch diag: that field is specifically
        // for Claude failures (/askbotdebug), and this tier has no key to
        // be missing in the first place.
        result = await askWorkersAI(env, query, state.recentMessages, snapshot, districtInfo, meta, media.imageDataUrl);
        if (result) state.askBot.log.push(nowMs);
      }
    }
  } catch (err) {
    console.error("cmdAskBot: building the AI reply failed, falling back to the canned pool", err);
    diag = { reason: "exception", detail: truncateText(String(err?.message || err), 300) };
    result = null;
  }
  // askBotAI only fills in diag.reason on an actual failure path — a
  // successful call (whether it produced a reply, or deliberately decided
  // should_respond:false) leaves diag as {}. So diag.reason is exactly the
  // signal that the AI path was attempted and did NOT work — remember why,
  // since this worker's runtime logs aren't reachable from outside
  // Cloudflare. See /askbotdebug (admin command) to read it back.
  if (state && diag && diag.reason) {
    state.askBotLastError = { ts: nowMs, ...diag };
  }

  // The model judged this doesn't actually need a reply (not really
  // addressed to it, a bare "дякую"/emoji reaction, someone else's
  // conversation, spam) — silence is the deliberate correct outcome here,
  // not a failure, so no fallback message either. Only the AI path can
  // decide this; the canned fallback below has no way to judge it, so it
  // always replies when it's used at all.
  if (result && result.shouldRespond === false) {
    if (state) {
      try {
        await setState(env, chatId, state);
      } catch (err) {
        console.error("cmdAskBot: setState (silent outcome) failed", err);
      }
    }
    return;
  }

  let text, parseMode;
  if (result) {
    text = result.reply;
  } else {
    // Before falling back to a generic canned line, try a free, non-AI
    // substantive answer from the same real data (see matchFreeIntent) —
    // this is what makes "хто сьогодні активний"/"хто керуючий J104" work
    // without any paid API call, for a chat deliberately kept on the free
    // tier. Reuses the stores/nowInfo already loaded above (not a fresh
    // Firestore read) — this branch runs whether or not the AI tiers even
    // ran (no key, rate-capped, or both AI tiers failed).
    let smart = null;
    if (state) {
      try {
        smart = matchFreeIntent(query, state, stores, nowInfo, asker);
      } catch (err) {
        console.error("cmdAskBot: matchFreeIntent failed", err);
      }
    }
    text = smart || ASK_BOT_FALLBACK_REPLIES[Math.floor(Math.random() * ASK_BOT_FALLBACK_REPLIES.length)];
    parseMode = smart ? undefined : "HTML"; // a data answer is plain text, like an AI reply — only the canned pool uses <b>
  }

  let sendRes;
  try {
    sendRes = await tg(env, "sendMessage", withThread({
      chat_id: chatId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      reply_to_message_id: msg.message_id,
    }, msg.message_thread_id ?? null));
  } catch (err) {
    console.error("cmdAskBot: sendMessage failed", err);
  }

  // Feedback loop: only AI replies are worth reviewing (the canned pool is
  // fixed text, nothing to improve by reacting to it) — record just enough
  // to review later (/askbotfeedback) if someone 👎s it. See
  // handleMessageReaction for how reactions turn into feedback.
  const sentId = sendRes?.result?.message_id;
  if (state && result && sentId) {
    state.askBotReplies = state.askBotReplies || {};
    state.askBotReplies[sentId] = {
      query: truncateText(query || "(без тексту)", 200),
      reply: truncateText(text, 400),
      intent: result.intent,
      sentiment: result.sentiment,
      urgency: result.urgency,
      ts: nowMs,
      reactions: {},
    };
    const feedbackKeys = Object.keys(state.askBotReplies);
    if (feedbackKeys.length > MAX_ASKBOT_FEEDBACK) {
      for (const k of feedbackKeys.slice(0, feedbackKeys.length - MAX_ASKBOT_FEEDBACK)) delete state.askBotReplies[k];
    }

    // Structured classification (same single API call, no extra cost — see
    // ASK_BOT_RESPONSE_SCHEMA) flagged this as needing a person's attention.
    // Logged for admin review (/askbotescalations) rather than pinging
    // anyone immediately — the reply text itself already tends to suggest
    // contacting the DM/admin when this fires, per the system prompt; this
    // is the a-posteriori "did anything need me" list, not a live alert.
    if (result.requiresHuman) {
      state.askBotEscalations = state.askBotEscalations || {};
      state.askBotEscalations[sentId] = {
        query: truncateText(query || "(без тексту)", 200),
        reply: truncateText(text, 400),
        intent: result.intent,
        sentiment: result.sentiment,
        urgency: result.urgency,
        from: displayName(msg.from),
        ts: nowMs,
      };
      const escalationKeys = Object.keys(state.askBotEscalations);
      if (escalationKeys.length > MAX_ASKBOT_ESCALATIONS) {
        for (const k of escalationKeys.slice(0, escalationKeys.length - MAX_ASKBOT_ESCALATIONS)) delete state.askBotEscalations[k];
      }
    }
  }

  if (state) {
    try {
      await setState(env, chatId, state);
    } catch (err) {
      console.error("cmdAskBot: final setState failed", err);
    }
  }
}

// /askbotfeedback — admin review of how the AI replies are landing: a quick
// 👍/👎 count plus the actual text of recent 👎-flagged Q&A pairs, so
// there's something concrete to look at (and maybe adjust the system
// prompt over) instead of guessing whether the feature is working well.
async function cmdAskBotFeedback(chatId, env) {
  const state = await getState(env, chatId);
  const entries = Object.values(state.askBotReplies || {});
  if (!entries.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Ще немає відповідей ask-бота під відстеженням — з'являться, щойно хтось звернеться до бота (слово «бот», @згадка чи відповідь на його повідомлення)." });
    return;
  }

  let up = 0;
  let down = 0;
  for (const e of entries) {
    for (const sentiment of Object.values(e.reactions || {})) {
      if (sentiment === "up") up += 1;
      else if (sentiment === "down") down += 1;
    }
  }

  const negative = entries
    .filter((e) => Object.values(e.reactions || {}).includes("down"))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 10);

  const lines = [`📊 Ask-бот: 👍 ${up} · 👎 ${down} (з ${entries.length} відстежуваних відповідей)`];
  if (negative.length) {
    lines.push("", `Останні відповіді з 👎 (${negative.length}):`);
    negative.forEach((e, i) => {
      const meta = e.intent ? ` [${e.intent}/${e.sentiment}/${e.urgency}]` : "";
      lines.push(`${i + 1}. Питання: «${e.query}»${meta}\nВідповідь: «${e.reply}»`);
    });
  } else {
    lines.push("", "Жодного 👎 поки що немає.");
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n") });
}

const URGENCY_MARK = { high: "🔴", medium: "🟡", low: "🟢" };

// /askbotescalations — the "did anything need a human" list: every ask-bot
// interaction the model itself flagged requires_human: true (kadrove/
// conflict/explicit human request/frustrated+high-urgency — see
// ASK_BOT_RESPONSE_SCHEMA), most recent first. Nobody gets pinged live when
// this happens — this command is the on-demand review instead, so checking
// it is a deliberate habit, not something the bot nags about.
async function cmdAskBotEscalations(chatId, env) {
  const state = await getState(env, chatId);
  const entries = Object.values(state.askBotEscalations || {}).sort((a, b) => b.ts - a.ts);
  if (!entries.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Жодного звернення, що потребувало б уваги людини, поки що не було." });
    return;
  }
  const lines = [`📌 <b>Звернення, що можуть потребувати уваги (${entries.length})</b>`, ""];
  entries.slice(0, 15).forEach((e, i) => {
    const mark = URGENCY_MARK[e.urgency] || "⚪";
    lines.push(`${i + 1}. ${mark} ${escapeHtml(e.from)} (${e.intent}/${e.sentiment}):\n«${escapeHtml(e.query)}»`);
  });
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
}

// Human-readable labels for askBotAI's diag.reason codes — see askBotAI and
// cmdAskBot (state.askBotLastError) for where these get set.
const ASKBOT_ERROR_LABELS = {
  no_api_key: "ANTHROPIC_API_KEY не налаштований у Cloudflare (секрет відсутній)",
  fetch_failed: "Не вдалося з'єднатися з Anthropic API (мережева помилка)",
  timeout: "Запит до Claude не встиг за 15 секунд і був перерваний",
  http_error: "Anthropic API повернув помилку (неправильний ключ, ліміт, недоступна модель тощо)",
  empty_response: "Claude повернув відповідь без текстового блоку",
  json_parse_failed: "Відповідь Claude не вдалося розпарсити як JSON",
  empty_reply_field: "Claude вирішив відповісти, але поле reply лишилось порожнім",
  exception: "Несподівана помилка під час підготовки AI-відповіді",
};

// /askbotdebug — the one thing that was missing while diagnosing a real
// incident: this worker's console.error logs live inside Cloudflare and
// aren't reachable from outside it, so a null result from askBotAI (which
// silently falls back to the canned pool — by design, see cmdAskBot) used
// to be a dead end to investigate. Now cmdAskBot records the actual reason
// into state.askBotLastError every time the AI path is attempted and fails
// — this just reads it back in the chat, admin-only.
async function cmdAskBotDebug(chatId, env) {
  const state = await getState(env, chatId);
  const err = state.askBotLastError;
  if (!err) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Ще жодного разу AI-відповідь ask-бота не падала з помилкою (або ще не було спроб) — усе гаразд." });
    return;
  }
  // "no_api_key" isn't a failure to fix — it's the deliberate free-tier
  // state (no ANTHROPIC_API_KEY set), and the bot is fully designed to run
  // that way indefinitely (see ASK_BOT_FALLBACK_REPLIES). Every other
  // reason is a genuine AI-call failure worth investigating.
  if (err.reason === "no_api_key") {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: "🤖 Бот працює в безкоштовному режимі — без ANTHROPIC_API_KEY. Це не помилка: слово «бот» і далі отримує відповідь із заготовленого набору фраз, просто без реального аналізу Claude. Щоб увімкнути предметні AI-відповіді — знадобиться платний ключ, деталі в README.",
    });
    return;
  }
  const when = new Date(err.ts).toISOString();
  const label = ASKBOT_ERROR_LABELS[err.reason] || err.reason || "невідома причина";
  const lines = [
    `🛠 <b>Остання помилка AI-відповіді ask-бота</b>`,
    ``,
    `Коли: ${when}`,
    `Причина: ${escapeHtml(label)}`,
  ];
  if (err.status) lines.push(`HTTP статус: ${err.status}`);
  if (err.detail) lines.push(`Деталі: <code>${escapeHtml(err.detail)}</code>`);
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
}

// Even with /registerwebhook available as a one-command fix, it still
// depends on a human remembering to run it — and in practice one chat's
// webhook sat registered without message_reaction_count for days (found by
// checking real reaction counts on tracked messages: 0 out of 19, in a
// ~44-person active chat — for that many messages to genuinely get zero
// reactions over several days is far less likely than the registration
// step having simply never been (re-)run). Every real Telegram update
// already carries this worker's own URL for free (see `selfUrl` in
// fetch() below), so instead of waiting on a human, every single incoming
// update quietly re-asserts the FULL current allowed_updates list itself —
// at most once per WEBHOOK_SELFHEAL_INTERVAL_MS, tracked in a small global
// Firestore doc (not per-chat: one bot has exactly one webhook regardless
// of how many chats it's in). Same idempotent Telegram call
// /registerwebhook makes, just running on its own; also means any FUTURE
// addition to WEBHOOK_ALLOWED_UPDATES (this has already happened several
// times in this project) takes effect on its own too, no new manual step
// ever needed again. Silent — this is routine background upkeep, not
// something worth a chat message every few hours.
const WEBHOOK_SELFHEAL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const WEBHOOK_SELFHEAL_DOC_ID = "webhook-selfheal";

async function maybeSelfHealWebhook(env, selfUrl) {
  if (!env.BOT_TOKEN || !selfUrl) return;
  try {
    const raw = await firestoreGetRaw(env, BOT_COLLECTION, WEBHOOK_SELFHEAL_DOC_ID);
    const lastCheckedTs = raw ? JSON.parse(raw).lastCheckedTs || 0 : 0;
    if (Date.now() - lastCheckedTs < WEBHOOK_SELFHEAL_INTERVAL_MS) return;

    await fetch(`${TELEGRAM_API}${env.BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: selfUrl,
        ...(env.WEBHOOK_SECRET ? { secret_token: env.WEBHOOK_SECRET } : {}),
        allowed_updates: WEBHOOK_ALLOWED_UPDATES,
      }),
    });
    await firestoreSetRaw(env, BOT_COLLECTION, WEBHOOK_SELFHEAL_DOC_ID, JSON.stringify({ lastCheckedTs: Date.now() }));
  } catch (err) {
    console.error(`maybeSelfHealWebhook failed: ${err?.message || err}`, err?.stack || "");
  }
}

// One admin command instead of pasting a raw setWebhook URL into a browser —
// this runs INSIDE the worker, which has normal internet access to Telegram
// (unlike whatever ran /registerwebhook's development), and reads `selfUrl`
// straight off this very request, so it can never point the webhook at the
// wrong host. Re-registers with the full allowed_updates list, in particular
// "callback_query" — without that, /menu's buttons render but never respond.
async function cmdRegisterWebhook(chatId, env, selfUrl) {
  if (!env.BOT_TOKEN) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "BOT_TOKEN не налаштований — немає чим викликати Telegram API." });
    return;
  }
  if (!selfUrl) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Не вдалося визначити URL воркера з цього запиту." });
    return;
  }
  let res, data;
  try {
    res = await fetch(`${TELEGRAM_API}${env.BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: selfUrl,
        ...(env.WEBHOOK_SECRET ? { secret_token: env.WEBHOOK_SECRET } : {}),
        allowed_updates: WEBHOOK_ALLOWED_UPDATES,
      }),
    });
    data = await res.json();
  } catch (err) {
    console.error("cmdRegisterWebhook: setWebhook call failed", err);
    await tg(env, "sendMessage", { chat_id: chatId, text: "⚠️ Не вдалося зв'язатися з Telegram API, спробуйте ще раз." });
    return;
  }
  if (data?.ok) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "✅ Webhook переоформлено — кнопки в /menu тепер відповідатимуть на натискання." });
  } else {
    await tg(env, "sendMessage", { chat_id: chatId, text: `⚠️ Telegram відхилив запит: ${data?.description || res.status}` });
  }
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

// The other half of /storemembers — who the bot has seen (state.names) but
// hasn't linked to a store yet (not a key in state.storeMembers). This is
// what the kyiv1-daily-check skill used to compute itself by reading this
// chat's Firestore doc directly over the open REST API; now that
// telegram-bot/{doc} is locked to `allow ... if false` (service-account
// only, see firestore.rules), that read is no longer possible from outside
// the bot — so the skill now runs this command instead, through the bot's
// own authenticated access, and does the "is this a confident link"
// judgment call on the resulting list itself rather than deciding blind.
async function cmdUnlinked(chatId, env) {
  const state = await getState(env, chatId);
  const linked = new Set(Object.keys(state.storeMembers || {}));
  const entries = Object.entries(state.names || {}).filter(([uid]) => !linked.has(uid));
  if (!entries.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Усі, кого бот бачив у цьому чаті, вже прив'язані до магазину." });
    return;
  }
  const lines = entries.map(([uid, name]) => `• ${name} (id ${uid})`);
  await tg(env, "sendMessage", { chat_id: chatId, text: `❔ Без прив'язки до магазину:\n${lines.join("\n")}\n\n/linkstore J104 — прив'язати (відповіддю на повідомлення учасника).` });
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

// No longer auto-binds a photo-reports topic from a bare-store-code caption
// alone — that heuristic mis-fired for real: a single unrelated photo in
// "Лайфхаки/Best practice" happened to be captioned with just a store code
// and got that topic silently bound as the official photo-reports topic,
// which then posted the daily "ще не надіслали фото" reminder there. Adam
// asked directly not to do that. Binding now only ever happens through the
// explicit /setphotoreportstopic command (see its case below) — a human
// confirming the topic on purpose, not a guess from one message.
async function trackPhotoReport(chatId, msg, env) {
  const state = await getState(env, chatId);
  const pt = state.photoReportsTopic;
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

// /zvit — the on-request "console window" (see REPORT_FORM_HTML's own
// comment for why it's request-only, DMed, not posted in the topic
// itself). Anyone in the chat can ask for it, same as /reportstatus — no
// reason to gate this behind admin.
async function cmdReportForm(chatId, msg, env, selfUrl) {
  const state = await getState(env, chatId);
  if (!state.reportsTopic) {
    await replyTo(env, msg, "Тема звітів ще не налаштована. Зайдіть у потрібну тему форуму й напишіть там /setreportstopic.");
    return;
  }
  await sendReportFormButton(chatId, msg, env, selfUrl, state);
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

// Adam asked for "general motivation, not per person but by store-number
// mentions" — a simpler alternative to per-person hour-of-day timing (which
// would've needed new activity-by-hour tracking this bot doesn't have).
// Instead of scheduling anything, this just rides on top of ordinary chat
// traffic: whenever someone writes a recognizable store code anywhere in
// the chat (outside the reports/photo-reports topics, which already get
// plenty of their own automatic replies), there's a modest random chance
// of a short motivational line naming that store. Adam's own framing —
// "тоді і до часу ми не сильно прив'язані" — is exactly why this is
// probabilistic rather than clock-based: no schedule to get right, no new
// per-user data to collect, just an occasional warm ping riding real
// mentions. Capped at once per store per day (state.storeMotivation) so a
// store mentioned repeatedly in one conversation doesn't get pinged twice.
const STORE_MOTIVATION_FIRE_CHANCE = 0.25;
const STORE_MOTIVATION_PHRASES = [
  "{code}, так тримати — команда бачить вашу роботу 💪",
  "Гарний темп, {code}! Продовжуйте в тому ж дусі 🔥",
  "{code}, ви на правильному шляху — не зупиняйтесь 🚀",
  "Молодці, {code}! Кожен день у справі — це результат 🙌",
  "{code}, район пишається такою командою 👏",
  "Впевнена робота, {code} — так і тримати 🌟",
  "{code}, ваша активність надихає інших 💯",
  "Гарна динаміка, {code}! Ще трохи — і буде відмінно 📈",
  "{code}, дякуємо за старання щодня 🙏",
  "Так тримати, {code} — результат не забариться 🔥",
  "{code}, команда з вас приклад бере 👍",
  "Впевнено йдете вперед, {code} 🚀",
  "{code}, кожен ваш крок помітний — дякуємо 🙌",
  "Сильна робота, {code}! Продовжуйте 💪",
  "{code}, район вірить у вашу команду 🌟",
  "Дякуємо за енергію, {code} — це відчувається 🔥",
];

function buildStoreMotivationLine(code) {
  const phrase = STORE_MOTIVATION_PHRASES[Math.floor(Math.random() * STORE_MOTIVATION_PHRASES.length)];
  return phrase.replace("{code}", code);
}

async function maybeSendStoreMotivation(chatId, msg, env) {
  if (!msg.text) return;
  const state = await getState(env, chatId);
  // Skip the reports/photo-reports topics -- those already get an
  // automatic reply (report card, trend comment, ack) on nearly every
  // message; stacking a second, unrelated ping on top would be noise.
  if (state.reportsTopic && msg.message_thread_id === state.reportsTopic.threadId) return;
  if (state.photoReportsTopic && msg.message_thread_id === state.photoReportsTopic.threadId) return;
  const stores = await getStoreCodes(env);
  const codes = detectStoreCodes(msg.text, stores);
  if (!codes.length) return;
  const day = kyivNow(Date.now()).dateStr;
  state.storeMotivation = state.storeMotivation || {};
  for (const code of codes) {
    if (state.storeMotivation[code] === day) continue;
    if (Math.random() > STORE_MOTIVATION_FIRE_CHANCE) continue;
    state.storeMotivation[code] = day;
    await setState(env, chatId, state);
    try {
      await tg(env, "sendMessage", withThread({
        chat_id: chatId, text: buildStoreMotivationLine(code),
      }, msg.message_thread_id));
    } catch (err) {
      console.error("maybeSendStoreMotivation: sending failed", err);
    }
    break; // one ping per message even if several store codes were mentioned
  }
}

// Adam's own follow-up request, on top of the fun topic above: a friendly,
// specifically-Andriy running joke, posted into that same topic —
// "аналізуй його окремо" (track him separately from the general store-
// motivation feature above) and "дивись коли він активний" (ride his own
// real message activity rather than a fixed clock, same probabilistic-on-
// real-traffic shape as maybeSendStoreMotivation). Targets ONE specific
// Telegram user id, not "whoever storeMembers currently has linked to
// J015" — that store has five different people linked in it (real store
// staff, not just the manager), and Adam pointed at one individual
// specifically, so a store-code check would have teased four other
// people who aren't him. Identifying the right one took three rounds
// with Adam directly: state.names had this account cached as "BAFA"
// (from whenever they first appeared) rather than the "Andruv" name
// Telegram now shows for them — Adam confirmed the match after ruling
// out two other "Андрій"-named accounts linked to different stores.
// {time} in a phrase is the real HH:MM of his own message — the "watch
// when he's active" part made concrete — not a random/fake time.
const ANDRIY_TELEGRAM_USER_ID = "741350794"; // "Andruv", cached as "BAFA", J015 manager per Adam
const ANDRIY_TEASE_FIRE_CHANCE = 0.25;
// Adam's own preferred address terms for him specifically — see the
// comment above ANDRIY_TELEGRAM_USER_ID — rotated across phrases instead
// of always "Андрію" so it reads like real friendly banter, not a
// find-and-replace.
const ANDRIY_TEASE_PHRASES = [
  "Братан, знову на зв'язку о {time} — J015 без тебе не крутиться? 😄",
  "О, кент з'явився! J015, тримайте темп 😏",
  "Кореш, ти сьогодні вже в чаті о {time} — все під контролем, чи просто скучив за нами? 👀",
  "J015 на зв'язку — братишка, розкажи вже секрет свого графіка 😄",
  "Ліпший мій, твоя активність у чаті — окрема тема для дисертації 📚😏",
  "Знову братан о {time}! J015 явно в надійних руках 💪",
  "Кент, а десь у J015 зараз хтось працює, поки ти тут пишеш? 😄👀",
  "Легендарний кореш знову в ефірі — J015, вітаємо свого найактивнішого 🏆",
  "Братишка, о {time} — це вже офіційно твій робочий час у чаті? 😏",
  "J015 forever — ліпший мій, дякуємо, що завжди на зв'язку 🙌",
];

function buildAndriyTeaseLine(hhmm) {
  const phrase = ANDRIY_TEASE_PHRASES[Math.floor(Math.random() * ANDRIY_TEASE_PHRASES.length)];
  return phrase.replace("{time}", hhmm);
}

async function maybeTeaseAndriy(chatId, msg, env) {
  if (!msg.text) return;
  const state = await getState(env, chatId);
  if (!state.funTopic) return; // nowhere to post it
  if (String(msg.from.id) !== ANDRIY_TELEGRAM_USER_ID) return;
  // Same noise-avoidance as maybeSendStoreMotivation — those topics already
  // reply to nearly every message on their own.
  if (state.reportsTopic && msg.message_thread_id === state.reportsTopic.threadId) return;
  if (state.photoReportsTopic && msg.message_thread_id === state.photoReportsTopic.threadId) return;
  const now = kyivNow(Date.now());
  state.andriyTease = state.andriyTease || {};
  if (state.andriyTease.lastSent === now.dateStr) return;
  if (Math.random() > ANDRIY_TEASE_FIRE_CHANCE) return;
  state.andriyTease.lastSent = now.dateStr;
  await setState(env, chatId, state);
  try {
    await tg(env, "sendMessage", withThread({
      chat_id: chatId, text: buildAndriyTeaseLine(now.hhmm),
    }, state.funTopic.threadId));
  } catch (err) {
    console.error("maybeTeaseAndriy: sending failed", err);
  }
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

// District Manager надсилає показники дістрикту прямо в чат з Claude, і вони
// потрапляють у "kyiv1/kpi-reports" (той самий дашборд, вкладка "Звіти та
// показники") — ця команда просто пересилає найсвіжіший запис сюди, у групу,
// на запит, без потреби відкривати сайт.
async function sendKpiReport(chatId, env) {
  const reports = (await loadDashboardDoc(env, "kpi-reports")) || [];
  if (!reports.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Показників ще немає — District Manager ще не надсилав їх у дашборд." });
    return;
  }
  const latest = [...reports].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))[0];
  const lines = [`📊 <b>Показники дістрикту — ${escapeHtml(latest.period)}</b>`, ""];
  for (const m of latest.metrics || []) lines.push(`• <b>${escapeHtml(m.label)}:</b> ${escapeHtml(String(m.value))}`);
  if (latest.note) lines.push("", escapeHtml(latest.note));
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
}

// -------------------------------------------------------------- cron job --

async function runScheduled(event, env) {
  try {
    const now = kyivNow(event.scheduledTime);
    const chatIds = await getChatsIndex(env);
    for (const chatId of chatIds) {
      // Isolated per chat: most triggers below are wall-clock exact-match
      // (time === now.hhmm + lastSentDate !== today) with no catch-up later,
      // so one chat's Firestore/Telegram hiccup must not skip every chat
      // that comes after it in chatIds for this whole 5-minute tick.
      try {
        await processChatSchedule(chatId, now, env);
      } catch (err) {
        console.error(`processChatSchedule error for chat ${chatId}: ${err?.message || err}`, err?.stack || "");
      }
    }
  } catch (err) {
    console.error(`runScheduled error: ${err?.message || err}`, err?.stack || "");
  }
}

async function processChatSchedule(chatId, now, env) {
  const state = await getState(env, chatId);
  let changed = false;

  if (state.lastBackupDate !== now.dateStr) {
    await backupChatState(env, chatId, state, now);
    state.lastBackupDate = now.dateStr;
    changed = true;
  }

  if (now.hhmm === PRICE_CHANGE_REMINDER_TIME && state.lastPriceChangeCheckDate !== now.dateStr) {
    const priceReminder = buildPriceChangeReminder(nextDateStr(now.dateStr));
    if (priceReminder) {
      await tg(env, "sendMessage", { chat_id: chatId, text: priceReminder });
    }
    const marketingReminder = buildMarketingCalendarReminder(nextDateStr(now.dateStr));
    if (marketingReminder) {
      await tg(env, "sendMessage", { chat_id: chatId, text: marketingReminder });
    }
    state.lastPriceChangeCheckDate = now.dateStr;
    changed = true;
  }

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
    state.birthdayGreeting.oneTimeNote = null; // one-off note (if any) is spent — never carries over to a future day
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
      // Streaks are still tracked (used by /streaks and the ask-bot's real-
      // data context) — just no longer printed inline here; the district
      // manager asked for real performance numbers in this summary instead.
      state.reportStreaks = updateStreaks(state.reportStreaks, stores, reportedToday);
      // A softer note, not a push — managers often already explained the
      // delay right in the chat ("завтра", "тривога" etc.), so demanding
      // "надішліть якнайшвидше" reads as tone-deaf when someone already
      // said why. Just acknowledge it's still awaited.
      const text = missing.length
        ? `⏰ ${now.hhmm} — вікно звітів закрито.\nЩе чекаємо на звіт пізніше від:\n${missing.map((s) => `• ${s.code}`).join("\n")}` + buildReportLeaderboardLine(state, now.dateStr)
        : `✅ Усі магазини дістрикту відзвітували сьогодні до ${now.hhmm}. Чудова дисципліна, команда! 🙌` + buildReportLeaderboardLine(state, now.dateStr, { includeEnergy: false }) + buildEnergyChallengeLine(state, now.dateStr);
      await tg(env, "sendMessage", { chat_id: chatId, message_thread_id: state.reportsTopic.threadId, text, parse_mode: "HTML" });
      state.reportsTopic.lastCheckedDate = now.dateStr;
      changed = true;

      // "Тиждень Energy" — piggybacks on the exact moment the daily report
      // window just closed (today's numbers are all in by now), rather
      // than its own separate schedule check. See cmdEnergyWeek/
      // computeEnergyWeekStandings above for the contest itself.
      //
      // Runs continuously now, Thursday to Thursday, per Adam's request —
      // no manual /energyweek start needed. A cycle always ends on
      // Wednesday (startDate + 6 days, below), so the very next Thursday
      // this fires again with active === false and immediately opens the
      // next one — zero gap between cycles.
      if (now.day === "thu" && !state.energyWeek?.active) {
        state.energyWeek = { active: true, startDate: now.dateStr, endDate: daysAheadStr(now.dateStr, 6) };
        await tg(env, "sendMessage", {
          chat_id: chatId, message_thread_id: state.reportsTopic.threadId,
          text: `🔋 <b>Новий «Тиждень Energy» стартував!</b>\n\nЗ ${formatUaDate(state.energyWeek.startDate)} по ${formatUaDate(state.energyWeek.endDate)} рахуємо середній показник Energy по щоденних звітах кожного магазину. У середу оголосимо переможця — і одразу стартує новий тиждень 🏆`,
          parse_mode: "HTML",
        });
      }
      if (state.energyWeek?.active && now.dateStr >= state.energyWeek.startDate && now.dateStr <= state.energyWeek.endDate) {
        if (now.dateStr === state.energyWeek.endDate) {
          const standings = computeEnergyWeekStandings(state, state.energyWeek.startDate, state.energyWeek.endDate);
          state.energyWeek.active = false;
          const winnerText = standings.length
            ? (() => {
                const [winner, ...rest] = standings;
                const restLines = rest.slice(0, 4).map((s, i) => `${i + 2}. ${escapeHtml(s.code)} — ${s.avg.toFixed(1)}`).join("\n");
                return `🏆 <b>Тиждень Energy завершено!</b>\n\nПереможець: <b>${escapeHtml(winner.code)}</b> із середнім ${winner.avg.toFixed(1)} 🔋🎉${restLines ? `\n\n${restLines}` : ""}\n\nВітаємо і дякуємо всім, хто брав участь! 🙌`
              })()
            : "🔋 Тиждень Energy завершено — на жаль, даних для підсумку не набралось.";
          await tg(env, "sendMessage", { chat_id: chatId, message_thread_id: state.reportsTopic.threadId, text: winnerText, parse_mode: "HTML" });
        } else {
          const standings = computeEnergyWeekStandings(state, state.energyWeek.startDate, now.dateStr);
          if (standings.length) {
            const dayNum = Math.round((new Date(now.dateStr + "T00:00:00Z") - new Date(state.energyWeek.startDate + "T00:00:00Z")) / 86400000) + 1;
            const leader = standings[0];
            await tg(env, "sendMessage", {
              chat_id: chatId, message_thread_id: state.reportsTopic.threadId,
              text: `🔋 Тиждень Energy, день ${dayNum} з 7 — поки лідирує <b>${escapeHtml(leader.code)}</b> (середній ${leader.avg.toFixed(1)})`,
              parse_mode: "HTML",
            });
          }
        }
      }
    }
  }

  if (state.photoReportsTopic) {
    const window = state.photoReportsWindow || DEFAULT_PHOTO_REPORTS_WINDOW;
    if (graceEnd(window) === now.hhmm && state.photoReportsTopic.lastCheckedDate !== now.dateStr) {
      const stores = await getStoreCodes(env);
      const reportedToday = (state.photoReports && state.photoReports[now.dateStr]) || {};
      const missing = stores.filter((s) => s.code && !reportedToday[s.code]);
      // Streaks are still tracked (used by /streaks and the ask-bot's real-
      // data context) — just no longer printed inline in this summary.
      state.photoStreaks = updateStreaks(state.photoStreaks, stores, reportedToday);
      const text = (missing.length
        ? `📸 Станом на ${now.hhmm}: ще не надіслали фото + коментар по мінусових залишках:\n${missing.map((s) => `• ${s.code}`).join("\n")}\n\nБудь ласка, опрацюйте мінусові залишки і пропишіть коментарі якнайшвидше 🙏`
        : `✅ Усі магазини надіслали фото та коментарі по мінусових залишках сьогодні до ${now.hhmm}. Дякуємо! 🙌`);
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
    if (now.day === "mon" && now.hhmm === "10:01" && state.activityDigest.lastSentWeekly !== now.dateStr) {
      await sendWeeklyDigest(chatId, env, state, now);
      state.activityDigest.lastSentWeekly = now.dateStr;
      changed = true;
    }
    if (now.day === "fri" && now.hhmm === "20:00" && state.activityDigest.lastSentMonthly !== now.dateStr) {
      const totals = sumPointsByDay(state, monthToDateDays(now));
      const monthLabel = MONTH_NAMES_UA[Number(now.month.slice(5, 7)) - 1];
      const motivation = MONTH_PROGRESS_MOTIVATION[Math.floor(Math.random() * MONTH_PROGRESS_MOTIVATION.length)];
      await sendActivityDigest(chatId, env, state, `📆 Результат з початку місяця (${monthLabel})`, motivation, totals);
      state.activityDigest.lastSentMonthly = now.dateStr;
      changed = true;
    }
    if (isLastDayOfMonth(now) && now.hhmm === "20:05" && state.activityDigest.lastSentMonthWinner !== now.month) {
      await sendMonthWinnerAnnouncement(chatId, env, state, now);
      state.activityDigest.lastSentMonthWinner = now.month;
      changed = true;
    }
  }

  // "Хіхоньки та хахаоньки" — Adam's own dedicated fun topic (see
  // cmdSetFunTopic/buildFunnyPost above). Weekdays only, one post a day —
  // frequent enough to feel alive, not so frequent it drowns out the
  // team's own banter in there. Silently skips the day if buildFunnyPost
  // returns null (env.AI hiccup) rather than posting nothing useful or
  // erroring — same degrade-quietly shape as the spoken-message comment.
  if (state.funTopic && ["mon", "tue", "wed", "thu", "fri"].includes(now.day) && now.hhmm === "13:00" && state.funTopic.lastSent !== now.dateStr) {
    const post = await buildFunnyPost(env);
    if (post) {
      await tg(env, "sendMessage", withThread({ chat_id: chatId, text: post }, state.funTopic.threadId));
    }
    state.funTopic.lastSent = now.dateStr;
    changed = true;
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
// Authenticated as a Firebase service account (env.FIREBASE_SERVICE_ACCOUNT_KEY
// — set with `wrangler secret put`, see README) — NOT the old "no auth
// needed" REST access this bot used to rely on. That used to work because
// firestore.rules opened `telegram-bot/{doc}` to literally anyone on the
// internet with the project ID (which isn't a secret — it's public in
// ../index.html's own JS bundle); switching to a service account let those
// rules get locked down to `allow read, write: if false` for this
// collection specifically — a service account with proper IAM access to
// Firestore bypasses Security Rules by design (same mechanism the Admin
// SDK uses), so this bot keeps working exactly as before while every other
// client is now refused. `kyiv1/{doc}` (the dashboard's own data) is
// unrelated and still on the old open rule — see firestore.rules for why.

// Mints a short-lived Google OAuth2 access token from the service account's
// private key (RS256-signed JWT, exchanged at Google's token endpoint —
// the standard "JWT Bearer" service-account flow, the same one the
// Firebase Admin SDK performs under the hood). Cached in module scope
// (mirrors cachedBotUsername above) so a warm isolate mints a fresh token
// only once per ~hour, not on every single Firestore call.
let cachedGoogleToken = null; // { token, expiresAt }
async function getGoogleAccessToken(env) {
  if (cachedGoogleToken && Date.now() < cachedGoogleToken.expiresAt - 60000) {
    return cachedGoogleToken.token;
  }
  if (!env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set — see README for the one-time `wrangler secret put` step");
  }
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const scope = "https://www.googleapis.com/auth/datastore";
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: sa.client_email, scope, aud: sa.token_uri, exp: now + 3600, iat: now };
  const encHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encClaims = base64urlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${encHeader}.${encClaims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64urlEncode(signature)}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`getGoogleAccessToken: token exchange failed ${res.status} ${errText}`);
  }
  const data = await res.json();
  cachedGoogleToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedGoogleToken.token;
}

function base64urlEncode(bytes) {
  let binary = "";
  for (const b of bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Deliberately throws (rather than returning null) on anything that ISN'T
// a genuine "this document doesn't exist yet" 404 — a token-mint failure,
// a network error, or Firestore itself erroring must never be silently
// treated the same as "empty state". getState below turns a null return
// into `{}`, and code downstream saves THAT back with setState; if a real
// auth failure looked the same as "brand new chat", one bad request could
// silently wipe a chat's entire history the next time anything saves.
// Throwing instead propagates up to handleUpdate/runScheduled's own
// try/catch (they log and stop for that update/tick) — a loud, recoverable
// failure instead of quiet data loss.
async function firestoreGetRaw(env, collection, docId) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Firestore get failed ${collection}/${docId}: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data.fields?.value?.stringValue ?? null;
}

async function firestoreSetRaw(env, collection, docId, rawString) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}?updateMask.fieldPaths=value`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { value: { stringValue: rawString } } }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Firestore set failed ${collection}/${docId}: ${res.status} ${errText}`);
  }
}

// Best-effort delete — a stale backup doc that fails to delete just gets
// picked up on tomorrow's prune too, not worth throwing over. 404 (already
// gone) is expected and fine, not logged.
async function firestoreDeleteRaw(env, collection, docId) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) {
    console.error(`Firestore delete failed ${collection}/${docId}: ${res.status}`);
  }
}

// Daily snapshot of each chat's live state into its own backup document —
// cheap insurance against an accidental bad write (a bug, a bad manual
// edit) wiping real data (points, birthdays, store links, reports...) with
// nothing to recover from. Firestore's free tier has no built-in backups.
// Runs once per UTC-ish calendar day per chat (state.lastBackupDate gate,
// same pattern as the digest/reminder gates around this call site), off
// the state as freshly fetched at the top of processChatSchedule — before
// this same tick's own reminders/digests mutate it — so the snapshot is a
// clean copy of what was actually persisted, not a half-updated in-flight
// version. Pruned after BACKUP_MAX_AGE_DAYS: the doc id is deterministic
// (backup-chat-<id>-<date>), so pruning is just deleting the exact id for
// the day that just fell out of the window — no query needed, matching
// firestoreGetRaw/SetRaw's single-document-only shape.
const BACKUP_MAX_AGE_DAYS = 14;
async function backupChatState(env, chatId, state, now) {
  try {
    await firestoreSetRaw(env, BOT_COLLECTION, `backup-chat-${chatId}-${now.dateStr}`, JSON.stringify(state));
    const staleDate = daysAgoStr(now.dateStr, BACKUP_MAX_AGE_DAYS);
    await firestoreDeleteRaw(env, BOT_COLLECTION, `backup-chat-${chatId}-${staleDate}`);
  } catch (err) {
    console.error(`backupChatState failed for chat ${chatId}: ${err?.message || err}`);
  }
}

// FY27 price-change calendar Adam shared (company slide "[UA] Зміни цін у
// FY27") — fixed, known dates through Feb 2027. Not expressible with the
// existing /addreminder command (that only matches a recurring day-of-week
// + time, not a specific calendar date), so this is its own small
// mechanism instead. `note` is set only for the slide's own yellow-
// highlighted rows (the big campaign/seasonal price changes) — those are
// the ones the slide's own footnote flagged as needing an early heads-up
// ("буде багато цінників" — there'll be a lot of price tags to prepare).
// A plain status-change date (no note) still gets a lighter heads-up, since
// Adam asked generally to be told a day ahead what's happening tomorrow.
const PRICE_CHANGE_CALENDAR = [
  { date: "2026-10-06", note: null },
  { date: "2026-11-03", note: null },
  { date: "2026-11-20", note: "Велика зміна акційних цін" },
  { date: "2026-11-30", note: "Велика зміна акційних цін" },
  { date: "2026-12-08", note: null },
  { date: "2026-12-17", note: "Зміна цін для Новорічного розпродажу" },
  { date: "2027-01-05", note: null },
  { date: "2027-01-07", note: "Зміна цін для Зимового розпродажу" },
  { date: "2027-02-02", note: null },
];
const PRICE_CHANGE_REMINDER_TIME = "09:00";

function formatUaDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

function buildPriceChangeReminder(tomorrowDateStr) {
  const entry = PRICE_CHANGE_CALENDAR.find((e) => e.date === tomorrowDateStr);
  if (!entry) return null;
  if (entry.note) {
    return `📌 Завтра, ${formatUaDate(tomorrowDateStr)} — ${entry.note}. Буде багато цінників, підготуйтесь заздалегідь! 🏷️`;
  }
  return `📌 Завтра, ${formatUaDate(tomorrowDateStr)} — плановий день зміни цін.`;
}

// Marketing/media calendar Adam sent next (a separate slide — media flight
// periods, not price-change dates: TV/радіо/діджитал push windows, Black
// Friday, Winter Sale, etc). Kept alongside PRICE_CHANGE_CALENDAR rather
// than merged into it — different source, different shape (a date RANGE,
// not a single date), and a chat can get both a price-change AND a
// marketing-campaign reminder on the same morning, which is fine, they're
// unrelated facts. `top: true` marks whatever the slide itself marked
// ТОП/МЕГА АКТИВНІСТЬ (in red) — Adam asked explicitly for those to stand
// out separately from the rest. Three dates the slide gave as "2026" in a
// row that's otherwise chronological after Dec 2026 (26.12, 22.01, 21.01)
// are corrected to 2027 here — the slide's own FY27 calendar runs
// Sep 2026 – Aug 2027, so a Dec-then-Jan sequence can't go backward to
// 2026 again; typo'd year in the original, not a deliberate second Jan.
const MARKETING_CALENDAR = [
  { start: "2026-10-01", end: "2026-10-07", label: "Sleeping Days + TV реклама + радіо", top: false },
  { start: "2026-10-08", end: "2026-10-21", label: "Меблеві дні + TV реклама багато + радіо та діджитал — багато", top: true },
  { start: "2026-10-22", end: "2026-11-04", label: "Other (фокус Living room) + TV реклама багато + радіо та діджитал — багато", top: false },
  { start: "2026-11-05", end: "2026-11-11", label: "Singles Days + TV реклама багато + радіо та діджитал — багато", top: true },
  { start: "2026-11-12", end: "2026-11-29", label: "МЕГА АКТИВНІСТЬ BLACK FRIDAY (TV + радіо + діджитал + TikTok + Meta)", top: true },
  { start: "2026-11-30", end: "2026-12-16", label: "GREAT OFFER FOR CHRISTMAS + TV реклама + радіо + діджитал", top: false },
  { start: "2026-12-17", end: "2026-12-31", label: "Меблеві дні + TV реклама багато + радіо та діджитал — багато", top: true },
  { start: "2026-12-25", end: "2026-12-27", label: "Останній вікенд перед Новим роком — підсильте графік роботи", top: true },
  { start: "2026-12-26", end: "2027-01-04", label: "Найкращі Новорічні пропозиції + TV реклама + діджитал", top: false },
  { start: "2027-01-01", end: "2027-01-06", label: "BYOB — 10% радіо + діджитал", top: false },
  { start: "2027-01-07", end: "2027-01-27", label: "Winter Sale 1", top: true },
  { start: "2027-01-22", end: "2027-01-28", label: "Дні текстилю + TV реклама + радіо + діджитал", top: false },
  { start: "2027-01-21", end: "2027-02-03", label: "Other (фокус Living room) + TV реклама + радіо та діджитал", top: false },
  { start: "2027-01-28", end: "2027-02-17", label: "WINTER SALE 2", top: true },
  { start: "2027-02-04", end: "2027-02-17", label: "Sleeping Days + TV реклама + радіо", top: false },
];

function buildMarketingCalendarReminder(tomorrowDateStr) {
  const entry = MARKETING_CALENDAR.find((e) => e.start === tomorrowDateStr);
  if (!entry) return null;
  const range = `${formatUaDate(entry.start)} – ${formatUaDate(entry.end)}`;
  if (entry.top) {
    return `🔥 Завтра стартує ТОП-активність (${range}): ${entry.label}`;
  }
  return `📅 Завтра стартує новий рекламний період (${range}): ${entry.label}`;
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
