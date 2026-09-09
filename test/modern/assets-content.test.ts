import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { standardizeContent } from '../../src/core/standardize/content';
import { sanitizeHtml } from '../../src/core/standardize/url';
import { renderMarkdown } from '../../src/core/render/markdown';
import { createEmptyMetadata } from '../../src/shared/contracts';
import { createArchive, createBatchArchive, downloadAssets, embedImages } from '../../src/core/assets/pipeline';
import { buildClip } from '../../src/core/pipeline';
import { unzipSync, strFromU8 } from 'fflate';

describe('v1.5 content and asset pipeline', () => {
  it('normalizes code, math, callouts and footnotes before rendering', () => {
    const dom = new JSDOM('<article><pre><code class="language-ts"><span class="line-number">1</span>const x = 1;</code></pre><p class="math-inline">x^2</p><aside class="warning">注意内容</aside><p>正文<a href="#fn1">1</a></p><p id="fn1">脚注内容 ↩</p></article>');
    const root = standardizeContent(dom.window.document.querySelector('article') as HTMLElement);
    const output = renderMarkdown(root, createEmptyMetadata('https://example.com'), 'gfm').markdown;
    expect(output).toContain('```ts');
    expect(output).toContain('$x^2$');
    expect(output).toContain('**Warning**');
    expect(output).toContain('[^1]');
    expect(output).toContain('[^1]: 脚注内容');
  });

  it('keeps legacy TeX script blocks as inert math markers', () => {
    const dom = new JSDOM('<article><p>before</p><script type="math/tex; mode=display">y=mx+b</script><p>after</p></article>');
    const root = dom.window.document.querySelector('article') as HTMLElement;
    sanitizeHtml(root, 'https://example.com');
    standardizeContent(root);
    expect(root.querySelector('[data-yezai-math="display"]')?.textContent).toBe('y=mx+b');
    expect(root.querySelectorAll('script')).toHaveLength(0);
  });

  it('removes empty headings and closes accidental level gaps', () => {
    const dom = new JSDOM('<article><h1>Page</h1><h4>Section</h4><h1>Another</h1><h3> </h3></article>', { url: 'https://example.com' });
    const root = standardizeContent(dom.window.document.querySelector('article') as HTMLElement, 'Page');
    expect(root.querySelector('h1')?.textContent).toBe('Another');
    expect(root.querySelector('h2')?.textContent).toBe('Page');
    expect(root.querySelectorAll('h2')[1]?.textContent).toBe('Section');
    expect(root.querySelectorAll('h3')).toHaveLength(0);
  });

  it('normalizes headings in detached extraction roots', () => {
    const dom = new JSDOM('', { url: 'https://example.com' });
    const root = dom.window.document.createElement('article');
    root.innerHTML = '<h2>Section</h2><h5>Detail</h5>';
    standardizeContent(root);
    expect(root.querySelector('h3')?.textContent).toBe('Detail');
  });

  it('preserves inline table markup and chooses a safe code fence', () => {
    const dom = new JSDOM('<article><pre><code>const x = ````;</code></pre><table><tr><th>Name</th><th align="right">Count</th></tr><tr><td><code>x</code> | <a href="https://example.com">link</a></td><td>1</td></tr></table></article>');
    const root = standardizeContent(dom.window.document.querySelector('article') as HTMLElement);
    const output = renderMarkdown(root, createEmptyMetadata('https://example.com'), 'gfm').markdown;
    expect(output).toContain('`````');
    expect(output).toContain('`x`');
    expect(output).toContain('[link](https://example.com)');
    expect(output).toContain('---:');
  });

  it('bounds hostile table spans and keeps CommonMark free of frontmatter/GFM rules', () => {
    const dom = new JSDOM('<article><table><tr><th rowspan="Infinity">Name</th></tr><tr><td>x</td></tr></table></article>');
    const root = dom.window.document.querySelector('article') as HTMLElement;
    const commonmark = renderMarkdown(root, createEmptyMetadata('https://example.com'), 'commonmark').markdown;
    expect(commonmark).not.toContain('title:');
    expect(commonmark).not.toContain('| Name |');
    expect(commonmark.length).toBeLessThan(10_000);
  });

  it('deduplicates assets and creates a self-contained ZIP', async () => {
    const dom = new JSDOM('<article><img src="https://cdn.test/a.png"><img src="https://cdn.test/a.png"></article>');
    const responseBody = new Uint8Array([1, 2, 3]);
    const result = await downloadAssets(dom.window.document.querySelector('article')!, { fetchImpl: (async () => new Response(responseBody, { headers: { 'content-type': 'image/png' } })) as typeof fetch });
    expect(result.assets).toHaveLength(1);
    expect(dom.window.document.querySelectorAll('img')[1].getAttribute('src')).toContain('assets/');
    const metadata = { ...createEmptyMetadata('https://example.com'), extra: { apiKey: 'secret' } };
    const archive = await createArchive({ markdown: '# demo', metadata, diagnostics: {}, assets: result.assets });
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(strFromU8(files['article.md'])).toBe('# demo');
    expect(Object.keys(files)).toContain('metadata.json');
    expect(Object.keys(files).some((name) => name.startsWith('assets/'))).toBe(true);
    expect(strFromU8(files['metadata.json'])).not.toContain('secret');
  });

  it('contains archive asset names within the assets directory', async () => {
    const archive = await createArchive({ markdown: '', metadata: {}, diagnostics: {}, assets: [{ id: 'x', kind: 'image', fileName: '../escape.png', data: new Blob([new Uint8Array([1])]), status: 'ready' }] });
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files).some((name) => name.includes('..') || !name.startsWith('assets/') && name.endsWith('.png'))).toBe(false);
    expect(Object.keys(files).some((name) => name.startsWith('assets/'))).toBe(true);
  });

  it('sanitizes executable navigation from opt-in snapshots', async () => {
    const dom = new JSDOM('<article><a href="javascript:alert(1)">link</a><img src="data:image/svg+xml,<svg><script>alert(1)</script></svg>"><script>alert(1)</script></article>', { url: 'https://example.com' });
    const previous = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    try {
      const result = await buildClip({ mode: 'full', extractionProfile: 'semantic', includeSnapshot: true, url: dom.window.location.href });
      const snapshot = await result.snapshot!.data!.text();
      expect(snapshot).not.toContain('javascript:');
      expect(snapshot).not.toContain('data:image/svg+xml');
      expect(snapshot).not.toContain('<script');
    } finally { Object.defineProperty(globalThis, 'document', { configurable: true, value: previous }); }
  });

  it('does not turn a title into a parent-directory ZIP path', async () => {
    const archive = await createBatchArchive([{ id: '1', markdown: '', metadata: { title: '..' }, diagnostics: {} }]);
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files).some((name) => name.startsWith('../') || name.includes('/../'))).toBe(false);
  });

  it('keeps batch asset bytes under each article directory', async () => {
    const archive = await createBatchArchive([{ id: '1', markdown: '# page', metadata: { title: 'Page' }, diagnostics: {}, assets: [{ id: 'a', kind: 'image', fileName: '../hero.png', data: new Blob([new Uint8Array([7, 8])]), status: 'ready' }] }]);
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files)).toContain('Page/assets/__hero.png');
    expect([...files['Page/assets/__hero.png']]).toEqual([7, 8]);
  });

  it('includes a requested snapshot in each batch archive directory', async () => {
    const archive = await createBatchArchive([{ id: '1', markdown: '# page', metadata: { title: 'Page' }, diagnostics: {}, snapshot: { id: 's', kind: 'snapshot', fileName: 'original.html', data: new Blob(['<html></html>']), status: 'ready' } }]);
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files)).toContain('Page/original.html');
  });

  it('does not charge duplicate bytes twice and rejects non-image payloads', async () => {
    const dom = new JSDOM('<article><img src="https://cdn.test/a.png"><img src="https://cdn.test/b.png"></article>');
    const result = await downloadAssets(dom.window.document.querySelector('article')!, {
      maxTotalBytes: 3,
      fetchImpl: (async (input) => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': String(input).endsWith('b.png') ? 'text/html' : 'image/png' } })) as typeof fetch,
    });
    expect(result.assets).toHaveLength(1);
    expect(result.imageStats.failed).toBe(1);
  });

  it('does not embed remote SVG as executable data', async () => {
    const dom = new JSDOM('<article><img src="https://cdn.test/icon.svg"></article>');
    const result = await embedImages(dom.window.document.querySelector('article')!, {
      fetchImpl: (async () => new Response('<svg><script>alert(1)</script></svg>', { headers: { 'content-type': 'image/svg+xml' } })) as typeof fetch,
    });
    expect(result.imageStats.failed).toBe(1);
    expect(dom.window.document.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/icon.svg');
  });

  it('aborts a response body that stalls after headers', async () => {
    const dom = new JSDOM('<article><img src="https://cdn.test/stall.png"></article>');
    const result = await downloadAssets(dom.window.document.querySelector('article')!, { timeoutMs: 10, fetchImpl: (async () => new Response(new ReadableStream({ start() { /* intentionally never close */ } }), { headers: { 'content-type': 'image/png' } })) as typeof fetch });
    expect(result.assets).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('超时');
  });
});
