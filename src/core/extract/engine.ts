import Defuddle from 'defuddle';
import { Readability } from '@mozilla/readability';
import type { ClipDiagnostics, ClipMetadata, ClipRequest } from '../../shared/contracts';
import { createEmptyDiagnostics, createEmptyMetadata } from '../../shared/contracts';
import { YezhaiError } from '../../shared/errors';
import { collectDocumentMetadata, mergeMetadata, type MetadataCandidate } from '../metadata/pipeline';
import { recipeMatches } from '../recipes/matcher';
import type { RecipeDefinition } from '../recipes/schema';
import { sanitizeHtml, normalizeDomUrls } from '../standardize/url';

export interface ExtractedDocument {
  element: HTMLElement;
  metadata: ClipMetadata;
  diagnostics: ClipDiagnostics;
  transform?: RecipeDefinition['transform'];
  template?: RecipeDefinition['template'];
}

const MAIN_SELECTORS = ['article', 'main', '[role="main"]', '.markdown-body', '.post-content', '#content'];
const MAX_NODES = 250_000;
const MAX_TEXT = 2_000_000;

function cloneElement(element: Element, document: Document, baseUrl: string): HTMLElement {
  const wrapper = document.createElement('article');
  wrapper.append(document.importNode(element, true));
  sanitizeHtml(wrapper, baseUrl);
  normalizeDomUrls(wrapper, baseUrl);
  return wrapper;
}

function assertSize(document: Document): void {
  if (document.querySelectorAll('*').length > MAX_NODES) throw new YezhaiError('DOM_TOO_LARGE', '页面节点数量超过限制。', 'capture');
  if ((document.body?.textContent || '').length > MAX_TEXT) throw new YezhaiError('DOM_TOO_LARGE', '页面正文超过限制。', 'capture');
}

function contentLength(element: Element): number { return (element.textContent || '').trim().length; }

function fromRecipe(document: Document, recipe: RecipeDefinition, url: string, allowShort = false, guard: () => void = () => undefined): { element: HTMLElement; metadata: MetadataCandidate } | null {
  if (!recipeMatches(recipe, document, url) || !recipe.capture.selector) return null;
  try {
    const candidate = document.querySelector(recipe.capture.selector);
    if (!candidate || (!allowShort && contentLength(candidate) < 120)) return null;
    const element = cloneElement(candidate, document, url);
    for (const selector of recipe.exclude) {
      guard();
      try { element.querySelectorAll(selector).forEach((node) => node.remove()); } catch { /* invalid optional selector is ignored */ }
    }
    const values = recipe.metadata && typeof recipe.metadata === 'object' ? recipe.metadata as Record<string, unknown> : {};
    const readRecipeValue = (key: string): unknown => {
      const value = values[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const descriptor = value as Record<string, unknown>;
        if (typeof descriptor.value === 'string') return descriptor.value;
        if (typeof descriptor.selector === 'string') {
          const node = document.querySelector(descriptor.selector);
          if (!node) return undefined;
          return descriptor.attribute && typeof descriptor.attribute === 'string' ? node.getAttribute(descriptor.attribute) || undefined : node.textContent?.trim() || undefined;
        }
        if (Array.isArray(descriptor.values)) return descriptor.values;
      }
      return value;
    };
    const recipeTitle = readRecipeValue('title');
    const recipeDescription = readRecipeValue('description');
    const recipeSiteName = readRecipeValue('siteName');
    const recipeCanonical = readRecipeValue('canonicalUrl');
    const recipeAuthors = readRecipeValue('authors');
    const recipeTags = readRecipeValue('tags');
    let canonicalUrl: string | undefined;
    if (typeof recipeCanonical === 'string') {
      try {
        const parsed = new URL(recipeCanonical, url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') canonicalUrl = parsed.href;
      } catch { /* invalid recipe metadata is ignored */ }
    }
    const metadata: MetadataCandidate = {
      source: 'recipe',
      values: {
        title: typeof recipeTitle === 'string' ? recipeTitle : undefined,
        canonicalUrl,
        description: typeof recipeDescription === 'string' ? recipeDescription : undefined,
        siteName: typeof recipeSiteName === 'string' ? recipeSiteName : undefined,
        authors: Array.isArray(recipeAuthors) ? recipeAuthors.filter((item): item is string => typeof item === 'string') : typeof recipeAuthors === 'string' ? [recipeAuthors] : undefined,
        tags: Array.isArray(recipeTags) ? recipeTags.filter((item): item is string => typeof item === 'string') : undefined,
        extra: values,
      },
    };
    return { element, metadata };
  } catch (error) {
    // Budget/cancellation guards are control-flow signals, not optional
    // recipe failures. Let them abort the pipeline instead of silently
    // falling through to another extractor after the deadline.
    if (error instanceof YezhaiError) throw error;
    return null;
  }
}

function prepareDefuddleDocument(doc: Document): Document {
  const clone = doc.cloneNode(true) as Document;
  try {
    clone.querySelector(':not(:has(source))');
  } catch {
    const proto = Object.getPrototypeOf(clone) as { querySelectorAll?: (sel: string) => NodeList; __yezaiHasGuarded__?: boolean };
    if (proto && typeof proto.querySelectorAll === 'function' && !proto.__yezaiHasGuarded__) {
      const origQSA = proto.querySelectorAll;
      proto.querySelectorAll = function (sel: string) {
        try {
          return origQSA.call(this, sel);
        } catch (error) {
          if (typeof sel === 'string' && sel.includes(':has(')) {
            return origQSA.call(this, 'non-existent-tag');
          }
          throw error;
        }
      };
      proto.__yezaiHasGuarded__ = true;
    }
  }
  return clone;
}

function fromDefuddle(document: Document, url: string): { element: HTMLElement; metadata: MetadataCandidate; selector?: string; removals: ClipDiagnostics['removals'] } | null {
  // Defuddle may normalize/remove nodes while parsing. Always give it a clone
  // so the live page remains intact for retries, selection capture and SPA UI.
  let response: ReturnType<Defuddle['parse']>;
  const originalLog = console.log;
  const isDebug = Boolean((globalThis as { __YEZAI_DEBUG__?: boolean }).__YEZAI_DEBUG__);
  try {
    const docClone = prepareDefuddleDocument(document);
    if (!isDebug) {
      console.log = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].startsWith('Defuddle:')) return;
        originalLog.apply(console, args);
      };
    }
    response = new Defuddle(docClone, { url, debug: true, useAsync: false, standardize: true, markdown: false }).parse();
  } catch {
    // A malformed page must not make Smart extraction terminal. Readability,
    // semantic candidates and body fallback remain viable recovery paths.
    return null;
  } finally {
    console.log = originalLog;
  }
  if (!response.content || response.content.trim().length < 120) return null;
  const parsed = document.createElement('article');
  parsed.innerHTML = response.content;
  sanitizeHtml(parsed, url);
  return {
    element: parsed,
    metadata: { source: 'defuddle', values: { title: response.title || undefined, description: response.description || undefined, siteName: response.site || undefined, authors: response.author ? [response.author] : [], publishedAt: response.published || undefined, heroImage: response.image || undefined, favicon: response.favicon || undefined, language: response.language || undefined, wordCount: response.wordCount, schemaOrg: response.schemaOrgData } },
    selector: response.debug?.contentSelector,
    removals: (response.debug?.removals || []).map((item) => ({ selector: item.selector, reason: item.reason || item.step })),
  };
}

