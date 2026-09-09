import TurndownService from 'turndown';
import type { CanonicalElement } from './types';
import type { ClipMetadata, RenderProfile } from '../../shared/contracts';

export interface RenderedDocument { markdown: string; metadata: ClipMetadata; }
export interface RenderOptions { preserveTables?: boolean; preserveCode?: boolean; preserveCallouts?: boolean; }

function yamlScalar(value: unknown): string { return JSON.stringify(String(value ?? '')); }

function createService(profile: RenderProfile, options: RenderOptions = {}): TurndownService {
  const preserveTables = options.preserveTables !== false;
  const preserveCode = options.preserveCode !== false;
  const preserveCallouts = options.preserveCallouts !== false;
  const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '_', strongDelimiter: '**' });
  service.addRule('removeUnsafeLinks', { filter: (node) => node.nodeName === 'A' && /^javascript:|^vbscript:/i.test(node.getAttribute('href') || ''), replacement: (content) => content });
  service.addRule('math', { filter: (node) => node.nodeType === 1 && node.hasAttribute('data-yezai-math'), replacement: (_content, node) => {
    const value = (node.textContent || '').trim();
    return node.getAttribute('data-yezai-math') === 'display' ? `\n\n$$\n${value}\n$$\n\n` : `$${value}$`;
  } });
  service.addRule('footnoteRef', { filter: (node) => node.nodeType === 1 && node.hasAttribute('data-yezai-footnote-ref'), replacement: (_content, node) => `[^${node.getAttribute('data-yezai-footnote-ref') || '1'}]` });
  service.addRule('footnotes', { filter: (node) => node.nodeType === 1 && node.hasAttribute('data-yezai-footnotes'), replacement: (_content, node) => [...node.querySelectorAll('[data-footnote-id]')].map((item) => `\n[^${item.getAttribute('data-footnote-id') || '1'}]: ${(item.textContent || '').trim()}`).join('\n') + '\n' });
  if (!preserveCode) service.addRule('plainCode', { filter: 'pre', replacement: (_content, node) => `\n${(node.textContent || '').trim()}\n` });
  if (preserveCode) service.addRule('codeLanguage', { filter: (node) => node.nodeName === 'PRE' && Boolean(node.querySelector('code')), replacement: (_content, node) => {
    const code = node.querySelector('code')!;
    const language = code.getAttribute('data-yezai-language') || '';
    const text = (code.textContent || '').replace(/\n$/, '');
    const longestTicks = Math.max(0, ...([...text.matchAll(/`+/g)].map((match) => match[0].length)));
    const fence = '`'.repeat(Math.max(3, longestTicks + 1));
    return `\n\n${fence}${language}\n${text}\n${fence}\n\n`;
  } });
  if (preserveCallouts && profile === 'gfm') service.addRule('gfmCallout', { filter: (node) => node.nodeType === 1 && node.hasAttribute('data-yezai-callout'), replacement: (content, node) => {
    const kind = (node.getAttribute('data-yezai-callout') || 'note').toLowerCase();
    const title = kind.charAt(0).toUpperCase() + kind.slice(1);
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    return `\n> **${title}**\n${lines.map((line) => `> ${line}`).join('\n')}\n`;
  } });
  if (preserveTables && profile !== 'commonmark') service.addRule('gfmTable', { filter: 'table', replacement: (_content, node) => {
    const rows: string[][] = [];
    const aligns: Array<'left' | 'center' | 'right' | undefined> = [];
    [...node.querySelectorAll('tr')].forEach((row, rowIndex) => {
      const target = rows[rowIndex] ||= [];
      let column = 0;
      [...row.children].forEach((cell) => {
        while (target[column] !== undefined) column += 1;
        const boundedSpan = (value: string | null): number => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 1 ? Math.min(100, Math.floor(parsed)) : 1; };
        const colSpan = boundedSpan(cell.getAttribute('colspan'));
        const rowSpan = boundedSpan(cell.getAttribute('rowspan'));
        if (rowIndex === 0) {
          const declared = (cell.getAttribute('align') || cell.getAttribute('style')?.match(/text-align\s*:\s*(left|center|right)/i)?.[1] || '').toLowerCase();
          if (declared === 'left' || declared === 'center' || declared === 'right') for (let c = 0; c < colSpan; c += 1) aligns[column + c] = declared;
        }
        const value = service.turndown(cell.innerHTML || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
        for (let r = 0; r < rowSpan; r += 1) { const destination = rows[rowIndex + r] ||= []; for (let c = 0; c < colSpan; c += 1) destination[column + c] = value; }
        column += colSpan;
      });
    });
    const width = Math.max(0, ...rows.map((row) => row.length));
    rows.forEach((row) => { while (row.length < width) row.push(''); for (let index = 0; index < row.length; index += 1) row[index] ??= ''; });
    if (!rows.length || width === 0) return `\n${node.outerHTML}\n`;
    const header = `| ${rows[0].join(' | ')} |`;
    const divider = `| ${rows[0].map((_value, index) => aligns[index] === 'right' ? '---:' : aligns[index] === 'center' ? ':---:' : aligns[index] === 'left' ? ':---' : '---').join(' | ')} |`;
    const body = rows.slice(1).map((row) => `| ${row.join(' | ')} |`).join('\n');
    return `\n${header}\n${divider}${body ? `\n${body}` : ''}\n`;
  } });
  if (preserveCallouts && profile === 'obsidian') service.addRule('obsidianCallout', { filter: (node) => node.nodeType === 1 && (node.hasAttribute('data-yezai-callout') || (node.nodeName === 'BLOCKQUOTE' && /data-callout|callout/i.test(node.getAttribute('class') || ''))), replacement: (content, node) => `\n> [!${node.getAttribute('data-yezai-callout') || 'note'}]\n${content.split('\n').filter(Boolean).map((line) => `> ${line}`).join('\n')}\n` });
  return service;
}

export function renderMarkdown(element: CanonicalElement | HTMLElement, metadata: ClipMetadata, profile: RenderProfile = 'gfm', options: RenderOptions = {}): RenderedDocument {
  const body = createService(profile, options).turndown(element as HTMLElement).trim();
  if (profile === 'commonmark') return { markdown: body, metadata };
  const frontmatter = ['---', `title: ${yamlScalar(metadata.title)}`, `source: ${yamlScalar(metadata.canonicalUrl || metadata.url)}`, `date: ${yamlScalar(metadata.capturedAt)}`, metadata.siteName ? `site: ${yamlScalar(metadata.siteName)}` : '', metadata.authors.length ? `authors: [${metadata.authors.map(yamlScalar).join(', ')}]` : '', '---'].filter(Boolean).join('\n');
  return { markdown: `${frontmatter}\n\n${body}`.trim(), metadata };
}
