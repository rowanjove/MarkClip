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
    assert.equal(await popup.locator('h1').innerText(), '页摘');
    assert.equal(await popup.locator('#btnObsidian').count(), 1);
    assert.equal(await popup.locator('#btnBatch').count(), 1);
    assert.equal(await popup.locator('#localizeImagesSwitch').getAttribute('role'), 'switch');
    assert.equal(await popup.locator('#advancedActions').getAttribute('open'), null);
    const metrics = await popup.evaluate(() => {
      const body = document.body.getBoundingClientRect();
      const footer = document.querySelector('.action-bar').getBoundingClientRect();
      return {
        bodyWidth: body.width,
        bodyHeight: body.height,
        scrollWidth: document.body.scrollWidth,
        clientWidth: document.body.clientWidth,
        footerBottom: footer.bottom,
      };
    });
    assert.equal(metrics.bodyWidth, 360);
    assert.equal(metrics.scrollWidth <= metrics.clientWidth + 1, true);
    assert.equal(metrics.footerBottom <= metrics.bodyHeight + 1, true);
    await popup.locator('#advancedActions summary').click();
    assert.equal(await popup.locator('#advancedActions').getAttribute('open'), '');
    await popup.keyboard.press('Escape');
    assert.equal(await popup.locator('#advancedActions').getAttribute('open'), null);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('Chromium loads the real floating icon and bounds the panel during resize and drag', { skip: !shouldRun }, async () => {
  const { chromium } = require('playwright');
  const root = path.resolve(__dirname, '../..');
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://floating.test/**', (route) => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><body><main>Local floating regression fixture.</main></body>',
    }));
    await page.goto('http://floating.test/');
    // Mock preferences only. Rendering, resource permissions, pointer events and layout are real.
    await page.evaluate((id) => {
      window.chrome = {
        runtime: { getURL: (file) => `chrome-extension://${id}/${file}` },
        storage: {
          local: {
            get: async (defaults) => ({ ...defaults, 'page2md:floatingHidden': false }),
            set: async () => {},
          },
          onChanged: { addListener: () => {} },
        },
      };
    }, extensionId);
    await page.addScriptTag({ path: path.join(root, 'floating-utils.js') });
    await page.addScriptTag({ path: path.join(root, 'content-floating.js') });
    await page.evaluate(() => window.MarkClipFloating.createFloatingUi());
    const host = page.locator('#page2md-floating-root');
    const icon = await host.evaluate(async (node) => {
      const image = node.shadowRoot.querySelector('.fab img');
      await image.decode();
      return { src: image.src, width: image.naturalWidth };
    });
    assert.equal(icon.src, `chrome-extension://${extensionId}/icons/icon48.png`);
    assert.equal(icon.width, 48);
    await host.locator('.fab').click();

    async function assertBounds(label) {
      const box = await host.locator('.panel').boundingBox();
      const viewport = page.viewportSize();
      assert.ok(box && box.width > 0 && box.height > 0, label);
      assert.ok(box.x >= 7.5 && box.y >= 7.5, `${label}: ${JSON.stringify(box)}`);
      assert.ok(box.x + box.width <= viewport.width - 7.5, `${label}: right overflow`);
      assert.ok(box.y + box.height <= viewport.height - 7.5, `${label}: bottom overflow`);
    }

    for (const viewport of [{ width: 360, height: 400 }, { width: 320, height: 240 }, { width: 768, height: 600 }, { width: 360, height: 100 }]) {
      await page.setViewportSize(viewport);
      const positions = [
        [8, 8], [viewport.width - 56, 8], [8, viewport.height - 56],
        [viewport.width - 56, viewport.height - 56], [(viewport.width - 48) / 2, (viewport.height - 48) / 2],
      ];
      for (const [right, bottom] of positions) {
        await host.evaluate((node, position) => {
          node.style.right = `${position.right}px`;
          node.style.bottom = `${position.bottom}px`;
          window.dispatchEvent(new Event('resize'));
        }, { right, bottom });
        await assertBounds(`${viewport.width}x${viewport.height} at ${right},${bottom}`);
      }
    }
    await page.setViewportSize({ width: 360, height: 400 });
    await host.evaluate((node) => {
      node.style.right = '8px'; node.style.bottom = '8px';
      window.dispatchEvent(new Event('resize'));
    });
    const fab = await host.locator('.fab').boundingBox();
    await page.mouse.move(fab.x + 24, fab.y + 24);
    await page.mouse.down();
    await page.mouse.move(180, 200, { steps: 6 });
    await assertBounds('during drag');
    await page.mouse.up();
    assert.equal(await host.locator('.fab').getAttribute('aria-expanded'), 'true');
    await host.locator('[data-mode="main"]').focus();
    await page.keyboard.press('Escape');
    assert.equal(await host.locator('.fab').getAttribute('aria-expanded'), 'false');
    assert.equal(await host.evaluate((node) => node.shadowRoot.activeElement === node.shadowRoot.querySelector('.fab')), true);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
