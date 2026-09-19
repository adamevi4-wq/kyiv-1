// GET/POST /api/site-login — the site's front door, replacing the
// browser's own native Basic Auth popup with a normal styled page (Adam:
// "як ми можемо замінити 1 крок... стильна сторінка замість браузерного
// вікна"). Same protection level as before, not a weaker one: still one
// shared secret (env.SITE_PASS) gating the whole site before Firestore
// rules or the in-app login ever come into play — this only changes HOW
// that secret is collected (a form, not a system dialog) and remembered
// (a signed cookie, not the browser's own Basic Auth credential cache).
// See functions/_middleware.js for where the cookie is checked.
import { signSessionToken } from "./_firebase.js";

const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000; // ~1 year — mirrors Basic Auth's own indefinite browser-side caching
const SESSION_COOKIE = "kyiv1_session";

export async function onRequestGet() {
  return html(formBody());
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SITE_PASS) {
    return html(`<p class="err">Пароль сайту не налаштований.</p>${formBody()}`, 500);
  }
  const form = await request.formData();
  const password = (form.get("password") || "").toString();
  if (password !== env.SITE_PASS) {
    return html(`<p class="err">Невірний пароль.</p>${formBody()}`, 401);
  }

  let token;
  try {
    token = await signSessionToken(env, { ok: true, exp: Date.now() + SESSION_TTL_MS });
  } catch (e) {
    return html(`<p class="err">Помилка: ${escapeHtml(String(e.message || e))}</p>${formBody()}`, 500);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

function escapeHtml(text) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formBody() {
  return `
    <form method="POST" class="card">
      <img src="/favicon.svg" alt="" class="mark" onerror="this.remove()" />
      <h1>Kyiv-1</h1>
      <p class="sub">Пароль сайту дистрикту</p>
      <input type="password" name="password" placeholder="Пароль" required autofocus />
      <button type="submit">Увійти</button>
    </form>
  `;
}

function html(body, status = 200) {
  return new Response(
    `<!DOCTYPE html>
<html lang="uk">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kyiv-1</title>
<style>
  :root { --navy:#143C8A; --paper:#F4F5F7; --ink:#2B2B2A; --ink-soft:#7a7a79; --line:#DADCE1; --red:#E30613; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--paper); font-family: 'Inter', Verdana, Geneva, sans-serif; color: var(--ink);
    padding: 16px;
  }
  .card {
    background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 40px 32px;
    width: 100%; max-width: 340px; text-align: center; box-shadow: 0 2px 12px rgba(20,60,138,0.06);
  }
  .mark { width: 40px; height: 40px; margin-bottom: 8px; }
  h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--navy); }
  .sub { margin: 0 0 20px; font-size: 14px; color: var(--ink-soft); }
  input {
    width: 100%; padding: 11px 14px; margin-bottom: 14px; border: 1px solid var(--line); border-radius: 6px;
    font-size: 15px; font-family: inherit;
  }
  input:focus { outline: none; border-color: var(--navy); }
  button {
    width: 100%; padding: 11px 14px; border: none; border-radius: 6px; background: var(--navy);
    color: #fff; font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer;
  }
  button:hover { opacity: 0.92; }
  .err { color: var(--red); font-size: 14px; margin: 0 0 14px; }
</style>
<body>${body}</body>
</html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
