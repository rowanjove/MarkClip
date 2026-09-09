const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const shouldRun = process.env.RUN_MODERN_E2E === '1';

test('WXT Chrome build loads popup and extracts a local fixture', { skip: !shouldRun }, async () => {
  const { chromium } = require('playwright');
  const root = path.resolve(__dirname, '../..');
  const extension = path.join(root, '.output', 'chrome-mv3');
  assert.equal(fs.existsSync(path.join(extension, 'manifest.json')), true, 'run npm run build:chrome first');
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<article><h1>Fixture</h1><p>This is a sufficiently long article body for the modern smart extractor to preserve in the output and diagnostics.</p></article>'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); const url = `http://127.0.0.1:${address.port}/fixture`;
  const context = await chromium.launchPersistentContext('', { executablePath: process.env.CHROME_PATH || chromium.executablePath(), headless: process.env.HEADFUL_E2E === '1' ? false : true, ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const id = new URL(worker.url()).host;
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.locator('#copy').waitFor({ state: 'visible' });
    assert.equal(await popup.locator('text=页摘').count() > 0, true);
    const options = await context.newPage(); await options.goto(`chrome-extension://${id}/options.html`);
    await options.locator('#templateBody').waitFor({ state: 'visible' });
    assert.equal(await options.locator('#exportRecipes').count(), 1);
    const sidepanel = await context.newPage(); await sidepanel.goto(`chrome-extension://${id}/sidepanel.html`);
    await sidepanel.locator('#runAi').waitFor({ state: 'visible' });
    assert.equal(await sidepanel.locator('#copyDiagnostics').count(), 1);
    const page = await context.newPage(); await page.goto(url);
    await page.bringToFront();
    const response = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); const tab = tabs[0]; if (!tab?.id) throw new Error('fixture tab missing');
      try { await chrome.tabs.sendMessage(tab.id, { action: 'ping' }); } catch { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['bootstrap.js'] }); }
      return chrome.tabs.sendMessage(tab.id, { action: 'capture', mode: 'main', extractionProfile: 'smart', renderProfile: 'gfm', imageMode: 'remote', operationId: crypto.randomUUID(), after: 'preview' });
    });
    assert.equal(response.success, true); assert.match(response.markdown, /Fixture/); assert.equal(response.diagnostics.recipeMatched, false);
    const commonmark = await worker.evaluate(async () => { const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); const tab = tabs[0]; return tab?.id ? chrome.tabs.sendMessage(tab.id, { action: 'capture', mode: 'main', extractionProfile: 'smart', renderProfile: 'commonmark', imageMode: 'remote', operationId: crypto.randomUUID(), after: 'preview' }) : null; });
    assert.equal(commonmark?.success, true); assert.doesNotMatch(commonmark.markdown, /^---\n/m);
    await worker.evaluate(async () => { const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); if (tabs[0]?.id) await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['floating.js'] }); });
    await page.locator('#yezai-floating-entry').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#yezai-floating-entry').getAttribute('aria-label'), '保存当前网页为 Markdown');
    const picked = worker.evaluate(async () => { const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); const tab = tabs[0]; if (!tab?.id) throw new Error('fixture tab missing'); return chrome.tabs.sendMessage(tab.id, { action: 'capture', mode: 'pick', extractionProfile: 'smart', renderProfile: 'gfm', imageMode: 'remote', operationId: crypto.randomUUID(), after: 'preview' }); });
    await page.locator('article').click();
    const pickedResponse = await picked;
    assert.equal(pickedResponse.success, true); assert.match(pickedResponse.markdown, /Fixture/);
  } finally { await context.close(); await new Promise((resolve) => server.close(resolve)); }
});
