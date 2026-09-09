import type { ClipResult, ClipRequest, ClipAsset } from '../shared/contracts';
import { createEmptyDiagnostics, createClipRequest } from '../shared/contracts';
import { YezhaiError } from '../shared/errors';
import { extractDocument } from './extract/engine';
import { renderMarkdown } from './render/markdown';
import type { RenderOptions } from './render/markdown';
import { renderTemplate, type TemplateContext } from './template/engine';
import { downloadAssets, embedImages } from './assets/pipeline';
import type { AssetPipelineOptions } from './assets/pipeline';
import { validateRecipe, type RecipeDefinition } from './recipes/schema';
import { standardizeContent } from './standardize/content';
import { applyPostProcessors } from './postprocess';

export interface PipelineOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (event: { stage: string; completed?: number; total?: number }) => void;
  recipes?: RecipeDefinition[];
  template?: string;
  templates?: Array<{ id?: string; body?: string }>;
  assetOptions?: AssetPipelineOptions;
  rootOverride?: HTMLElement;
}

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new YezhaiError('CANCELLED', '转换已取消。', 'capture');
}

function removeTrackingPixels(root: ParentNode): void {
  root.querySelectorAll?.('img').forEach((node) => {
    const image = node as HTMLImageElement;
    const width = Number(image.getAttribute('width') || image.width);
    const height = Number(image.getAttribute('height') || image.height);
    if (width === 1 || height === 1 || image.getAttribute('aria-hidden') === 'true') image.closest('figure')?.remove() ?? image.remove();
  });
}

function applyRecipeTransform(root: HTMLElement, transform?: RecipeDefinition['transform']): void {
  if (!transform) return;
  if (transform.preserveCode === false) root.querySelectorAll('pre').forEach((node) => { const text = node.textContent || ''; node.replaceWith(root.ownerDocument!.createTextNode(text)); });
  if (transform.preserveCallouts === false) root.querySelectorAll('[data-yezai-callout]').forEach((node) => node.removeAttribute('data-yezai-callout'));
  if (transform.preserveTables === false) root.querySelectorAll('table').forEach((node) => { const text = node.textContent || ''; node.replaceWith(root.ownerDocument!.createTextNode(text)); });
}

function snapshotDocument(document: Document): ClipAsset {
  const clone = document.cloneNode(true) as Document;
  // Snapshots are opt-in and still must not carry executable page content or
  // event-handler attributes into an archive.
  clone.querySelectorAll('script,style,noscript,iframe,object,embed,form,base,video,audio,source,track,svg,canvas,link,meta[http-equiv]').forEach((node) => node.remove());
  clone.querySelectorAll('*').forEach((element) => [...element.attributes].forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    if (/^on/i.test(name) || name === 'srcdoc' || name === 'style' || ['src', 'srcset', 'data', 'poster', 'background'].includes(name) || ((name === 'href' || name === 'src') && /^(?:javascript|vbscript):|^data:(?:text\/html|image\/svg\+xml)(?:,|;)/i.test(attribute.value.trim()))) element.removeAttribute(attribute.name);
  }));
  clone.querySelectorAll('img').forEach((node) => { node.removeAttribute('src'); node.removeAttribute('srcset'); });
  const html = `<!doctype html>\n${clone.documentElement?.outerHTML || ''}`;
  const data = new Blob([html], { type: 'text/html;charset=utf-8' });
  if (data.size > MAX_SNAPSHOT_BYTES) throw new YezhaiError('SNAPSHOT_TOO_LARGE', '原始页面快照超过大小限制。', 'capture');
  return { id: crypto.randomUUID(), kind: 'snapshot', fileName: 'original.html', mimeType: 'text/html', size: data.size, data, status: 'ready' };
}