function fromReadability(document: Document, url: string): { element: HTMLElement; metadata: MetadataCandidate; selector?: string } | null {
  let article: ReturnType<Readability['parse']>;
  try {
    article = new Readability(document.cloneNode(true) as Document, { keepClasses: true }).parse();
  } catch {
    return null;
  }
  if (!article?.content || article.content.trim().length < 120) return null;
  const parsed = document.createElement('article');
  parsed.innerHTML = article.content;
  sanitizeHtml(parsed, url);
  return { element: parsed, metadata: { source: 'readability', values: { title: article.title || undefined, description: article.excerpt || undefined, authors: article.byline ? [article.byline] : [] } } };
}

function fromSemantic(document: Document, url: string): HTMLElement | null {
  const candidate = MAIN_SELECTORS.map((selector) => document.querySelector(selector)).filter(Boolean).sort((a, b) => contentLength(b!) - contentLength(a!))[0];
  return candidate && contentLength(candidate) >= 120 ? cloneElement(candidate, document, url) : null;
}

function fromBody(document: Document, url: string): HTMLElement {
  return cloneElement(document.body || document.documentElement, document, url);
}

function fromSelection(document: Document, url: string): HTMLElement | null {
  const selection = document.getSelection?.();
  if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) return null;
  const wrapper = document.createElement('article');
  for (let index = 0; index < selection.rangeCount; index += 1) wrapper.append(selection.getRangeAt(index).cloneContents());
  sanitizeHtml(wrapper, url); normalizeDomUrls(wrapper, url);
  return contentLength(wrapper) ? wrapper : null;
}

