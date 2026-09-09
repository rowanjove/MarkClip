import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { normalizeDomUrls, resolveSafeUrl, sanitizeHtml } from '../../src/core/standardize/url';
import { validateRecipe } from '../../src/core/recipes/schema';
import { recipeMatches } from '../../src/core/recipes/matcher';
import { collectDocumentMetadata } from '../../src/core/metadata/pipeline';
import { standardizeContent } from '../../src/core/standardize/content';
import { renderMarkdown } from '../../src/core/render/markdown';
import { createEmptyMetadata } from '../../src/shared/contracts';
import YAML from 'yaml';

describe('v1.5 standardizers', () => {
  it('resolves safe URLs and removes dangerous schemes', () => {
    expect(resolveSafeUrl('../a', 'https://example.com/docs/page')).toBe('https://example.com/a');
    expect(resolveSafeUrl('javascript:alert(1)', 'https://example.com')).toBe('');
    const dom = new JSDOM('<article><a href="../a">x</a><img src="//cdn.test/a.png"><a href="javascript:bad">bad</a></article>', { url: 'https://example.com/docs/page' });
    const root = dom.window.document.querySelector('article') as HTMLElement;
    sanitizeHtml(root, dom.window.location.href); normalizeDomUrls(root, dom.window.location.href);
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/a.png');
    expect(root.querySelectorAll('a')[1]?.getAttribute('href')).toBeNull();
    expect(resolveSafeUrl('data:image/svg+xml,<svg></svg>', 'https://example.com', 'image')).toBe('');
  });

  it('uses TeX annotations for MathML and recognizes GitHub alert blockquotes', () => {
    const dom = new JSDOM('<article><math><annotation encoding="application/x-tex">x^2</annotation><mi>x</mi></math><blockquote class="markdown-alert-warning">注意</blockquote></article>');
    const root = standardizeContent(dom.window.document.querySelector('article') as HTMLElement);
    const output = renderMarkdown(root, createEmptyMetadata('https://example.com'), 'gfm').markdown;
    expect(output).toContain('$x^2$');
    expect(output).toContain('**Warning**');
  });

  it('validates declarative recipes and matches host/path', () => {
    const recipe = validateRecipe({ id: 'github-repository', name: 'GitHub', version: 1, priority: 10, matches: [{ host: 'github.com', pathRegex: '^/[^/]+/[^/]+$' }], capture: { selector: 'article.markdown-body', fallback: 'smart' } });
    expect(recipe.ok).toBe(true);
    const bad = validateRecipe({ id: 'bad', name: 'Bad', version: 1, matches: [{ host: 'example.com' }], capture: { selector: '<script>' }, transform: { imageMode: 'remote' }, code: 'eval()' });
    expect(bad.ok).toBe(false);
    expect(validateRecipe({ id: 'bad-match', name: 'Bad match', version: 1, matches: [null], capture: { selector: 'article' } }).ok).toBe(false);
    const dom = new JSDOM('<article class="markdown-body">hello</article>', { url: 'https://github.com/a/b' });
    expect(recipe.ok && recipeMatches(recipe.recipe, dom.window.document, dom.window.location.href)).toBe(true);
  });

  it('parses the documented YAML Recipe shape before validation', () => {
    const parsed = YAML.parse('id: yaml-note\nname: YAML Note\nversion: 1\npriority: 5\nmatches:\n  - host: example.com\ncapture:\n  selector: article\n');
    const result = validateRecipe(parsed);
    expect(result.ok).toBe(true);
  });


  it('keeps canonical URL and metadata source precedence explicit', () => {
    const dom = new JSDOM('<head><title>Document</title><link rel="canonical" href="/canonical"><meta property="og:title" content="Open Graph"></head><body></body>', { url: 'https://example.com/article' });
    const result = collectDocumentMetadata(dom.window.document, dom.window.location.href);
    expect(result.metadata.canonicalUrl).toBe('https://example.com/canonical');
    expect(result.metadata.title).toBe('Open Graph');
    expect(result.sources.title).toBe('og');
  });

  it('drops unsafe canonical protocols', () => {
    const dom = new JSDOM('<head><link rel="canonical" href="javascript:alert(1)"></head><body></body>', { url: 'https://example.com/article' });
    expect(collectDocumentMetadata(dom.window.document, dom.window.location.href).metadata.canonicalUrl).toBe('https://example.com/article');
  });
});
