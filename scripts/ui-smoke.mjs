/**
 * Browser smoke over the *built* game — the checks vitest cannot make.
 *
 * Exists because of a real regression: `#overlay > *` in index.html killed
 * every panel-level button (end-of-run, speed, settings) by ID specificity
 * while the engine suite stayed green — pointer-events lives below the reach
 * of any headless sim test. This clicks the actual DOM in the actual build.
 *
 * Run:  npm run build && npx vite preview --port 4173 &
 *       npm i -D playwright (once; set PW_CHROMIUM if no managed browser)
 *       node scripts/ui-smoke.mjs
 */
import { chromium } from 'playwright';

const browser = await chromium.launch(
  process.env.PW_CHROMIUM || process.env.PLAYWRIGHT_BROWSERS_PATH
    ? { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' }
    : {},
);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const fails = [];
const ok = (name, cond) => (cond ? console.log(`  ✓ ${name}`) : (fails.push(name), console.log(`  ✗ ${name}`)));

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 1. Computed pointer-events on the elements that were dead.
const pe = (sel) => page.$eval(sel, (el) => getComputedStyle(el).pointerEvents).catch(() => 'missing');
ok('.screen receives events', (await pe('.screen')) === 'auto');
ok('.speed-btn receives events', (await pe('.speed-btn')) === 'auto');
ok('.run-panel receives events', (await pe('.run-panel')) === 'auto');
ok('.pause-btn exists + receives events', (await pe('.pause-btn')) === 'auto');
ok('.ability-bar still inert', (await pe('.ability-bar')) === 'none' || (await pe('.ability-bar')) === 'missing');

// 2. Map select: open settings, flip a toggle, close it.
await page.click('button[aria-label="Settings"]');
await page.waitForTimeout(200);
ok('settings sheet opens', await page.isVisible('.settings-sheet'));
const before = await page.getAttribute('.settings-row[role="switch"]', 'aria-checked');
await page.click('.settings-row');
const after = await page.getAttribute('.settings-row[role="switch"]', 'aria-checked');
ok('settings toggle flips', before !== after);
await page.click('.settings-done');
await page.waitForTimeout(200);
ok('settings sheet closes', !(await page.isVisible('.settings-sheet')));

// 3. Enter the first map, pause, resume, pause, retreat to map select.
await page.click('.map-row:not([disabled])');
await page.waitForTimeout(1200);
ok('run HUD shown', await page.isVisible('#startbtn'));
await page.click('.pause-btn');
await page.waitForTimeout(200);
ok('pause sheet opens', await page.isVisible('.pause-panel'));
await page.click('.pause-panel .run-again:not(.ghost)');
await page.waitForTimeout(200);
ok('resume closes pause sheet', !(await page.isVisible('.pause-panel')));
await page.click('.pause-btn');
await page.waitForTimeout(200);
await page.click('.pause-panel .run-again.ghost');
await page.waitForTimeout(600);
ok('retreat returns to map select', await page.isVisible('.screen'));
ok('pause sheet gone after retreat', !(await page.isVisible('.pause-panel')));

// 4. Left-hand mode mirrors the chrome.
await page.click('button[aria-label="Settings"]');
await page.waitForTimeout(200);
await page.$$eval('.settings-row', (rows) => rows[3].click()); // left-hand row
ok('body.left-hand applied', await page.$eval('body', (b) => b.classList.contains('left-hand')));
await page.click('.settings-done');

await browser.close();
if (fails.length) {
  console.error(`\nFAILED: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\nAll UI checks passed');
