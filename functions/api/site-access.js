// GET/POST /api/site-access — replaces having to hand every store manager
// the site's shared Basic Auth password (Adam: "я не хочу давати їм
// пароль від URL"). A person picks their own name from the same roster
// the in-app login screen already uses, types their personal email once,
// and confirms a 6-digit code sent to it — the admin-reset.js pattern,
// reused here for the FRONT DOOR of the site instead of a password reset.
//
// The first successful confirmation for a person PERMANENTLY binds that
// email to them (kyiv1_site_access/{uid} — IAM-only, see firestore.rules).
// Every later attempt must use the SAME email, so knowing the public
// manager roster alone is never enough to claim someone else's identity —
// only someone who already controls that inbox can (re-)confirm it. On
// success this sets a long-lived signed session cookie (see
// _firebase.js's signSessionToken/verifySessionToken) that
// functions/_middleware.js accepts in place of Basic Auth from then on.
// Basic Auth (SITE_USER/SITE_PASS) keeps working in parallel as a
// deliberate fallback — see /api/basic-auth-challenge — this is an
// additional front door, not a replacement of the only one.
//
// No self-service way (yet) to unbind a mistyped email — that needs
// Adam to delete the kyiv1_site_access/{uid} doc via the Firestore
// console, or ask for an admin-side reset tool if this comes up often.
//
// Needs RESEND_API_KEY (already set for admin-reset.js) and the new
// SITE_SESSION_SECRET (any long random string — Cloudflare Pages →
// Settings → Environment variables, as Secret) to actually finish a login.
import {
  firestoreGet,
  firestoreGetTypedDoc,
  firestoreListCollection,
  firestoreSetTypedDoc,
  sha256Hex,
  signSessionToken,
} from "./_firebase.js";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CODE_ATTEMPTS = 5; // wrong guesses allowed before the pending code is voided
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000; // ~1 year — mirrors Basic Auth's own indefinite browser-side caching
const SESSION_COOKIE = "kyiv1_session";

// Mirrors login-options.js's own DEFAULT_USERS fallback (kept as a
// separate copy, same reason those two files already keep separate
// copies: no shared build step ties these Pages Functions files to one
// canonical source).
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
  const email = (form.get("email") || "").toString().trim().toLowerCase();
  if (!isValidEmail(email)) {
    return html(`<p style="color:red">Введіть коректну email-адресу.</p>${stepOneFormBody(roster)}`);
  }
  return startAccess(env, person, email);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function startAccess(env, person, email) {
  try {
    const bound = await firestoreGetTypedDoc(env, "kyiv1_site_access", person.uid);
    if (bound && bound.email && bound.email !== email) {
      const roster = await getRoster(env);
      return html(
        `<p style="color:red">${escapeHtml(person.name)} вже прив'язаний(а) до іншої пошти. Зверніться до District Manager.</p>${stepOneFormBody(roster)}`
      );
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const pending = { codeHash: await sha256Hex(code), email, expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 };
    await firestoreSetTypedDoc(env, "kyiv1_site_access_pending", person.uid, pending);
    await sendCodeEmail(env, email, code);
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
    const bound = await firestoreGetTypedDoc(env, "kyiv1_site_access", uid);
    if (!bound || !bound.email) {
      await firestoreSetTypedDoc(env, "kyiv1_site_access", uid, {
        email: pending.email,
        name: person.name,
        boundAt: new Date().toISOString(),
      });
    }
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

async function sendCodeEmail(env, to, code) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY не налаштований в Cloudflare Pages");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Kyiv-1 Dashboard <onboarding@resend.dev>",
      to,
      subject: "Код підтвердження — вхід на сайт дашборду Kyiv-1",
      text: `Код підтвердження: ${code}\n\nДійсний 10 хвилин. Якщо ви не запитували вхід — просто проігноруйте цей лист.`,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Не вдалося надіслати лист: ${res.status} ${errText}`);
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
      <label>Особиста пошта</label><br/>
      <input type="email" name="email" required autofocus />
      <button type="submit">Надіслати код на пошту</button>
    </form>
    <p style="color:#888;font-size:0.9em;">Або: <a href="/api/basic-auth-challenge">увійти через пароль сайту</a>.</p>
  `;
}

function stepTwoFormBody(person) {
  return `
    <p>Код підтвердження надіслано на пошту. Дійсний 10 хвилин, максимум ${MAX_CODE_ATTEMPTS} спроб.</p>
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
