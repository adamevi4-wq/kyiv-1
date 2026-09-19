// GET/POST /api/site-access — replaces having to hand every store manager
// the site's shared Basic Auth password (Adam: "я не хочу давати їм
// пароль від URL"). A person picks their own name from the same roster
// the in-app login screen already uses, and gets a 6-digit code sent as a
// private Telegram message from the district's own bot — no email/domain
// service needed (Adam: "потрібно безкоштовне рішення", after discovering
// Resend's free onboarding@resend.dev sender can only deliver to the
// account owner's own address, not to arbitrary managers' inboxes).
//
// Who the code goes to is resolved from data the bot ALREADY owns and
// keeps current, not from anything typed here: telegram-bot/worker.js's
// own /mystore (or admin's /linkstore) already links a Telegram account to
// a store code (state.storeMembers, in its per-chat Firestore doc), and
// state.chatCreatorId already identifies the group's creator (Adam,
// District Manager) — see getChatCreatorId there. Reading that same state
// here (via the same service-account IAM access every functions/api/*.js
// file already uses — firestore.rules' `telegram-bot/{doc}: allow ...: if
// false` blocks the Firestore SDK, not this server-side REST access)
// means there's nothing new to bind or keep in sync: if a store's linked
// Telegram account changes later (staff turnover, an admin /linkstore),
// site-access picks that up automatically, no separate "reset my
// binding" step ever needed.
//
// A person only receives the code at all once they've opened a private
// chat with the bot at least once (Telegram won't let a bot message
// someone who hasn't — send it a bare message, or /start) — startAccess
// below says so plainly when that's what failed.
//
// Needs BOT_TOKEN (same value already `wrangler secret put BOT_TOKEN`'d
// for telegram-bot/worker.js — copy it into THIS Cloudflare Pages
// project's own Environment variables too, as Secret; these are two
// separate deploy targets with separate secret stores even though it's
// the same physical bot) and SITE_SESSION_SECRET (any long random string)
// to sign the session cookie once a code is confirmed.
import { firestoreGet, firestoreGetTypedDoc, firestoreListCollection, firestoreSetTypedDoc, sha256Hex, signSessionToken } from "./_firebase.js";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CODE_ATTEMPTS = 5; // wrong guesses allowed before the pending code is voided
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000; // ~1 year — mirrors Basic Auth's own indefinite browser-side caching
const SESSION_COOKIE = "kyiv1_session";
const TELEGRAM_API = "https://api.telegram.org/bot";
const BOT_COLLECTION = "telegram-bot"; // matches telegram-bot/worker.js's own BOT_COLLECTION

// Mirrors login-options.js's own DEFAULT_USERS fallback (kept as a
// separate copy — no shared build step ties these Pages Functions files
// to one canonical source).
const DEFAULT_USERS = [
  { id: "u1", name: "Афонічев Марк", store: "J104" },
  { id: "u2", name: "Безхлібний Андрій", store: "J015" },
  { id: "u3", name: "Гаценко Олег", store: "J121" },
  { id: "u4", name: "Міщенко Юлія", store: "J109" },
  { id: "u5", name: "Доля Наталія", store: "J029" },
  { id: "u6", name: "Крамаренко Олександр", store: "J009" },
  { id: "u7", name: "Третяк Олександр", store: "J035" },
  { id: "u8", name: "Білоус Сергій", store: "J050" },
  { id: "u9", name: "Сиролет Владислав", store: "J120" },
  { id: "u10", name: "Ящик Євгеній", store: "J027" },
];

async function getRoster(env) {
  let users = DEFAULT_USERS;
  try {
    const fromCollection = await firestoreListCollection(env, "kyiv1_users");
    if (fromCollection.length) {
      users = fromCollection;
    } else {
      const raw = await firestoreGet(env, "kyiv1", "users");
      if (raw) users = JSON.parse(raw);
    }
  } catch (e) {
    // Firestore/service-account trouble — fall back to the default roster
    // rather than leaving the gate page with an empty picker.
  }
  const managers = users.map((u) => ({ uid: `user_${u.id}`, name: u.name, store: u.store }));
  return [{ uid: "admin", name: "District Manager", store: null }, ...managers];
}

// The district runs one Telegram group (see telegram-bot/README.md's own
// single-chat framing) — chats-index is a list purely because the bot's
// code is generic over "however many chats it's in", not because this
// district actually has more than one. First entry is the real one.
async function getPrimaryChatId(env) {
  const raw = await firestoreGet(env, BOT_COLLECTION, "chats-index");
  const list = raw ? JSON.parse(raw) : [];
  return list.length ? list[0] : null;
}

