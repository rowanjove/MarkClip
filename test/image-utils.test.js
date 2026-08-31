const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { inlineImages, isEmbeddableUrl, isSafeImageDataUrl } = require('../image-utils.js');

test('image helper only accepts HTTP(S) and data URLs', () => {
  assert.equal(isEmbeddableUrl('https://example.com/a.png'), true);
  assert.equal(isEmbeddableUrl('data:image/png;base64,AA=='), true);
  assert.equal(isEmbeddableUrl('javascript:alert(1)'), false);
  assert.equal(isSafeImageDataUrl('data:image/png;base64,AA=='), true);
  assert.equal(isSafeImageDataUrl('data:image/svg+xml,<svg></svg>'), false);
});

test('image helper inlines accessible images and reports failures', async () => {
  const dom = new JSDOM('<article><img id="ok" src="https://example.com/ok.png"><img id="bad" src="https://example.com/bad.png"></article>', { url: 'https://example.com/' });
  const blob = new dom.window.Blob(['png'], { type: 'image/png' });
  const result = await inlineImages(dom.window.document.querySelector('article'), {
    fetchImpl: async (url) => url.endsWith('ok.png')
      ? { ok: true, blob: async () => blob }
      : { ok: false, status: 404 },
  });

  assert.equal(result.stats.attempted, 2);
  assert.equal(result.stats.inlined, 1);
  assert.equal(result.stats.failed, 1);
  assert.match(dom.window.document.querySelector('#ok').src, /^data:image\/png;base64,/);
  assert.equal(dom.window.document.querySelector('#bad').getAttribute('src'), 'https://example.com/bad.png');
  assert.equal(result.warnings.length, 1);
});

test('image helper bounds slow requests and oversized responses', async () => {
  const dom = new JSDOM('<article><img id="slow" src="https://example.com/slow.png"><img id="large" src="https://example.com/large.png"></article>', { url: 'https://example.com/' });
  const largeBlob = new dom.window.Blob([new Uint8Array(20)], { type: 'image/png' });
  const result = await inlineImages(dom.window.document.querySelector('article'), {
    imageTimeoutMs: 5,
    maxImageBytes: 8,
    fetchImpl: async (url) => {
      if (url.endsWith('slow.png')) await new Promise((resolve) => setTimeout(resolve, 15));
      return { ok: true, blob: async () => largeBlob };
    },
  });

  assert.equal(result.stats.attempted, 2);
  assert.equal(result.stats.inlined, 0);
  assert.equal(result.stats.failed, 2);
  assert.equal(dom.window.document.querySelector('#slow').getAttribute('src'), 'https://example.com/slow.png');
  assert.equal(dom.window.document.querySelector('#large').getAttribute('src'), 'https://example.com/large.png');
  assert.equal(result.warnings.length, 1);
});
