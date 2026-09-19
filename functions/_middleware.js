// Cloudflare Pages Function — runs in front of every request to this site
// (kyiv-1.pages.dev), before any static file (including index.html and
// robots.txt) is served. Gates the whole site behind one shared HTTP Basic
// Auth login, set as SITE_USER/SITE_PASS in the Cloudflare Pages project's
// Settings → Environment variables (as Secret, not plain text).
//
// This is a *second*, earlier gate than the app's own login screen — it
// stops a stranger from even loading the page at all, which Firebase rules
// alone can't do (those only protect the data once the page is already
// running in someone's browser). SITE_USER/SITE_PASS are separate from any
// per-store password inside the app itself; this one login is shared by
// everyone who needs to reach the site.
//
// Fails closed: if the env vars aren't set (e.g. a fresh deploy before
// they're configured), every request is rejected rather than served
// unprotected.
export async function onRequest(context) {
  const { request, env, next } = context;
  const user = env.SITE_USER;
  const pass = env.SITE_PASS;
  if (!user || !pass) {
    return new Response("Access not configured", { status: 500 });
  }
  const expected = "Basic " + btoa(`${user}:${pass}`);
  if (request.headers.get("Authorization") !== expected) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Kyiv-1 Dashboard", charset="UTF-8"' },
    });
  }
  return next();
}
