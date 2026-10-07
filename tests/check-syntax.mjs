import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tmp = mkdtempSync(path.join(tmpdir(), "kyiv1-check-"));
const failures = [];

function check(label, file) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    console.log(`ok    ${label}`);
  } catch (err) {
    failures.push(label);
    console.log(`FAIL  ${label}\n${err.stderr?.toString() || err.message}`);
  }
}

try {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!match) {
    failures.push("index.html (no module script found)");
    console.log("FAIL  index.html: no <script type=\"module\"> block found");
  } else {
    const extracted = path.join(tmp, "index-module.mjs");
    writeFileSync(extracted, match[1]);
    check("index.html module script", extracted);
  }

  check("telegram-bot/worker.js", path.join(root, "telegram-bot/worker.js"));
  check("functions/_middleware.js", path.join(root, "functions/_middleware.js"));
  for (const name of readdirSync(path.join(root, "functions/api")).filter((n) => n.endsWith(".js"))) {
    check(`functions/api/${name}`, path.join(root, "functions/api", name));
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.log(`\nFAILED: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nPASSED: every checked file parses");
