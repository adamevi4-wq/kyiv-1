// Unauthenticated, read-only probe of the LIVE site. Needs no secrets: it
// only asserts that the shared-secret gate (functions/_middleware.js) is
// closed and the login page is reachable — i.e. the things that must hold
// for the site to be both up and not publicly exposed. It deliberately never
// logs in, so SITE_PASS never has to be stored in CI.
const SITE_URL = (process.env.SITE_URL || "https://kyiv1-dashboard.com").replace(/\/$/, "");
const LOGIN_PATH = "/api/site-login";
const ATTEMPTS = 3;
const RETRY_DELAY_MS = Number(process.env.LIVE_CHECK_RETRY_MS || 20_000);

// Repo files that a broken gate would serve to anyone, since Pages serves the
// repository root as static assets.
const MUST_BE_GATED = [
  "/", "/index.html", "/style.css", "/firestore.rules", "/CLAUDE.md", "/README.md",
  "/telegram-bot/worker.js", "/functions/_middleware.js",
  "/reference/kyiv1-fy2025-26-baseline.json",
];

async function probe(method, pathname, headers = {}) {
  const res = await fetch(SITE_URL + pathname, {
    method,
    redirect: "manual",
    headers: { "user-agent": "kyiv1-live-check", ...headers },
    signal: AbortSignal.timeout(20_000),
  });
  const body = method === "GET" ? await res.text() : "";
  return { status: res.status, location: res.headers.get("location") || "", type: res.headers.get("content-type") || "", body };
}

function redirectsToLogin(r) {
  return r.status === 302 && new URL(r.location, SITE_URL).pathname === LOGIN_PATH;
}

async function runChecks() {
  const failures = [];
  const record = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
    if (!ok) failures.push(name);
  };

  for (const p of MUST_BE_GATED) {
    const r = await probe("GET", p);
    record(`gated: GET ${p}`, redirectsToLogin(r), `status ${r.status}, location "${r.location}"`);
  }

  const head = await probe("HEAD", "/");
  record("gated: HEAD / is refused", head.status === 401, `status ${head.status}`);

  const forged = await probe("GET", "/", { cookie: "kyiv1_session=not-a-real-token" });
  record("gated: forged session cookie is rejected", redirectsToLogin(forged), `status ${forged.status}`);

  const login = await probe("GET", LOGIN_PATH);
  record("login page is reachable", login.status === 200 && login.type.includes("text/html") && login.body.length > 200, `status ${login.status}, type "${login.type}"`);

  return failures;
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  console.log(`\nLive check of ${SITE_URL} — attempt ${attempt}/${ATTEMPTS}`);
  let failures;
  try {
    failures = await runChecks();
  } catch (err) {
    failures = [`request error: ${err.message}`];
    console.log(`FAIL  ${failures[0]}`);
  }
  if (!failures.length) {
    console.log("\nPASSED: site is up and the gate is closed");
    process.exit(0);
  }
  if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  else {
    console.log(`\nFAILED after ${ATTEMPTS} attempts: ${failures.join("; ")}`);
    process.exit(1);
  }
}
