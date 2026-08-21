const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const RUNTIME_FILES = [
  'page2md-core.js',
  'url-utils.js',
  'code-block-utils.js',
  'message-schema.js',
  'clip-contract.js',
  'template-utils.js',
  'site-rules.js',
  'math-utils.js',
  'image-utils.js',
  'lib/turndown.js',
  'lib/readability.js',
  'content-extractor.js',
];

function createWindowFromHtml(html) {
  const dom = new JSDOM(html, { url: 'https://example.com/docs/page.html', runScripts: 'outside-only' });
  dom.window.chrome = { runtime: { sendMessage: async () => ({ success: true }) } };
  for (const file of RUNTIME_FILES) dom.window.eval(fs.readFileSync(file, 'utf8'));
  return dom;
}

function createWindow(body) {
  return createWindowFromHtml(`<!doctype html><html><head><title>Fixture title</title></head><body>${body}</body></html>`);
}

function bodyWithoutFrontmatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n\n/, '').trim();
}

test('full extraction preserves page structure while normalizing links and code fences', async () => {
  const dom = createWindow(`
    <article>
      <header><h1>Page heading</h1></header>
      <p>This paragraph is intentionally long enough to represent useful page content in a deterministic integration fixture.</p>
      <pre><code class="language-js">  const value = 1;<br>${'```'} inside\n</code></pre>
      <a href="../guide">Guide</a>
      <a href="javascript:alert(1)">Unsafe</a>
    </article>
    <nav>Navigation should remain visible in the explicit full-page mode.</nav>
  `);

  const result = await dom.window.MarkClipExtractor.buildMarkdown({ mode: 'full' });
  assert.equal(result.title, 'Fixture title');
  assert.match(result.markdown, /Page heading/);
  assert.match(result.markdown, /Navigation should remain/);
  assert.match(result.markdown, /\[Guide\]\(https:\/\/example\.com\/guide\)/);
  assert.doesNotMatch(result.markdown, /javascript:/i);
  assert.match(result.markdown, /````js[\s\S]*``` inside[\s\S]*````/);
  assert.equal(result.diagnostics.mode, 'full');
  assert.ok(result.diagnostics.nodeCount > 0);
});

test('main extraction uses Readability and excludes navigation noise', async () => {
  const dom = createWindow(`
    <nav>Navigation noise that should not be exported.</nav>
    <article>
      <h1>Article heading</h1>
      <p>This is enough article text to pass the Readability threshold and verify that the main extraction path prefers article content over navigation chrome.</p>
      <p>A second paragraph keeps the fixture representative of a small article.</p>
    </article>
  `);

  const result = await dom.window.MarkClipExtractor.buildMarkdown({ mode: 'main' });
  assert.match(result.markdown, /Article heading/);
  assert.doesNotMatch(result.markdown, /Navigation noise/);
  assert.equal(result.source, 'Readability');
});

test('conversion emits task lists, strikethrough and basic GFM tables', async () => {
  const dom = createWindow(`
    <main>
      <ul><li><input type="checkbox" checked> Done</li><li><input type="checkbox"> Todo</li></ul>
      <p><del>old text</del></p>
      <table><tr><th>Name</th><th align="right">Value</th></tr><tr><td>A</td><td>1 | 2</td></tr></table>
    </main>
  `);

  const result = await dom.window.MarkClipExtractor.buildMarkdown({ mode: 'full' });
  assert.match(result.markdown, /- \[x\] Done/);
  assert.match(result.markdown, /- \[ \] Todo/);
  assert.match(result.markdown, /~~old text~~/);
  assert.match(result.markdown, /\| Name \| Value \|/);
  assert.match(result.markdown, /1 \\| 2/);
  assert.match(result.markdown, /\| --- \| ---: \|/);
});

test('fixture-backed full-page output stays stable', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/full-page.html'), 'utf8');
  const expected = fs.readFileSync(path.join(__dirname, 'fixtures/full-page.body.md'), 'utf8').trim();
  const dom = createWindowFromHtml(html);
  const result = await dom.window.MarkClipExtractor.buildMarkdown({ mode: 'full' });
  assert.equal(bodyWithoutFrontmatter(result.markdown), expected);
});

