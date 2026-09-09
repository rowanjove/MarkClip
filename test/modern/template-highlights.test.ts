import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderTemplate } from '../../src/core/template/engine';
import { captureSelection, createHighlightSession, renderHighlights } from '../../src/core/highlights';
import { applyPostProcessors } from '../../src/core/postprocess';

describe('v1.5 templates and highlights', () => {
  it('supports chained filters and context-aware defaults', () => {
    const output = renderTemplate('{{ canonicalUrl | default: url | lower }}\n{{ title | slug }}', { title: 'Hello, World!', url: 'https://EXAMPLE.com/A', authors: [], tags: [], capturedAt: new Date(0).toISOString(), extra: {}, content: 'body' });
    expect(output).toContain('https://example.com/a');
    expect(output).toContain('hello-world');
  });

  it('supports bounded conditionals, loops and safe filters', () => {
    const output = renderTemplate('{% if tags %}{{ title | upper }}\n{% if authors.size > 0 %}authors{% endif %}{% for tag in tags %}- {{ tag | yaml }}\n{% endfor %}{% endif %}{{ content }}', { title: 'Note', url: 'https://example.com', authors: [], tags: ['one', 'two'], capturedAt: new Date(0).toISOString(), extra: {}, content: 'body' });
    expect(output).toContain('NOTE'); expect(output).toContain('- "one"'); expect(output).toContain('body');
    expect(() => renderTemplate('{{ constructor }}', { title: 'x', url: '', authors: [], tags: [], capturedAt: '', extra: {}, content: '' })).toThrow();
  });

  it('supports nested blocks and rejects unmatched closing tags', () => {
    const context = { title: 'Note', url: '', authors: ['Ada'], tags: ['one'], capturedAt: '', extra: {}, content: 'body' };
    expect(renderTemplate('{% if authors %}{% for author in authors %}{% if author %}{{ author }}{% endif %}{% endfor %}{% endif %}', context)).toBe('Ada');
    expect(() => renderTemplate('{% if title %}broken', context)).toThrow();
  });

  it('captures and renders multiple selections in order', () => {
    const dom = new JSDOM('<article>first <span>second</span> third</article>', { url: 'https://example.com' });
    const session = createHighlightSession(); const document = dom.window.document;
    const text = document.querySelector('span')?.firstChild; const range = document.createRange(); range.selectNodeContents(text!); const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    expect(captureSelection(session, document, 'note')?.text).toBe('second');
    expect(renderHighlights(session, 'Demo')).toContain('备注：note');
  });

  it('applies only deterministic post processors', () => {
    const clip = { id: '1', markdown: ' a  \n\n\n\n b  ', metadata: { title: 'x', url: '', authors: [], tags: [], capturedAt: '', extra: {} }, assets: [], warnings: [], diagnostics: {} } as any;
    expect(applyPostProcessors(clip, ['strip-trailing-space', 'collapse-blank-lines', 'trim']).markdown).toBe('a\n\n\n b');
    expect(() => applyPostProcessors(clip, ['eval'])).toThrow();
  });
});
