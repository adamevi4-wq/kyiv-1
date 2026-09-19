// GET /api/basic-auth-challenge — the Basic Auth fallback door, kept
// alongside /api/site-access's email-code flow rather than removing
// SITE_USER/SITE_PASS entirely. functions/_middleware.js special-cases
// this exact path: it always issues a 401 + WWW-Authenticate challenge
// here (even when a visitor already has a valid site-access session
// cookie, or Basic Auth is otherwise not being enforced by default), so
// visiting this link is what makes the browser show its native Basic
// Auth prompt. Once entered, the browser caches that Authorization header
// and resends it automatically on every later request to this origin —
// the middleware's own Authorization check then lets those requests
// through same as before this whole change, no different than how the
// site worked prior to /api/site-access existing.
//
// Reaching this handler at all already proves the middleware validated
// Basic Auth for this path — there's nothing left to check here.
export async function onRequestGet() {
  return new Response(
    `<!DOCTYPE html><html lang="uk"><meta charset="utf-8"><body style="font-family:sans-serif;max-width:420px;margin:60px auto;"><p style="color:green">Пароль сайту прийнято.</p><p><a href="/">На сайт →</a></p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