export async function buildClip(input: Partial<ClipRequest> = {}, options: PipelineOptions = {}): Promise<ClipResult> {
  const request = createClipRequest(input);
  const started = performance.now();
  const deadline = started + Math.max(1_000, options.timeoutMs ?? 15_000);
  const checkDeadline = (): void => { if (performance.now() > deadline) throw new YezhaiError('EXTRACT_TIMEOUT', '页面转换超时，请缩小范围后重试。', 'extract', { retryable: true }); };
  checkSignal(options.signal);
  checkDeadline();
  options.onProgress?.({ stage: 'capture' });
  const recipes = options.recipes ?? [];
  const extractStarted = performance.now();
  const extraction = extractDocument(document, request, recipes, options.rootOverride, { deadlineAt: deadline, signal: options.signal });
  checkSignal(options.signal);
  checkDeadline();
  extraction.diagnostics.timings.extractMs = Math.round(performance.now() - extractStarted);
  options.onProgress?.({ stage: 'extract' });
  const diagnostics = extraction.diagnostics;
  const assets: ClipAsset[] = [];
  let warnings = [...diagnostics.warnings];
  const recipeTransform = extraction.transform;
  const imageMode = request.imageMode === 'remote' && recipeTransform?.imageMode ? recipeTransform.imageMode : request.imageMode;
  applyRecipeTransform(extraction.element, recipeTransform);
  removeTrackingPixels(extraction.element);
  await Promise.resolve();
  checkSignal(options.signal);
  checkDeadline();
  if (imageMode === 'assets') {
    const result = await downloadAssets(extraction.element, { ...options.assetOptions, signal: options.signal });
    assets.push(...result.assets); warnings.push(...result.warnings);
    diagnostics.imageStats = { attempted: result.imageStats.attempted, success: result.imageStats.success, failed: result.imageStats.failed, skipped: result.imageStats.skipped };
    options.onProgress?.({ stage: 'assets', completed: result.imageStats.success, total: result.imageStats.attempted });
  } else if (imageMode === 'remove') {
    extraction.element.querySelectorAll('img').forEach((node) => node.closest('figure')?.remove() ?? node.remove());
  } else if (imageMode === 'embed') {
    const result = await embedImages(extraction.element, { ...options.assetOptions, signal: options.signal });
    warnings.push(...result.warnings);
    diagnostics.imageStats = result.imageStats;
    options.onProgress?.({ stage: 'assets', completed: result.imageStats.success, total: result.imageStats.attempted });
  }
  checkSignal(options.signal);
  checkDeadline();
  const standardizeStarted = performance.now();
  standardizeContent(extraction.element, extraction.metadata.title);
  checkDeadline();
  diagnostics.timings.standardizeMs = Math.round(performance.now() - standardizeStarted);
  const renderStarted = performance.now();
  const renderOptions: RenderOptions = recipeTransform ? { preserveTables: recipeTransform.preserveTables, preserveCode: recipeTransform.preserveCode, preserveCallouts: recipeTransform.preserveCallouts } : {};
  const rendered = renderMarkdown(extraction.element, extraction.metadata, request.renderProfile, renderOptions);
  checkDeadline();
  diagnostics.timings.renderMs = Math.round(performance.now() - renderStarted);
  options.onProgress?.({ stage: 'render' });
  let markdown = rendered.markdown;
  const recipeTemplate = extraction.template?.inline || (extraction.template?.id ? options.templates?.find((item) => item?.id === extraction.template?.id)?.body : undefined);
  const template = options.template || recipeTemplate;
  if (template) {
    markdown = renderTemplate(template, { ...rendered.metadata, content: markdown } as TemplateContext);
    checkDeadline();
  }
  const postProcessStarted = performance.now();
  if (request.postProcessors.length) markdown = applyPostProcessors({ id: request.operationId, markdown, metadata: rendered.metadata, assets, snapshot: undefined, warnings, diagnostics }, request.postProcessors).markdown;
  diagnostics.timings.postProcessMs = Math.round(performance.now() - postProcessStarted);
  diagnostics.timings.totalMs = Math.round(performance.now() - started);
  checkSignal(options.signal);
  checkDeadline();
  let snapshot: ClipAsset | undefined;
  if (request.includeSnapshot) {
    try { snapshot = snapshotDocument(document); }
    catch (error) { if (error instanceof YezhaiError && error.code === 'SNAPSHOT_TOO_LARGE') warnings.push(error.message); else throw error; }
  }
  return {
    id: request.operationId,
    markdown,
    metadata: rendered.metadata,
    assets,
    snapshot,
    warnings: [...new Set(warnings)],
    diagnostics,
  };
}

export function loadRecipeDefinitions(input: unknown): RecipeDefinition[] {
  if (!Array.isArray(input)) return [];
  return input.map((value) => validateRecipe(value)).filter((result): result is { ok: true; recipe: RecipeDefinition } => result.ok).map((result) => result.recipe);
}
