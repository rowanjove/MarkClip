const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function createPopup() {
  const html = fs.readFileSync('popup.html', 'utf8');
  const dom = new JSDOM(html, { url: 'chrome-extension://test/popup.html', runScripts: 'outside-only' });
  const messages = [];
  const activeTab = { id: 7, url: 'https://example.com/article' };
  const storage = {
    'page2md:theme': 'dark',
    'page2md:mode': 'main',
    'page2md:removeImages': false,
    'page2md:localizeImages': false,
    'page2md:floatingHidden': true,
  };

  dom.window.chrome = {
    tabs: {
      query: async () => [activeTab],
    },
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...storage }),
        set: async (values) => Object.assign(storage, values),
      },
    },
    permissions: {},
  };
  Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
  dom.window.document.execCommand = () => true;
  const extensionMock = {
    ensureContentScripts: async () => {},
    ensureBootstrap: async () => {},
    sendTabMessage: async (_tabId, message) => {
      messages.push(message);
      if (message.action !== 'getMarkdown') return { success: true };
      const label = message.mode === 'full' ? 'FULL' : 'MAIN';
      return { success: true, markdown: `# ${label}`, title: `${label} title`, charCount: label.length + 2, warnings: [] };
    },
    registerFloatingContentScript: async () => {},
    disableFloatingEverywhere: async () => {},
  };

  for (const file of ['page2md-core.js', 'obsidian-utils.js', 'extension-utils.js', 'popup-state-utils.js']) {
    dom.window.eval(fs.readFileSync(file, 'utf8'));
  }
  dom.window.Page2MDExtension = extensionMock;
  dom.window.eval(fs.readFileSync('popup.js', 'utf8'));
  return { dom, messages, activeTab };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('popup never reuses a result after extraction settings change', async () => {
  const { dom, messages } = createPopup();
  await settle();

  dom.window.document.querySelector('#btnCopy').click();
  await settle();
  assert.equal(dom.window.document.querySelector('#previewContent').value, '# MAIN');

  dom.window.document.querySelector('[data-mode="full"]').click();
  await settle();
  dom.window.document.querySelector('#btnCopy').click();
  await settle();

  assert.equal(messages.filter((message) => message.action === 'getMarkdown').length, 2);
  assert.equal(dom.window.document.querySelector('#previewContent').value, '# FULL');
});

test('popup leaves native copy behavior available inside the editor', async () => {
  const { dom } = createPopup();
  await settle();
  const editor = dom.window.document.querySelector('#previewContent');
  editor.value = 'selected';
  const event = new dom.window.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
  editor.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
});

test('popup keeps advanced actions collapsed and closes them with Escape', async () => {
  const { dom } = createPopup();
  await settle();
  const details = dom.window.document.querySelector('#advancedActions');
  assert.equal(details.open, false);
  assert.equal(dom.window.document.body.getAttribute('aria-busy'), 'false');
  details.open = true;
  const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  dom.window.document.dispatchEvent(event);
  assert.equal(details.open, false);
  assert.equal(dom.window.document.activeElement.dataset.mode, 'main');
});

test('popup refreshes a cached result after the tab navigates', async () => {
  const { dom, messages, activeTab } = createPopup();
  await settle();

  dom.window.document.querySelector('#btnCopy').click();
  await settle();
  activeTab.url = 'https://example.com/other';
  dom.window.document.querySelector('#btnCopy').click();
  await settle();

  assert.equal(messages.filter((message) => message.action === 'getMarkdown').length, 2);
});
