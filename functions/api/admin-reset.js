// GET/POST /api/admin-reset — TEMPORARY one-time password-reset tool for
// the 2026-09-19 login outage. /api/diag confirmed the server-side
// infrastructure (secret, signing, Firestore access) is fully healthy, so
// the most likely explanation for both admin AND manager logins failing
// is that the stored password (a one-way salted hash — unrecoverable by
// design, see index.html's own makeCredential/verifyCredential) simply
// isn't what's being typed. This lets Adam set a fresh District Manager
// password directly, protected only by the same site-wide Basic Auth every
// other route here already relies on (functions/_middleware.js) — no
// weaker than the rest of this API surface. GET serves a small form; POST
// does the reset. Delete this file once the login issue is resolved.
import { firestoreSet, makeCredential } from "./_firebase.js";

export async function onRequestGet() {
  return html(`
    <form method="POST">
      <label>Новий пароль District Manager</label><br/>
      <input type="text" name="password" minlength="3" required autofocus />
      <button type="submit">Встановити</button>
    </form>
  `);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const form = await request.formData();
  const password = (form.get("password") || "").toString().trim();
  if (password.length < 3) {
    return html(`<p style="color:red">Пароль має містити мінімум 3 символи.</p><p><a href="/api/admin-reset">Назад</a></p>`);
  }
  try {
    const hashed = await makeCredential(password);
    await firestoreSet(env, "kyiv1", "admin-password", hashed);
    return html(`<p style="color:green">Готово. Пароль District Manager оновлено — можна заходити на сайт.</p>`);
  } catch (e) {
    return html(`<p style="color:red">Помилка: ${String(e.message || e)}</p>`);
  }
}

function html(body) {
  return new Response(
    `<!DOCTYPE html><html lang="uk"><meta charset="utf-8"><body style="font-family:sans-serif;max-width:420px;margin:60px auto;">${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
