// Headless smoke test for index.html — replaces the ad-hoc manual
// Playwright pass that used to happen by hand before every ship. Swaps the
// real Firebase imports for tests/fbstub (no network, no real project
// touched), serves the page locally, and clicks through every tab,
// KPI/vacancy subtab, and the main modals, failing on any console error or
// uncaught page error. Deliberately seeds nothing — this exercises the
// app's own DEFAULT_USERS/DEFAULT_STORES/DEFAULT_ZONES/ADMIN_DEFAULT_PASSWORD
// fallbacks, the same code path a genuinely empty Firestore project hits.
//
// Run: node tests/smoke.mjs   (needs `npm ci` first — see package.json)
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// In CI, `npx playwright install --with-deps chromium` (see the workflow)
// downloads the browser revision this exact @playwright/test version
// expects, so the default chromium.launch() below just finds it. Some
// sandboxes (this one included) pre-install a browser at a fixed path
// instead and block that download to save bandwidth — if that path exists,
// point at it directly rather than fighting Playwright's own revision
// pinning for a local run.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const PORT = 8917;

function rewriteImports(html) {
  return html
    .replace(
      'import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";',
      'import { initializeApp } from "./fbstub/firebase-app.js";'
    )
    .replace(
      '} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";',
      '} from "./fbstub/firebase-firestore.js";'
    )
    .replace(
      'import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";',
      'import { getAuth, signInWithCustomToken } from "./fbstub/firebase-auth.js";'
    )
    // PptxGenJS (📤 Експорт PPTX) is loaded from a CDN <script> tag only
    // when that button is clicked — swapped here for the exact same
    // version installed as a devDependency (package.json pins it to the
    // identical "4.0.1", not a range, precisely so this always matches
    // what production actually loads), served from node_modules below.
    .replace(
      "https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js",
      "/fbstub/pptxgen.bundle.js"
    );
}

// Mirrors index.html's own DEFAULT_USERS/ADMIN_DEFAULT_PASSWORD — stands in
// for functions/api/login.js + login-options.js (real Cloudflare Pages
// Functions, not reachable from this harness) so the login screen's
// fetch("/api/login-options") / fetch("/api/login") calls have something to
// talk to. No seeding happens here either, so this always hits the
// legacy-plaintext branch (password === store code / "DM-Kyiv1"), same as
// the rest of this test's "empty Firestore project" premise.
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
const ADMIN_DEFAULT_PASSWORD = "DM-Kyiv1";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function startServer() {
  const indexHtml = rewriteImports(await readFile(path.join(repoRoot, "index.html"), "utf8"));
  const fbstubFiles = {
    "firebase-app.js": await readFile(path.join(__dirname, "fbstub/firebase-app.js"), "utf8"),
    "firebase-auth.js": await readFile(path.join(__dirname, "fbstub/firebase-auth.js"), "utf8"),
    "firebase-firestore.js": await readFile(path.join(__dirname, "fbstub/firebase-firestore.js"), "utf8"),
    // Not checked in under tests/fbstub (460KB, third-party) — read
    // straight from the pinned devDependency instead (see package.json).
    "pptxgen.bundle.js": await readFile(path.join(repoRoot, "node_modules/pptxgenjs/dist/pptxgen.bundle.js"), "utf8"),
  };
  const server = createServer(async (req, res) => {
    const url = req.url === "/" ? "/index.html" : req.url;
    if (url === "/favicon.ico") {
      // Browsers request this unconditionally; index.html declares none, so
      // answer 204 rather than let it show up as a spurious 404 in errors.
      res.writeHead(204);
      res.end();
      return;
    }
    if (url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(indexHtml);
      return;
    }
    if (url === "/api/login-options") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(DEFAULT_USERS));
      return;
    }
    if (url === "/api/login" && req.method === "POST") {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (e) { body = {}; }
      const { role, userId, password } = body;
      const ok =
        (role === "admin" && password === ADMIN_DEFAULT_PASSWORD) ||
        (role === "manager" && DEFAULT_USERS.some((u) => u.id === userId && u.store === password));
      res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" });
      res.end(JSON.stringify(ok ? { token: "test-token" } : { error: "invalid credentials" }));
      return;
    }
    // Stands in for functions/api/district-summary.js — a manager's own
    // Firestore token can no longer read every store's numbers itself
    // (2026-09-20 per-store read scoping), so index.html fetches this for
    // the Магазини та ставки tab's district-wide top summary. Empty here
    // (same "no seeding" premise as everything else in this harness) is
    // fine — the tab degrades to showing zeros/dashes, same as a real
    // empty Firestore project would, and exercises the fetch path without
    // needing to duplicate DEFAULT_STORES on this fake server too.
    if (url === "/api/district-summary") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("[]");
      return;
    }
    const fbstubMatch = url.match(/^\/fbstub\/(.+)$/);
    if (fbstubMatch && fbstubFiles[fbstubMatch[1]]) {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(fbstubFiles[fbstubMatch[1]]);
      return;
    }
    // Any other repo-root static asset index.html references directly
    // (style.css, robots.txt, ...) — served as-is, same as the real deploy.
    const CONTENT_TYPES = { ".css": "text/css", ".txt": "text/plain", ".js": "application/javascript", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
    const assetPath = path.join(repoRoot, decodeURIComponent(url));
    if (assetPath.startsWith(repoRoot) && existsSync(assetPath)) {
      res.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(assetPath)] || "application/octet-stream" });
      res.end(readFileSync(assetPath));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise((resolve) => server.listen(PORT, resolve));
  return server;
}

