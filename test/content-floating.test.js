const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function createFloatingWindow() {
  const dom = new JSDOM('<!doctype html><html><body><article>Enough page text for the floating control.</article></body></html>', {
    url: 'https://example.com/article',
    runScripts: 'outside-only',
  });
  const listeners = [];
  const state = {
    'page2md:floatingPosition': { right: 22, bottom: 82 },
    'page2md:theme': 'light',
    'page2md:mode': 'main',
    'page2md:removeImages': false,
    'page2md:localizeImages': false,
    'page2md:floatingHidden': false,
  };
  dom.window.chrome = {
    runtime: { getURL: (file) => `chrome-extension://test/${file}`, sendMessage: async () => ({ success: true }) },
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...state }),
        set: async (values) => Object.assign(state, values),
      },
      onChanged: { addListener: (listener) => listeners.push(listener) },
    },
  };
  dom.window.MarkClipPickSelection = { mergePickSelection: (items) => items };
  dom.window.MarkClipExtractor = {
    buildMarkdown: async () => ({ markdown: '# page', title: 'page', charCount: 6, source: '正文', warnings: [] }),
    copyMarkdown: async () => {},
    downloadMarkdown: () => {},
  };
  dom.window.MarkClipPick = { pickMarkdown: async () => ({ markdown: '# page', title: 'page', charCount: 6, warnings: [] }) };
  dom.window.eval(fs.readFileSync('floating-utils.js', 'utf8'));
  dom.window.eval(fs.readFileSync('content-floating.js', 'utf8'));
  return { dom, listeners, state };
}

test('floating control opens from a normal click and follows preference changes', async () => {
  const { dom, listeners } = createFloatingWindow();
  await Promise.all([
    dom.window.MarkClipFloating.createFloatingUi(),
    dom.window.MarkClipFloating.createFloatingUi(),
  ]);
  const host = dom.window.MarkClipFloating.getUiHost();
  assert.equal(dom.window.document.querySelectorAll('#page2md-floating-root').length, 1);
  const fab = host.shadowRoot.querySelector('.fab');
  const panel = host.shadowRoot.querySelector('.panel');

  fab.click();
  assert.equal(panel.classList.contains('open'), true);

  panel.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(panel.classList.contains('open'), false);
  fab.click();
  assert.equal(panel.classList.contains('open'), true);

  listeners[0]({
    'page2md:mode': { newValue: 'full' },
    'page2md:removeImages': { newValue: true },
  }, 'local');
  assert.equal(host.shadowRoot.querySelector('[data-mode="full"]').getAttribute('aria-pressed'), 'true');
  assert.equal(host.shadowRoot.querySelector('.images').getAttribute('aria-checked'), 'true');
});

test('hiding during preference loading prevents a stale floating host', async (t) => {
  const { dom, state } = createFloatingWindow();
  t.after(() => dom.window.close());
  const snapshot = { ...state };
  let resolveRead;
  dom.window.chrome.storage.local.get = () => new Promise((resolve) => { resolveRead = resolve; });
  const pending = dom.window.MarkClipFloating.createFloatingUi();
  await dom.window.MarkClipFloating.hideFloating();
  resolveRead(snapshot);
  await pending;
  assert.equal(state['page2md:floatingHidden'], true);
  assert.equal(dom.window.MarkClipFloating.getUiHost(), null);
});

test('a storage hide event invalidates initialization before a host exists', async (t) => {
  const { dom, listeners, state } = createFloatingWindow();
  t.after(() => dom.window.close());
  let resolveRead;
  dom.window.chrome.storage.local.get = () => new Promise((resolve) => { resolveRead = resolve; });
  const pending = dom.window.MarkClipFloating.createFloatingUi();
  assert.equal(listeners.length, 1);
  listeners[0]({ 'page2md:floatingHidden': { newValue: true } }, 'local');
  resolveRead({ ...state });
  await pending;
  assert.equal(dom.window.MarkClipFloating.getUiHost(), null);
});

test('showing again does not join the invalidated creation or lose the new lock', async (t) => {
  const { dom, state } = createFloatingWindow();
  t.after(() => dom.window.close());
  const reads = [];
  dom.window.chrome.storage.local.get = () => new Promise((resolve) => { reads.push(resolve); });
  const stale = dom.window.MarkClipFloating.createFloatingUi();
  await dom.window.MarkClipFloating.hideFloating();
  const fresh = dom.window.MarkClipFloating.showFloating();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads.length, 2);
  reads[0]({ ...state });
  await stale;
  assert.equal(dom.window.MarkClipFloating.getUiHost(), null);
  const joined = dom.window.MarkClipFloating.createFloatingUi();
  assert.equal(reads.length, 2);
  reads[1]({ ...state });
  await Promise.all([fresh, joined]);
  assert.equal(dom.window.document.querySelectorAll('#page2md-floating-root').length, 1);
});
