const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function createPickWindow() {
  const dom = new JSDOM('<!doctype html><html><body><article>This article contains enough text to be a valid selectable region.</article></body></html>', {
    url: 'https://example.com/article',
    runScripts: 'outside-only',
  });
  dom.window.MarkClipExtractor = {
    cleanClone: (node) => node.cloneNode(true),
    markdownFromElement: async () => ({ markdown: '# page', title: 'page', charCount: 6, warnings: [] }),
    textLength: (node) => (node.textContent || '').trim().length,
  };
  dom.window.MarkClipPickSelection = {
    mergePickSelection: (items, target) => (items.includes(target) ? items : [...items, target]),
  };
  dom.window.eval(fs.readFileSync('content-pick.js', 'utf8'));
  return dom;
}

test('selection mode ignores clicks on the document body', async () => {
  const dom = createPickWindow();
  const pending = dom.window.MarkClipPick.startPickMode();
  const body = dom.window.document.body;
  const article = dom.window.document.querySelector('article');

  body.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true }));
  body.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.match(dom.window.document.getElementById('markclip-pick-tip').textContent, /点击页面区域可多选/);

  article.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true }));
  article.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

  const wrapper = await pending;
  assert.equal(wrapper.querySelectorAll('hr').length, 0);
  assert.equal(wrapper.firstElementChild.tagName, 'ARTICLE');
});