async function getChatState(env, chatId) {
  const raw = await firestoreGet(env, BOT_COLLECTION, `chat-${chatId}`);
  return raw ? JSON.parse(raw) : {};
}

// Same lookup telegram-bot/worker.js's own getChatCreatorId does, without
// depending on that file — the two are separate deploy targets. Reads the
// bot's own cached state.chatCreatorId first (already warmed by any of
// /rating, /streaks, /topcontent etc., which every district chat has
// certainly used by now); falls back to asking Telegram directly.
async function getChatCreatorId(env, chatId, state) {
  if (state.chatCreatorId !== undefined && state.chatCreatorId !== null) return String(state.chatCreatorId);
  const res = await tg(env, "getChatAdministrators", { chat_id: chatId });
  if (!res?.ok) return null;
  const creator = (res.result || []).find((m) => m.status === "creator");
  return creator ? String(creator.user.id) : null;
}

// Every Telegram account currently linked to this store via /mystore or
// an admin's /linkstore — deliberately not just one: a store can have
// more than one person report for it, and any of them confirming the
// code is a legitimate way in for that store.
function getStoreTelegramIds(state, storeCode) {
  const members = state.storeMembers || {};
  return Object.entries(members)
    .filter(([, code]) => code === storeCode)
    .map(([uid]) => uid);
}

export async function onRequestGet(context) {
  const roster = await getRoster(context.env);
  return html(stepOneFormBody(roster));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  // Same CSRF reasoning as admin-reset.js: this endpoint sits in front of
  // Basic Auth (it has to, to be reachable at all), so nothing stops a
  // malicious page from auto-submitting it against a visitor's browser —
  // Origin/Referer must match this endpoint's own origin.
  if (!isSameOriginPost(request)) {
    const roster = await getRoster(env);
    return html(`<p style="color:red">Запит відхилено (неправильне джерело).</p>${stepOneFormBody(roster)}`, 403);
  }
  const form = await request.formData();
  const uid = (form.get("uid") || "").toString().trim();
  const code = (form.get("code") || "").toString().trim();
  if (code) return finishAccess(env, uid, code);

  const roster = await getRoster(env);
  const person = roster.find((p) => p.uid === uid);
  if (!person) {
    return html(`<p style="color:red">Оберіть себе зі списку.</p>${stepOneFormBody(roster)}`, 400);
  }
  return startAccess(env, person);
}

async function startAccess(env, person) {
  try {
    const chatId = await getPrimaryChatId(env);
    if (!chatId) {
      const roster = await getRoster(env);
      return html(
        `<p style="color:red">Бот ще не бачив жодного чату дистрикту — спершу додайте його в груповий чат.</p>${stepOneFormBody(roster)}`
      );
    }
    const state = await getChatState(env, chatId);
    const targetIds =
      person.uid === "admin" ? [await getChatCreatorId(env, chatId, state)].filter(Boolean) : getStoreTelegramIds(state, person.store);

    if (!targetIds.length) {
      const roster = await getRoster(env);
      const hint =
        person.uid === "admin"
          ? "Не вдалось визначити творця чату в Telegram."
          : `Ще ніхто не прив'язав себе до ${escapeHtml(person.store)} командою /mystore ${escapeHtml(person.store)} у груповому чаті.`;
      return html(`<p style="color:red">${hint}</p>${stepOneFormBody(roster)}`);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const pending = { codeHash: await sha256Hex(code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 };
    await firestoreSetTypedDoc(env, "kyiv1_site_access_pending", person.uid, pending);

    const delivered = await sendCodeTelegram(env, targetIds, code);
    if (!delivered) {
      const roster = await getRoster(env);
      return html(
        `<p style="color:red">Не вдалось надіслати код у Telegram — спершу напишіть боту особисто (у приваті) будь-що, наприклад /start, і спробуйте ще раз.</p>${stepOneFormBody(roster)}`
      );
    }
  } catch (e) {
    const roster = await getRoster(env);
    return html(`<p style="color:red">Помилка: ${escapeHtml(String(e.message || e))}</p>${stepOneFormBody(roster)}`);
  }
  return html(stepTwoFormBody(person));
}

async function finishAccess(env, uid, code) {
  const roster = await getRoster(env);
  const person = roster.find((p) => p.uid === uid);
  if (!person) return html(`<p style="color:red">Сталася помилка — почніть спочатку.</p>${stepOneFormBody(roster)}`);

  let pending;
  try {
    pending = await firestoreGetTypedDoc(env, "kyiv1_site_access_pending", uid);
  } catch (e) {
    return html(`<p style="color:red">Помилка: ${escapeHtml(String(e.message || e))}</p>`);
  }
  if (!pending || !pending.expiresAt || Date.now() > pending.expiresAt) {
    return html(`<p style="color:red">Код прострочено або не існує — почніть спочатку.</p>${stepOneFormBody(roster)}`);
  }
  if ((pending.attempts || 0) >= MAX_CODE_ATTEMPTS) {
    await voidPending(env, uid);
    return html(`<p style="color:red">Забагато невдалих спроб — почніть спочатку.</p>${stepOneFormBody(roster)}`);
  }
  if ((await sha256Hex(code)) !== pending.codeHash) {
    pending.attempts = (pending.attempts || 0) + 1;
    const remaining = MAX_CODE_ATTEMPTS - pending.attempts;
    if (remaining <= 0) {
      await voidPending(env, uid);
      return html(`<p style="color:red">Забагато невдалих спроб — почніть спочатку.</p>${stepOneFormBody(roster)}`);
    }
    try {
      await firestoreSetTypedDoc(env, "kyiv1_site_access_pending", uid, pending);
    } catch (e) {}
    return html(`<p style="color:red">Невірний код. Залишилось спроб: ${remaining}.</p>${stepTwoFormBody(person)}`);
  }

  let token;
  try {
    await voidPending(env, uid);
    token = await signSessionToken(env, { uid, exp: Date.now() + SESSION_TTL_MS });
  } catch (e) {
    return html(`<p style="color:red">Помилка: ${escapeHtml(String(e.message || e))}</p>`);
  }

  return new Response(
    `<!DOCTYPE html><html lang="uk"><meta charset="utf-8"><body style="font-family:sans-serif;max-width:420px;margin:60px auto;"><p style="color:green">Готово — цей пристрій запам'ятано, повторно вводити код не треба.</p><p><a href="/">На сайт →</a></p></body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`,
      },
    }
  );
}

