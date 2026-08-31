const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { isSafeUrl, isSafeRasterDataUrl, normalizeDomUrls, resolveUrl } = require('../url-utils.js');

test('resolveUrl converts relative links and preserves fragments', () => {
  assert.equal(resolveUrl('../guide', 'https://example.com/docs/page.html'), 'https://example.com/guide');
  assert.equal(resolveUrl('#intro', 'https://example.com/docs/page.html'), '#intro');
  assert.equal(resolveUrl('javascript:alert(1)', 'https://example.com/'), '');
  assert.equal(isSafeUrl('mailto:team@example.com'), true);
  assert.equal(isSafeUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeRasterDataUrl('data:image/png;base64,AA=='), true);
  assert.equal(isSafeUrl('data:image/svg+xml,<svg></svg>', 'image'), false);
});

test('normalizeDomUrls resolves href, src, srcset and lazy image attributes', () => {
  const dom = new JSDOM(
    '<article><a href="../guide">Guide</a><img src="/placeholder.gif" data-src="/img/a.png" srcset="/img/a.png 1x, img/b.png 2x"><a href="javascript:alert(1)">Bad</a></article>',
    { url: 'https://example.com/docs/page.html' },
  );
  normalizeDomUrls(dom.window.document.querySelector('article'), dom.window.document.baseURI);

  const article = dom.window.document.querySelector('article');
  assert.equal(article.querySelector('a').href, 'https://example.com/guide');
  assert.equal(article.querySelector('img').getAttribute('src'), 'https://example.com/docs/img/b.png');
  assert.equal(article.querySelector('img').getAttribute('srcset'), 'https://example.com/img/a.png 1x, https://example.com/docs/img/b.png 2x');
  assert.equal(article.querySelectorAll('a')[1].hasAttribute('href'), false);
});
