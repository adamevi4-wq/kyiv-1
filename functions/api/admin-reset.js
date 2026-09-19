// GET/POST /api/admin-reset — District Manager password recovery, two-step:
// submit a new password, then confirm it with a one-time 6-digit code sent
// to Adam's own email (RESEND_API_KEY / ADMIN_RESET_EMAIL — Cloudflare
// Pages env vars, same place SITE_USER/SITE_PASS/FIREBASE_SERVICE_ACCOUNT_KEY
// already live). Already behind the same site-wide Basic Auth every other
// route here relies on (functions/_middleware.js); the email code is a
// second factor on top of that, not a replacement for it — it exists so
// that knowing the shared Basic Auth login alone (used by every real
// manager to even reach the site) isn't enough to silently take over the
// District Manager account. kyiv1/admin-password and kyiv1/admin-reset-pending
// are also locked to the `admin` role in firestore.rules (2026-09-19 audit),
// so a manager can no longer bypass this whole flow via the Firestore SDK.
//
// The pending reset (new password's hash + the code's hash + an expiry +
// a failed-attempt counter) lives as a single Firestore doc
// (kyiv1/admin-reset-pending) — a second POST with a fresh password
// overwrites/invalidates any earlier code, and a successful confirm clears
// it so the same code can't be replayed.
import { firestoreGet, firestoreSet, makeCredential, sha256Hex } from "./_firebase.js";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CODE_ATTEMPTS = 5; // wrong guesses allowed before the pending reset is voided

export async function onRequestGet() {
  return html(stepOneFormBody());
}

export async function onRequestPost(context) {
  const { request, env } = context;
  // CSRF: this form has no session cookie to protect, only the site-wide
  // Basic Auth every route here relies on — which browsers attach to
  // cross-site requests too (unlike cookies, it isn't scoped by
  // SameSite), so a malicious page could otherwise silently auto-submit
  // this form against a visitor who already has that Basic Auth cached.
  // Origin (sent by browsers on every same-origin POST, not just
  // cross-origin, per the Fetch spec) must match this endpoint's own
  // origin; Referer is the fallback for the rare client that omits
  // Origin. Neither present/matching → reject.
  if (!isSameOriginPost(request)) {
    return html(`<p style="color:red">Запит відхилено (неправильне джерело).</p>${stepOneFormBody()}`, 403);
  }
  const form = await request.formData();
  const code = (form.get("code") || "").toString().trim();
  if (code) return finishReset(env, code);

  const password = (form.get("password") || "").toString().trim();
  if (password.length < 3) {
    return html(`<p style="color:red">Пароль має містити мінімум 3 символи.</p>${stepOneFormBody()}`);
  }
  return startReset(env, password);
}

function isSameOriginPost(request) {
  const selfOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  if (origin) return origin === selfOrigin;
  const referer = request.headers.get("Referer");
  if (referer) {
    try { return new URL(referer).origin === selfOrigin; } catch (e) { return false; }
  }
  return false;
}

async function startReset(env, password) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const pending = {
    codeHash: await sha256Hex(code),
    newPasswordHash: await makeCredential(password),
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
  };
  try {
    await firestoreSet(env, "kyiv1", "admin-reset-pending", JSON.stringify(pending));
    await sendCodeEmail(env, code);
  } catch (e) {
    return html(`<p style="color:red">Помилка: ${String(e.message || e)}</p>${stepOneFormBody()}`);
  }
  return html(stepTwoFormBody());
}

async function finishReset(env, code) {
  let pending;
  try {
    const raw = await firestoreGet(env, "kyiv1", "admin-reset-pending");
    pending = raw ? JSON.parse(raw) : null;
  } catch (e) {
    return html(`<p style="color:red">Помилка: ${String(e.message || e)}</p>`);
  }
  if (!pending || Date.now() > pending.expiresAt) {
    return html(`<p style="color:red">Код прострочено або не існує — почніть спочатку.</p>${stepOneFormBody()}`);
  }
  if ((pending.attempts || 0) >= MAX_CODE_ATTEMPTS) {
    await voidPending(env);
    return html(`<p style="color:red">Забагато невдалих спроб — почніть спочатку.</p>${stepOneFormBody()}`);
  }
  if ((await sha256Hex(code)) !== pending.codeHash) {
    pending.attempts = (pending.attempts || 0) + 1;
    const remaining = MAX_CODE_ATTEMPTS - pending.attempts;
    if (remaining <= 0) {
      await voidPending(env);
      return html(`<p style="color:red">Забагато невдалих спроб — почніть спочатку.</p>${stepOneFormBody()}`);
    }
    try { await firestoreSet(env, "kyiv1", "admin-reset-pending", JSON.stringify(pending)); } catch (e) {}
    return html(`<p style="color:red">Невірний код. Залишилось спроб: ${remaining}.</p>${stepTwoFormBody()}`);
  }
  try {
    await firestoreSet(env, "kyiv1", "admin-password", pending.newPasswordHash);
    await voidPending(env);
  } catch (e) {
    return html(`<p style="color:red">Помилка: ${String(e.message || e)}</p>`);
  }
  return html(`<p style="color:green">Готово. Пароль District Manager оновлено — можна заходити на сайт.</p>`);
}

async function voidPending(env) {
  try { await firestoreSet(env, "kyiv1", "admin-reset-pending", ""); } catch (e) {}
}

async function sendCodeEmail(env, code) {
  if (!env.RESEND_API_KEY || !env.ADMIN_RESET_EMAIL) {
    throw new Error("RESEND_API_KEY / ADMIN_RESET_EMAIL не налаштовані в Cloudflare Pages");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Kyiv-1 Dashboard <onboarding@resend.dev>",
      to: env.ADMIN_RESET_EMAIL,
      subject: "Код підтвердження — скидання пароля District Manager",
      text: `Код підтвердження: ${code}\n\nДійсний 10 хвилин. Якщо ви не запитували скидання пароля — просто проігноруйте цей лист.`,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Не вдалося надіслати лист: ${res.status} ${errText}`);
  }
}

function stepOneFormBody() {
  return `
    <form method="POST">
      <label>Новий пароль District Manager</label><br/>
      <input type="text" name="password" minlength="3" required autofocus />
      <button type="submit">Надіслати код на пошту</button>
    </form>
  `;
}

function stepTwoFormBody() {
  return `
    <p>Код підтвердження надіслано на пошту. Дійсний 10 хвилин, максимум ${MAX_CODE_ATTEMPTS} спроб.</p>
    <form method="POST">
      <label>Код підтвердження</label><br/>
      <input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus />
      <button type="submit">Підтвердити</button>
    </form>
    <p><a href="/api/admin-reset">Почати спочатку</a></p>
  `;
}

function html(body, status = 200) {
  return new Response(
    `<!DOCTYPE html><html lang="uk"><meta charset="utf-8"><body style="font-family:sans-serif;max-width:420px;margin:60px auto;">${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
