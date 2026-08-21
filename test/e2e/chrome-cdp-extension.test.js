const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const shouldRun = process.env.RUN_CHROME_CDP_E2E === '1';

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForJson(url, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (_error) {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Chrome CDP endpoint did not start: ${url}`);
}

function startFixtureServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Chrome smoke fixture</title><main><h1>Smoke fixture</h1><p>This page is used for a stable extension smoke check.</p></main>');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

test('stable Chrome loads MarkClip through CDP and renders the popup shell', { skip: !shouldRun }, async () => {
  const { chromium } = require('playwright');
  const root = path.resolve(__dirname, '../..');
  const chromePath = findChrome();
  assert.ok(chromePath, 'Set CHROME_PATH to a stable Chrome/Chrome for Testing executable.');
  const port = await getFreePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'markclip-chrome-cdp-'));
  const fixture = await startFixtureServer();
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let browser;
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: root });
    assert.match(id, /^[a-p]{32}$/);

    const context = browser.contexts()[0];
    const worker = context.serviceWorkers().find((candidate) => candidate.url() === `chrome-extension://${id}/background.js`)
      || await context.waitForEvent('serviceworker', { timeout: 10_000 });
    assert.equal(worker.url(), `chrome-extension://${id}/background.js`);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.locator('h1').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await page.locator('h1').innerText(), 'MarkClip');
    assert.equal(await page.locator('#btnObsidian').count(), 1);
    assert.equal(await page.locator('#btnBatch').count(), 1);
    assert.equal(await page.locator('#localizeImagesSwitch').getAttribute('role'), 'switch');

    const fixturePage = await context.newPage();
    await fixturePage.goto(`http://127.0.0.1:${fixture.port}/`);
    assert.equal(await fixturePage.locator('h1').innerText(), 'Smoke fixture');
  } finally {
    await browser?.close();
    fixture.server.close();
    if (!chrome.killed) chrome.kill();
    await new Promise((resolve) => {
      if (chrome.exitCode !== null) return resolve();
      chrome.once('exit', resolve);
      setTimeout(resolve, 3000);
    });
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_error) { /* best effort for locked Chrome files */ }
  }
});
