// Cloudflare Pages Function — runs in front of every request to this site
// (kyiv-1.pages.dev), before any static file (including index.html and
// robots.txt) is served.
//
// Two parallel front doors (2026-09-19, per Adam: "я не хочу давати їм
// пароль від URL"):
//
// 1. A long-lived signed session cookie (kyiv1_session), issued by
//    functions/api/site-access.js after a one-time 6-digit email code
//    confirms the visitor is a known district person — no shared secret
//    to hand out, each person verifies their OWN inbox once per device.
// 2. The original shared HTTP Basic Auth login (SITE_USER/SITE_PASS, set
//    in Cloudflare Pages → Settings → Environment variables as Secret) —
//    kept deliberately as a fallback, not removed. It's no longer
//    challenged by default (a visitor with neither door open now lands on
//    the email-code page, not a browser Basic Auth popup), but
//    /api/basic-auth-challenge still forces that popup and, once
//    answered, the browser's own Authorization-header caching makes every
//    later request pass the check below same as before this change.
//
// Either door is a *site-wide* gate — it stops a stranger from even
// loading the page at all, which Firebase rules alone can't do (those
// only protect the data once the page is already running in someone's
// browser). Neither door grants any Firestore/app privileges of its own;
// the separate in-app login screen (functions/api/login.js) still runs
// after either one and is unaffected.
//
// Fails closed: if SITE_USER/SITE_PASS aren't set (e.g. a fresh deploy
// before they're configured), every request is rejected rather than
// served unprotected — same as before this file changed.
import { verifySessionToken } from "./api/_firebase.js";

const SESSION_COOKIE = "kyiv1_session";
const CHALLENGE_PATH = "/api/basic-auth-challenge";
const GATE_PATH_PREFIX = "/api/site-access";

export async function onRequest(context) {
  const { request, env, next } = context;
  const user = env.SITE_USER;
  const pass = env.SITE_PASS;
  if (!user || !pass) {
    return new Response("Access not configured", { status: 500 });
  }

  const session = await verifySessionToken(env, getCookie(request, SESSION_COOKIE));
  if (session && session.uid) return next();

  const expected = "Basic " + btoa(`${user}:${pass}`);
  const hasValidBasicAuth = request.headers.get("Authorization") === expected;
  const url = new URL(request.url);

  // /api/basic-auth-challenge always demands the Basic Auth prompt
  // specifically, regardless of any session cookie — it's the one place a
  // visitor can deliberately open this fallback door.
  if (url.pathname === CHALLENGE_PATH) {
    if (!hasValidBasicAuth) {
      return new Response("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Kyiv-1 Dashboard", charset="UTF-8"' },
      });
    }
    return next();
  }

  if (hasValidBasicAuth) return next();

  // The email-code gate itself must stay reachable without either door
  // already open — it's the mechanism that opens door 1.
  if (url.pathname.startsWith(GATE_PATH_PREFIX)) return next();

  if (request.method === "GET") {
    return Response.redirect(`${url.origin}${GATE_PATH_PREFIX}`, 302);
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
