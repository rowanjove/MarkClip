const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const shouldRun = process.env.RUN_BROWSER_E2E === '1';

test('Chromium loads the MV3 service worker and popup shell', { skip: !shouldRun }, async () => {
  const { chromium } = require('playwright');
  const root = path.resolve(__dirname, '../..');
  const executablePath = process.env.CHROME_PATH || chromium.executablePath();
  assert.equal(fs.existsSync(executablePath), true, `Chrome not found at ${executablePath}`);

  const profile = process.env.E2E_PROFILE
    ? path.resolve(process.env.E2E_PROFILE)
    : path.join(root, `.tmp-browser-e2e-${process.pid}`);
  const context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });

  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      try {
        worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
      } catch (error) {
        if (process.env.CHROME_PATH) {
          throw new Error('The selected branded Chrome build ignored --load-extension; use bundled Chromium or manually load the unpacked extension in chrome://extensions.', { cause: error });
        }
        throw error;
      }
    }
    assert.match(worker.url(), /^chrome-extension:\/\//);
    const extensionId = new URL(worker.url()).host;
    const popup = await context.newPage();
    const pageErrors = [];
    popup.on('pageerror', (error) => pageErrors.push(error.message));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await assert.doesNotReject(() => popup.locator('h1').waitFor({ state: 'visible', timeout: 5000 }));
    assert.equal(await popup.locator('h1').innerText(), 'MarkClip');
    assert.equal(await popup.locator('#btnObsidian').count(), 1);
    assert.equal(await popup.locator('#btnBatch').count(), 1);
    assert.equal(await popup.locator('#localizeImagesSwitch').getAttribute('role'), 'switch');
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});
