#!/usr/bin/env node
/**
 * Render one or more SVG files to PNG using the pre-installed Chromium
 * (no browser download — see PLAYWRIGHT_BROWSERS_PATH in the sandbox).
 *
 * Setup (each fresh session — playwright-core isn't vendored into the repo):
 *   cd <scratch dir> && npm init -y >/dev/null && npm install playwright-core
 *   node <path-to-this-file>/render_svg.js file1.svg file2.svg ...
 *
 * Output: same path as input with .svg -> .png. Uses an oversized viewport
 * and crops to the <svg> element's own bounding box, so no per-file
 * width/height bookkeeping is needed — just give it real files.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node render_svg.js file1.svg [file2.svg ...]');
  process.exit(1);
}

// Adjust if the installed chromium build id differs.
const CHROME_GLOB = '/opt/pw-browsers/chromium-*/chrome-linux/chrome';
function findChrome() {
  const base = '/opt/pw-browsers';
  const dir = fs.readdirSync(base).find(d => d.startsWith('chromium-') && !d.includes('headless'));
  return path.join(base, dir, 'chrome-linux', 'chrome');
}

(async () => {
  const browser = await chromium.launch({ executablePath: findChrome() });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 2000, height: 2000 });
  for (const f of files) {
    const svg = fs.readFileSync(f, 'utf8');
    const outPng = f.replace(/\.svg$/, '.png');
    await page.setContent(`<html><body style="margin:0;padding:0;">${svg}</body></html>`);
    const el = await page.$('svg');
    await el.screenshot({ path: outPng, omitBackground: true });
    console.log('rendered', outPng);
  }
  await browser.close();
})();
