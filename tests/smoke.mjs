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
import { existsSync } from "node:fs";
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
      'import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";',
      'import { getAuth, signInAnonymously } from "./fbstub/firebase-auth.js";'
    );
}

async function startServer() {
  const indexHtml = rewriteImports(await readFile(path.join(repoRoot, "index.html"), "utf8"));
  const fbstubFiles = {
    "firebase-app.js": await readFile(path.join(__dirname, "fbstub/firebase-app.js"), "utf8"),
    "firebase-auth.js": await readFile(path.join(__dirname, "fbstub/firebase-auth.js"), "utf8"),
    "firebase-firestore.js": await readFile(path.join(__dirname, "fbstub/firebase-firestore.js"), "utf8"),
  };
  const server = createServer((req, res) => {
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
    const fbstubMatch = url.match(/^\/fbstub\/(.+)$/);
    if (fbstubMatch && fbstubFiles[fbstubMatch[1]]) {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(fbstubFiles[fbstubMatch[1]]);
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

    await step('open "Вакансії"', async () => {
      await page.locator(".tab-btn", { hasText: "Вакансії" }).first().click();
      await page.waitForTimeout(200);
    });
    const vacSubtabs = await page.$$eval("[data-vac-subtab]", (els) => els.map((e) => e.textContent.trim()));
    for (const name of vacSubtabs) {
      await step(`Vacancies subtab "${name}"`, async () => {
        await page.locator("[data-vac-subtab]", { hasText: name }).first().click();
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
