// Cloudflare Pages Function — runs in front of every request to this site
// (kyiv-1.pages.dev), before any static file (including index.html and
// robots.txt) is served. Gates the whole site behind one shared secret
// (env.SITE_PASS, set in Cloudflare Pages → Settings → Environment
// variables as Secret) — collected via functions/api/site-login.js's own
// styled page rather than the browser's native Basic Auth popup (Adam:
// "як ми можемо замінити 1 крок... стильна сторінка замість браузерного
// вікна", 2026-09-19), and remembered via a signed cookie
// (kyiv1_session) instead of the browser's own Basic Auth credential
// cache. Same protection level as Basic Auth was — one shared secret
// gates everything before Firestore rules or the in-app login ever run —
// just a nicer front end for entering and remembering it.
//
// This is a *second*, earlier gate than the app's own login screen — it
// stops a stranger from even loading the page at all, which Firebase
// rules alone can't do (those only protect the data once the page is
// already running in someone's browser). SITE_PASS is separate from any
// per-store password inside the app itself; this one secret is shared by
// everyone who needs to reach the site.
//
// Fails closed: if SITE_PASS isn't set (e.g. a fresh deploy before it's
// configured), every request is rejected rather than served unprotected.
import { verifySessionToken } from "./api/_firebase.js";

const SESSION_COOKIE = "kyiv1_session";
const LOGIN_PATH = "/api/site-login";

export async function onRequest(context) {
  const { request, env, next } = context;
  if (!env.SITE_PASS) {
    return new Response("Access not configured", { status: 500 });
  }

  const session = await verifySessionToken(env, getCookie(request, SESSION_COOKIE));
  if (session?.ok) return next();

  const url = new URL(request.url);
  // The login page itself must stay reachable without a session — it's
  // the mechanism that creates one.
  if (url.pathname === LOGIN_PATH) return next();

  if (request.method === "GET") {
    return Response.redirect(`${url.origin}${LOGIN_PATH}`, 302);
  }
  return new Response("Authentication required", { status: 401 });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