export function extractDocument(document: Document, request: ClipRequest, recipes: RecipeDefinition[] = [], rootOverride?: HTMLElement, budget: { deadlineAt?: number; signal?: AbortSignal } = {}): ExtractedDocument {
  const started = performance.now();
  const guard = (): void => { if (budget.signal?.aborted) throw new YezhaiError('CANCELLED', '转换已取消。', 'capture'); if (budget.deadlineAt && performance.now() > budget.deadlineAt) throw new YezhaiError('EXTRACT_TIMEOUT', '页面转换超时，请缩小范围后重试。', 'extract', { retryable: true }); };
  const url = request.url || document.location?.href || '';
  guard();
  assertSize(document);
  guard();
  const diagnostics = createEmptyDiagnostics();
  diagnostics.originalNodeCount = document.querySelectorAll('*').length;
  diagnostics.originalTextLength = (document.body?.textContent || '').length;
  const baseMetadata = collectDocumentMetadata(document, url);
  guard();
  const selectedRecipe = request.recipeId ? recipes.find((item) => item.id === request.recipeId) : recipes.filter((item) => item.priority >= 0).sort((a, b) => b.priority - a.priority).find((item) => recipeMatches(item, document, url));
  let element: HTMLElement | null = null;
  let candidateMetadata: MetadataCandidate | undefined;
  if (rootOverride) {
    element = cloneElement(rootOverride, document, url);
    diagnostics.extractor = 'pick'; diagnostics.fallbackChain.push('pick');
  } else if (request.mode === 'selection') {
    guard();
    element = fromSelection(document, url);
    diagnostics.extractor = 'selection'; diagnostics.fallbackChain.push('selection');
    if (!element) throw new YezhaiError('EXTRACT_EMPTY', '没有选中可保存的内容，请先选择页面文字。', 'extract');
  } else if (request.mode === 'full') {
    guard();
    element = fromBody(document, url);
    diagnostics.extractor = 'full'; diagnostics.fallbackChain.push('body');
  } else if (selectedRecipe && request.extractionProfile !== 'defuddle' && request.extractionProfile !== 'readability') {
    guard();
    const recipeResult = fromRecipe(document, selectedRecipe, url, Boolean(request.recipeId), guard);
    if (recipeResult) { diagnostics.recipeMatched = true; diagnostics.recipeId = selectedRecipe.id; diagnostics.extractor = 'recipe'; diagnostics.sourceSelector = selectedRecipe.capture.selector; diagnostics.fallbackChain.push('recipe'); candidateMetadata = recipeResult.metadata; element = recipeResult.element; }
    else diagnostics.warnings.push(`Recipe「${selectedRecipe.name}」未找到正文，已回退。`);
  }
  const recipeFallback = request.extractionProfile === 'recipe' ? selectedRecipe?.capture.fallback : undefined;
  if (!element && (['smart', 'defuddle'].includes(request.extractionProfile) || ['smart', 'defuddle'].includes(recipeFallback || ''))) {
    guard();
    diagnostics.fallbackChain.push('defuddle');
    const result = fromDefuddle(document, url);
    guard();
    if (result) { element = result.element; candidateMetadata = result.metadata; diagnostics.extractor = 'defuddle'; diagnostics.sourceSelector = result.selector; diagnostics.removals = result.removals; }
  }
  if (!element && (['smart', 'readability'].includes(request.extractionProfile) || recipeFallback === 'smart' || recipeFallback === 'readability')) {
    guard();
    diagnostics.fallbackChain.push('readability');
    const result = fromReadability(document, url);
    guard();
    if (result) { element = result.element; candidateMetadata = result.metadata; diagnostics.extractor = 'readability'; diagnostics.sourceSelector = result.selector; }
  }
  if (!element && (['smart', 'semantic'].includes(request.extractionProfile) || recipeFallback === 'smart' || recipeFallback === 'semantic')) {
    guard();
    diagnostics.fallbackChain.push('semantic');
    element = fromSemantic(document, url);
    guard();
    if (element) diagnostics.extractor = 'semantic';
  }
  if (!element) { diagnostics.fallbackChain.push('body'); element = fromBody(document, url); diagnostics.extractor = 'body'; }
  guard();
  if (!element || contentLength(element) < 1) throw new YezhaiError('EXTRACT_EMPTY', '没有找到正文。', 'extract');
  const merged = candidateMetadata ? mergeMetadata(baseMetadata.metadata, candidateMetadata) : { metadata: baseMetadata.metadata, sources: baseMetadata.sources };
  diagnostics.extractedNodeCount = element.querySelectorAll('*').length;
  diagnostics.extractedTextLength = contentLength(element);
  const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
  const latinWords = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const cjkChars = (text.match(/[\u3400-\u9fff]/g) || []).length;
  merged.metadata.wordCount = Math.max(latinWords, cjkChars);
  merged.metadata.readingTimeMinutes = Math.max(1, Math.ceil(merged.metadata.wordCount / 220));
  diagnostics.metadataSources = { ...baseMetadata.sources, ...merged.sources };
  diagnostics.timings.totalMs = Math.round(performance.now() - started);
  const matchedDefinition = diagnostics.recipeMatched ? selectedRecipe : undefined;
  return { element, metadata: merged.metadata, diagnostics, transform: matchedDefinition?.transform, template: matchedDefinition?.template };
}

export function metadataForDocument(document: Document, url?: string): ClipMetadata {
  return collectDocumentMetadata(document, url).metadata;
}