function isBenignError(text) {
  // Nothing in this harness ever reaches these hosts (no real network calls
  // at all besides the <head>'s font <link> tags) — a sandboxed/offline CI
  // runner can still surface a failed-to-load-resource console error for
  // those, which isn't a real app bug.
  return /gstatic\.com|fonts\.googleapis|CERT_AUTHORITY|ERR_NAME_NOT_RESOLVED|net::ERR_/.test(text);
}

async function main() {
  const server = await startServer();
  const errors = [];
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (isBenignError(t)) return;
    errors.push(`console.error: ${t}`);
  });

  const steps = [];
  const step = async (name, fn) => {
    await fn();
    steps.push(`${name}: errors=${errors.length}`);
  };

  try {
    await page.goto(`http://localhost:${PORT}/index.html`);
    await page.waitForSelector("#mgr-select", { timeout: 10000 });
    await step("login screen rendered", async () => {});

    // Manager login — DEFAULT_USERS[0], legacy-plaintext password (= store code).
    await step("manager login (legacy plaintext password)", async () => {
      await page.selectOption("#mgr-select", { index: 0 });
      await page.fill("#mgr-pass", "J104");
      await page.click("#mgr-login-btn");
      await page.waitForSelector("#logout-btn", { timeout: 5000 });
    });

    await step("manager: own-password modal opens", async () => {
      await page.click("#password-btn");
      await page.waitForTimeout(200);
      await page.click("#pw-cancel");
    });

    await step("logout", async () => {
      await page.click("#logout-btn");
      await page.waitForSelector("#tab-manager", { timeout: 5000 });
    });

    // Admin login — ADMIN_DEFAULT_PASSWORD fallback.
    await step("admin login (default password)", async () => {
      await page.click("#tab-admin");
      await page.fill("#adm-pass", "DM-Kyiv1");
      await page.click("#adm-login-btn");
      await page.waitForSelector("#logout-btn", { timeout: 5000 });
    });

    const tabs = await page.$$eval(".tab-btn", (els) => els.map((e) => e.textContent.trim()));
    for (const name of tabs) {
      await step(`tab "${name}"`, async () => {
        await page.locator(".tab-btn", { hasText: name }).first().click();
        await page.waitForTimeout(300);
      });
    }

    await step('open "Звіти та показники"', async () => {
      await page.locator(".tab-btn", { hasText: "Звіти та показники" }).first().click();
      await page.waitForTimeout(200);
    });
    const kpiSubtabs = await page.$$eval("[data-kpi-subtab]", (els) => els.map((e) => e.textContent.trim()));
    for (const name of kpiSubtabs) {
      await step(`KPI subtab "${name}"`, async () => {
        await page.locator("[data-kpi-subtab]", { hasText: name }).first().click();
        await page.waitForTimeout(300);
      });
    }

    await step('open "Витрати"', async () => {
      await page.locator(".tab-btn", { hasText: "Витрати" }).first().click();
      await page.waitForTimeout(200);
    });
    const expensesSubtabs = await page.$$eval("[data-expenses-subtab]", (els) => els.map((e) => e.textContent.trim()));
    for (const name of expensesSubtabs) {
      await step(`Expenses subtab "${name}"`, async () => {
        await page.locator("[data-expenses-subtab]", { hasText: name }).first().click();
        await page.waitForTimeout(300);
      });
    }

    await step('open "Персонал"', async () => {
      await page.locator(".tab-btn", { hasText: "Персонал" }).first().click();
      await page.waitForTimeout(200);
    });
    const personnelSubtabs = await page.$$eval("[data-personnel-subtab]", (els) => els.map((e) => e.textContent.trim()));
    for (const name of personnelSubtabs) {
      await step(`Personnel subtab "${name}"`, async () => {
        await page.locator("[data-personnel-subtab]", { hasText: name }).first().click();
        await page.waitForTimeout(300);
      });
    }

    await step("add-vacancy form opens", async () => {
      const btn = page.locator("#add-vacancy-btn");
      if (await btn.count()) await btn.click();
      await page.waitForTimeout(200);
    });

    await step("admin panel opens and closes", async () => {
      await page.click("#admin-panel-btn");
      await page.waitForTimeout(200);
      const done = page.locator("#adm-panel-done");
      if (await done.count()) await done.click();
    });

    await step("export PPTX (district + all store slides)", async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 10000 }),
        page.click("#export-pptx-btn"),
      ]);
      const savePath = await download.path();
      if (!savePath) throw new Error("export-pptx-btn: no file was downloaded");
      const size = statSync(savePath).size;
      if (size < 1000) throw new Error(`export-pptx-btn: downloaded file suspiciously small (${size} bytes)`);
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(steps.map((s) => `  ${s}`).join("\n"));
  console.log();
  if (errors.length) {
    console.error(`FAILED — ${errors.length} error(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log("PASSED — no console errors or page errors across the full pass.");
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
