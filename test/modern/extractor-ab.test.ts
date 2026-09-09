import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createClipRequest } from '../../src/shared/contracts';
import { extractDocument } from '../../src/core/extract/engine';

describe('extractor A/B fixture harness', () => {
  it('compares smart, readability and semantic coverage on one fixture', () => {
    const dom = new JSDOM(`<html><head><title>Fixture</title></head><body><nav>noise</nav><article><h1>Fixture</h1><p>${'A sufficiently long paragraph for extraction regression. '.repeat(12)}</p></article></body></html>`, { url: 'https://example.com/article' });
    const outputs = ['smart', 'readability', 'semantic'].map((profile) => extractDocument(dom.window.document, createClipRequest({ extractionProfile: profile as 'smart' | 'readability' | 'semantic', url: dom.window.location.href })));
    expect(outputs.every((item) => item.diagnostics.extractedTextLength > 120)).toBe(true);
    expect(outputs.map((item) => item.diagnostics.extractor)).toEqual(expect.arrayContaining(['defuddle', 'readability', 'semantic']));
  });

  it('honors a recipe fallback when its selector is absent', () => {
    const dom = new JSDOM(`<html><head><title>Fallback</title></head><body><article><p>${'A sufficiently long fallback article body. '.repeat(12)}</p></article></body></html>`, { url: 'https://example.com/article' });
    const recipe = { id: 'fallback', name: 'Fallback', version: 1 as const, priority: 10, matches: [{ host: 'example.com' }], capture: { selector: '.missing', fallback: 'semantic' as const }, exclude: [], metadata: {}, transform: { preserveTables: true, preserveCode: true, preserveCallouts: true, imageMode: 'remote' as const } };
    const output = extractDocument(dom.window.document, createClipRequest({ extractionProfile: 'recipe', recipeId: 'fallback', url: dom.window.location.href }), [recipe]);
    expect(output.diagnostics.fallbackChain).toContain('semantic');
    expect(output.diagnostics.warnings[0]).toContain('未找到正文');
  });

  it('applies an explicit recipe to short content and exposes its transform/template', () => {
    const dom = new JSDOM('<html><head><title>Short</title></head><body><article class="note"><p>short</p></article></body></html>', { url: 'https://example.com/short' });
    const recipe = { id: 'short', name: 'Short', version: 1 as const, priority: 10, matches: [{ host: 'example.com' }], capture: { selector: 'article.note', fallback: 'body' as const }, exclude: [], metadata: {}, transform: { preserveTables: false, preserveCode: false, preserveCallouts: false, imageMode: 'remove' as const }, template: { inline: '# {{ title }}\n{{ content }}' } };
    const output = extractDocument(dom.window.document, createClipRequest({ extractionProfile: 'recipe', recipeId: 'short', url: dom.window.location.href }), [recipe]);
    expect(output.diagnostics.recipeMatched).toBe(true);
    expect(output.transform?.imageMode).toBe('remove');
    expect(output.template?.inline).toContain('{{ title }}');
  });
});
