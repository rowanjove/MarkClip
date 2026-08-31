const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'visual-regression');

function startFixtureServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>页摘视觉验收</title><main style="max-width:760px;margin:80px auto;padding:24px;font:18px system-ui;line-height:1.7"><h1>页摘视觉验收页面</h1><p>用于检查页面快捷入口在真实网页背景上的尺寸、边界和对比度。</p><p>面板应保持克制，不遮挡主要内容，也不使用渐变或发光效果。</p></main>');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function waitForWorker(context) {
  const existing = context.serviceWorkers()[0];
  if (existing) return existing;
  return context.waitForEvent('serviceworker', { timeout: 10_000 });
}

async function capture() {
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'page2md-ui-review-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  const fixture = await startFixtureServer();

  try {
    const worker = await waitForWorker(context);
    const extensionId = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator('h1').waitFor({ state: 'visible', timeout: 5_000 });
    await popup.waitForFunction(() => document.activeElement?.matches('.mode-btn.active'));
    await popup.screenshot({ path: path.join(output, 'popup-light.png') });
    await popup.locator('#themeToggle').click();
    await popup.screenshot({ path: path.join(output, 'popup-dark.png') });

    const page = await context.newPage();
    await page.setViewportSize({ width: 1200, height: 760 });
    await page.goto(`http://127.0.0.1:${fixture.port}/`);
    // Preferences/actions are fixture stubs; the icon must use the real extension resource.
    await page.evaluate((id) => {
      window.chrome = {
        runtime: {
          getURL: (file) => `chrome-extension://${id}/${file}`,
          sendMessage: async () => ({ success: true }),
        },
        storage: {
          local: {
            get: async (defaults) => ({ ...defaults, 'page2md:floatingHidden': false, 'page2md:theme': 'light', 'page2md:mode': 'main' }),
            set: async () => {},
          },
          onChanged: { addListener: () => {} },
        },
      };
      window.MarkClipFloatingUtils = {
        clampPosition(position, viewport, element = {}) {
          return {
            right: Math.max(8, Math.min(Number(position.right) || 22, viewport.width - (element.width || 48) - 8)),
            bottom: Math.max(8, Math.min(Number(position.bottom) || 82, viewport.height - (element.height || 48) - 8)),
          };
        },
      };
      window.MarkClipExtractor = {
        buildMarkdown: async () => ({ markdown: '# 视觉验收', title: '视觉验收', charCount: 6, warnings: [] }),
        copyMarkdown: async () => {},
        downloadMarkdown: () => {},
      };
      window.MarkClipPickSelection = { mergePickSelection: (items) => items };
      window.MarkClipPick = { pickMarkdown: async () => ({ markdown: '# 视觉验收', title: '视觉验收', charCount: 6, warnings: [] }) };
    }, extensionId);
    await page.addScriptTag({ path: path.join(root, 'floating-utils.js') });
    await page.addScriptTag({ path: path.join(root, 'content-floating.js') });
    await page.evaluate(() => window.MarkClipFloating.createFloatingUi());
    const host = page.locator('#page2md-floating-root');
    await host.waitFor({ state: 'attached', timeout: 5_000 });
    await host.evaluate((node) => node.shadowRoot.querySelector('.fab img').decode());
    await host.evaluate((node) => node.shadowRoot.querySelector('.fab').click());
    await page.screenshot({ path: path.join(output, 'floating-light.png') });
    await host.evaluate((node) => node.shadowRoot.querySelector('.theme').click());
    await page.screenshot({ path: path.join(output, 'floating-dark.png') });
  } finally {
    await context.close();
    fixture.server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_error) { /* best effort for locked browser files */ }
  }
}

if (require.main === module) {
  capture().then(() => console.log(`Captured UI review screenshots in ${path.relative(root, output)}.`))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { capture };