async function voidPending(env, uid) {
  try {
    await firestoreSetTypedDoc(env, "kyiv1_site_access_pending", uid, { expiresAt: 0, attempts: 0 });
  } catch (e) {}
}

function isSameOriginPost(request) {
  const selfOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  if (origin) return origin === selfOrigin;
  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      return new URL(referer).origin === selfOrigin;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// Sends to every target id, tolerating some failing (e.g. one linked
// account never messaged the bot privately while another did) — true if
// at least one delivery succeeded.
async function sendCodeTelegram(env, chatIds, code) {
  if (!env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN не налаштований в цьому Cloudflare Pages проєкті");
  }
  const text = `Код підтвердження для входу на сайт дашборду Kyiv-1: ${code}\n\nДійсний 10 хвилин. Якщо ви не запитували вхід — просто проігноруйте це повідомлення.`;
  let delivered = false;
  for (const chatId of chatIds) {
    const res = await tg(env, "sendMessage", { chat_id: chatId, text });
    if (res?.ok) delivered = true;
  }
  return delivered;
}

async function tg(env, method, params) {
  const res = await fetch(`${TELEGRAM_API}${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  try {
    return await res.json();
  } catch (e) {
    return { ok: false };
  }
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stepOneFormBody(roster) {
  const options = roster
    .map(
      (p) =>
        `<option value="${escapeHtml(p.uid)}">${escapeHtml(p.name)}${p.store ? ` (${escapeHtml(p.store)})` : ""}</option>`
    )
    .join("");
  return `
    <form method="POST">
      <label>Хто ви?</label><br/>
      <select name="uid" required>
        <option value="" disabled selected>— оберіть —</option>
        ${options}
      </select><br/><br/>
      <button type="submit">Надіслати код у Telegram</button>
    </form>
    <p style="color:#888;font-size:0.9em;">Код прийде особистим повідомленням від бота дистрикту — якщо ще жодного разу не писали йому в приват, спершу напишіть будь-що (напр. /start).</p>
    <p style="color:#888;font-size:0.9em;">Або: <a href="/api/basic-auth-challenge">увійти через пароль сайту</a>.</p>
  `;
}

function stepTwoFormBody(person) {
  return `
    <p>Код підтвердження надіслано в Telegram. Дійсний 10 хвилин, максимум ${MAX_CODE_ATTEMPTS} спроб.</p>
    <form method="POST">
      <input type="hidden" name="uid" value="${escapeHtml(person.uid)}" />
      <label>Код підтвердження</label><br/>
      <input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus />
      <button type="submit">Підтвердити</button>
    </form>
    <p><a href="/api/site-access">Почати спочатку</a></p>
  `;
}

function html(body, status = 200) {
  return new Response(
    `<!DOCTYPE html><html lang="uk"><meta charset="utf-8"><body style="font-family:sans-serif;max-width:420px;margin:60px auto;">${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