test('custom template composes the same extracted body without evaluating code', async () => {
  const dom = createWindow('<article><p>Template body</p></article>');
  const result = await dom.window.MarkClipExtractor.buildMarkdown({
    mode: 'full',
    template: 'TITLE={{title}}\nURL={{url}}\n\n{{content}}',
  });
  assert.match(result.markdown, /^TITLE=Fixture title\nURL=https:\/\/example\.com\/docs\/page\.html/);
  assert.match(result.markdown, /Template body/);
});

test('custom template receives author and site metadata', async () => {
  const dom = createWindowFromHtml('<!doctype html><html><head><title>Meta title</title><meta name="author" content="Ada"><body><article><p>Meta body</p></article></body></html>');
  const result = await dom.window.MarkClipExtractor.buildMarkdown({
    mode: 'full',
    template: '{{author}} @ {{site}}\n\n{{content}}',
  });
  assert.match(result.markdown, /^Ada @ example\.com/);
});

test('conversion preserves MathML and legacy MathJax TeX blocks', async () => {
  const dom = createWindow('<main><p><math><semantics><mrow>x</mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math></p><script type="math/tex; mode=display">y=mx+b</script></main>');
  const result = await dom.window.MarkClipExtractor.buildMarkdown({ mode: 'full' });
  assert.match(result.markdown, /\$x\^2\$/);
  assert.match(result.markdown, /\$\$\ny=mx\+b\n\$\$/);
});

test('selection extraction preserves only the selected DOM range', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/selection-page.html'), 'utf8');
  const dom = createWindowFromHtml(html);
  const selection = dom.window.getSelection();
  const range = dom.window.document.createRange();
  range.selectNodeContents(dom.window.document.querySelector('#selected'));
  selection.removeAllRanges();
  selection.addRange(range);

  const result = await dom.window.MarkClipExtractor.buildMarkdown({ mode: 'selection' });
  assert.match(result.markdown, /Selected text with \*\*formatting\*\*/);
  assert.doesNotMatch(result.markdown, /Other text/);
});

test('SPA navigation uses the current URL and exposes fallback diagnostics', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/spa-page.html'), 'utf8');
  const dom = createWindowFromHtml(html);
  dom.window.history.pushState({}, '', '/new-route');
  const result = await dom.window.MarkClipExtractor.buildMarkdown({ mode: 'main' });
  assert.match(result.markdown, /source: "https:\/\/example\.com\/new-route"/);
  assert.equal(result.source, '全页回退');
  assert.equal(result.warnings.length > 0, true);
});

test('large conversions honor a caller deadline', async () => {
  const paragraphs = Array.from({ length: 25 }, (_value, index) => `<p>Paragraph ${index}</p>`).join('');
  const dom = createWindow(`<article>${paragraphs}</article>`);
  await assert.rejects(
    () => dom.window.MarkClipExtractor.markdownFromElement(dom.window.document.querySelector('article'), { deadline: 0 }),
    /转换耗时过长/,
  );
});

test('large conversions honor an AbortSignal cancellation', async () => {
  const dom = createWindow('<article><p>Cancelable content.</p></article>');
  const controller = new dom.window.AbortController();
  controller.abort();
  await assert.rejects(
    () => dom.window.MarkClipExtractor.markdownFromElement(dom.window.document.querySelector('article'), { signal: controller.signal }),
    /转换已取消/,
  );
});

test('selection mode returns a clear error when the page has no active selection', async () => {
  const dom = createWindow('<article><p>No active selection.</p></article>');
  await assert.rejects(
    () => dom.window.MarkClipExtractor.buildMarkdown({ mode: 'selection' }),
    /没有检测到选区/,
  );
});

test('optional image localization embeds accessible images without changing the default', async () => {
  const dom = createWindow('<main><p>Image fixture content.</p><img src="https://example.com/pixel.png"></main>');
  const blob = new dom.window.Blob(['pixel'], { type: 'image/png' });
  dom.window.fetch = async () => ({ ok: true, blob: async () => blob });
  const result = await dom.window.MarkClipExtractor.buildMarkdown({ mode: 'full', localizeImages: true });
  assert.match(result.markdown, /data:image\/png;base64,/);
  assert.equal(result.diagnostics.images.inlined, 1);
});
