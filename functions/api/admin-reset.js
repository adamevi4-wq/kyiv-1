// GET/POST /api/admin-reset — District Manager password recovery, two-step:
// submit a new password, then confirm it with a one-time 6-digit code sent
// to Adam's own email (RESEND_API_KEY / ADMIN_RESET_EMAIL — Cloudflare
// Pages env vars, same place SITE_USER/SITE_PASS/FIREBASE_SERVICE_ACCOUNT_KEY
// already live). Already behind the same site-wide Basic Auth every other
// route here relies on (functions/_middleware.js); the email code is a
// second factor on top of that, not a replacement for it — it exists so
// that knowing the shared Basic Auth login alone (used by every real
// manager to even reach the site) isn't enough to silently take over the
// District Manager account.
//
// The pending reset (new password's hash + the code's hash + an expiry)
// lives as a single Firestore doc (kyiv1/admin-reset-pending) — a second
// POST with a fresh password overwrites/invalidates any earlier code, and
// a successful confirm clears it so the same code can't be replayed.
import { firestoreGet, firestoreSet, makeCredential, sha256Hex } from "./_firebase.js";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function onRequestGet() {
  return html(stepOneFormBody());
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const form = await request.formData();
  const code = (form.get("code") || "").toString().trim();
  if (code) return finishReset(env, code);

  const password = (form.get("password") || "").toString().trim();
  if (password.length < 3) {
    return html(`<p style="color:red">Пароль має містити мінімум 3 символи.</p>${stepOneFormBody()}`);
  }
  return startReset(env, password);
}

async function startReset(env, password) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const pending = {
    codeHash: await sha256Hex(code),
    newPasswordHash: await makeCredential(password),
    expiresAt: Date.now() + CODE_TTL_MS,
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
  if ((await sha256Hex(code)) !== pending.codeHash) {
    return html(`<p style="color:red">Невірний код.</p>${stepTwoFormBody()}`);
  }
  try {
    await firestoreSet(env, "kyiv1", "admin-password", pending.newPasswordHash);
    await firestoreSet(env, "kyiv1", "admin-reset-pending", "");
  } catch (e) {
    return html(`<p style="color:red">Помилка: ${String(e.message || e)}</p>`);
  }
  return html(`<p style="color:green">Готово. Пароль District Manager оновлено — можна заходити на сайт.</p>`);
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
    <p>Код підтвердження надіслано на пошту. Дійсний 10 хвилин.</p>
    <form method="POST">
      <label>Код підтвердження</label><br/>
      <input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus />
      <button type="submit">Підтвердити</button>
    </form>
    <p><a href="/api/admin-reset">Почати спочатку</a></p>
  `;
}

function html(body) {
  return new Response(
    `<!DOCTYPE html><html lang="uk"><meta charset="utf-8"><body style="font-family:sans-serif;max-width:420px;margin:60px auto;">${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
