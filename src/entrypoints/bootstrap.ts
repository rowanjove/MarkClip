import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { buildClip } from '../core/pipeline';
import { loadRecipeDefinitions } from '../core/pipeline';
import { loadSettings } from '../shared/settings';
import { friendlyError } from '../shared/errors';
import { YezhaiError } from '../shared/errors';
import { createArchive } from '../core/assets/pipeline';
import { BUILTIN_RECIPES } from '../core/recipes/builtin';
import { captureSelection, createHighlightSession, renderHighlights, removeHighlight, reorderHighlights, type HighlightSession } from '../core/highlights';
import { isMessage } from '../shared/messages';
import { safeExportFileName } from '../core/exporters';

export default defineUnlistedScript(() => {
  if ((globalThis as { __yezaiBootstrapped?: boolean }).__yezaiBootstrapped) return;
  (globalThis as { __yezaiBootstrapped?: boolean }).__yezaiBootstrapped = true;
  const operations = new Map<string, AbortController>();
  let highlightSession: HighlightSession | null = null;
  let highlightBar: HTMLDivElement | null = null;
  let highlightMouseUp: (() => void) | null = null;
  let pendingHighlightRange: Range | null = null;

  async function copyToClipboard(text: string): Promise<void> {
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; } } catch { /* fall back to the page's native copy path */ }
    const area = document.createElement('textarea'); area.value = text; area.style.cssText = 'position:fixed;left:-9999px;top:0'; document.documentElement.append(area); area.select();
    try { if (!document.execCommand('copy')) throw new YezhaiError('EXPORT_FAILED', '无法写入剪贴板，请手动复制预览内容。', 'export'); }
    finally { area.remove(); }
  }

  async function performCapture(message: Record<string, any>, sendResponse?: (response: unknown) => void): Promise<void> {
    const operationId = String(message.operationId || crypto.randomUUID());
    const controller = new AbortController();
    operations.set(operationId, controller);
    const initialUrl = location.href;
    try {
      const { result } = await buildCurrentClip({ ...message, operationId }, controller);
      if (location.href !== initialUrl) throw new YezhaiError('PAGE_NAVIGATED', '页面已跳转，请在新页面重新提取。', 'capture');
      const remoteTarget = typeof message.exportTargetId === 'string' && !['markdown', 'zip', 'bundle', 'clipboard'].includes(message.exportTargetId) ? message.exportTargetId : undefined;
      if (remoteTarget) {
        const exportClip = { ...result, assets: result.assets.map(({ data, ...asset }) => asset), snapshot: result.snapshot ? (({ data, ...asset }) => asset)(result.snapshot) : undefined };
        const exported = await browser.runtime.sendMessage({ action: 'exportClip', targetId: remoteTarget, clip: exportClip, options: message.exportOptions });
        if (!exported?.success) throw new YezhaiError(exported?.error?.code || 'EXPORT_FAILED', exported?.error?.message || '导出失败。', 'export');
      }
      if (!remoteTarget && message.after === 'copy') await copyToClipboard(result.markdown);
      if (!remoteTarget && message.after === 'download') {
        const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' }); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = `${safeExportFileName(result.metadata.title)}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
      }
      if (!remoteTarget && message.after === 'archive') {
        const archive = await createArchive(result); const href = URL.createObjectURL(archive); const link = document.createElement('a'); link.href = href; link.download = `${safeExportFileName(result.metadata.title)}.yezai.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
      }
      const assets = message.includeAssetData ? result.assets : result.assets.map(({ data, ...asset }) => asset);
      const snapshot = message.includeAssetData ? result.snapshot : result.snapshot ? (({ data, ...asset }) => asset)(result.snapshot) : undefined;
      sendResponse?.({ success: true, ...result, assets, snapshot });
    } catch (error) { sendResponse?.({ success: false, error: friendlyError(error), operationId }); if (!sendResponse) throw error; }
    finally { operations.delete(operationId); }
  }

  async function buildCurrentClip(message: Record<string, any>, controller: AbortController): Promise<{ result: Awaited<ReturnType<typeof buildClip>>; settings?: Awaited<ReturnType<typeof loadSettings>>['settings'] }> {
      const operationId = String(message.operationId || crypto.randomUUID());
      const settingsResult = await loadSettings().catch(() => ({ settings: undefined }));
      const settings = settingsResult.settings;
      const userRecipes = settings ? loadRecipeDefinitions(settings.recipes.filter((item) => item.enabled).map((item) => item.definition)) : [];
      const selectedTemplate = settings?.templates.find((item) => item && typeof item === 'object' && String((item as Record<string, unknown>).id || '') === String(message.templateId || ''));
      const templateBody = selectedTemplate && typeof (selectedTemplate as Record<string, unknown>).body === 'string' ? String((selectedTemplate as Record<string, unknown>).body) : undefined;
      const rootOverride = message.mode === 'pick' ? await pickElement(controller.signal) : undefined;
      const result = await buildClip({ mode: message.mode || settings?.capture.mode || 'main', extractionProfile: message.extractionProfile || settings?.extraction.profile || 'smart', renderProfile: message.renderProfile || 'gfm', imageMode: message.imageMode || (message.localizeImages ? 'embed' : message.removeImages ? 'remove' : settings?.images.mode || 'remote'), includeSnapshot: message.includeSnapshot === true, templateId: message.templateId, recipeId: message.recipeId, exportTargetId: message.exportTargetId, postProcessors: Array.isArray(message.postProcessors) ? message.postProcessors : [], operationId, url: location.href }, { signal: controller.signal, template: templateBody, templates: settings?.templates as Array<{ id?: string; body?: string }> | undefined, recipes: [...BUILTIN_RECIPES, ...userRecipes], rootOverride, assetOptions: settings ? { maxImageBytes: settings.images.maxImageBytes, maxTotalBytes: settings.images.maxTotalBytes } : undefined });
      return { result, settings };
  }

  async function performAi(message: Record<string, any>, sendResponse?: (response: unknown) => void): Promise<void> {
    const operationId = String(message.operationId || crypto.randomUUID());
    const controller = new AbortController(); operations.set(operationId, controller);
    try {
      const { result: clip, settings } = await buildCurrentClip({ ...message, mode: 'main' }, controller);
      if (!settings?.ai.enabled) throw new YezhaiError('AI_FAILED', 'AI 后处理未启用，请先在设置中开启。', 'ai');
      const [{ createOpenAICompatibleProvider, createOllamaProvider }, { processClipWithAi }] = await Promise.all([import('../ai/providers'), import('../ai/schema')]);
      const provider = settings.ai.provider === 'openai-compatible'
        ? createOpenAICompatibleProvider({ endpoint: settings.ai.endpoint || 'https://api.openai.com/v1', model: settings.ai.model || 'gpt-4o-mini', apiKey: settings.ai.credentials?.apiKey })
        : createOllamaProvider({ endpoint: settings.ai.endpoint || 'http://127.0.0.1:11434', model: settings.ai.model || 'llama3.2' });
      const processed = await processClipWithAi(clip, message.operation, provider, { signal: controller.signal });
      const warnings = processed.warning ? [...processed.clip.warnings, processed.warning] : processed.clip.warnings;
      sendResponse?.({ success: true, ...processed.clip, warnings });
    } catch (error) { sendResponse?.({ success: false, error: friendlyError(error), operationId }); }
    finally { operations.delete(operationId); }
  }

  (globalThis as { __yezaiPerformCapture?: (message: Record<string, any>) => Promise<void> }).__yezaiPerformCapture = (message) => performCapture(message);

  function pickElement(signal: AbortSignal): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
      let current: HTMLElement | null = null;
      const previousOutline = new WeakMap<HTMLElement, string>();
      const cleanup = () => { document.removeEventListener('mouseover', over, true); document.removeEventListener('click', click, true); document.removeEventListener('keydown', escape, true); if (current) current.style.outline = previousOutline.get(current) || ''; clearTimeout(timer); signal.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(new YezhaiError('CANCELLED', '选择已取消。', 'capture')); };
      const over = (event: Event) => { const target = event.target as HTMLElement | null; if (!target || target === document.documentElement || target.id === 'yezai-floating-entry' || target.closest('#yezai-highlight-toolbar')) return; if (current && current !== target) current.style.outline = previousOutline.get(current) || ''; current = target; previousOutline.set(target, target.style.outline); target.style.outline = '2px solid #d49a2a'; };
      const click = (event: Event) => { const target = event.target as HTMLElement | null; if (!target || target === document.documentElement || target.id === 'yezai-floating-entry' || target.closest('#yezai-highlight-toolbar')) return; event.preventDefault(); event.stopPropagation(); cleanup(); resolve(target); };
      const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') abort(); };
      const timer = setTimeout(() => abort(), 60_000);
      document.addEventListener('mouseover', over, true); document.addEventListener('click', click, true); document.addEventListener('keydown', escape, true); signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === 'ping') { sendResponse({ success: true }); return false; }
    if (message?.action === 'libsReady') { sendResponse({ success: true }); return false; }
    if (!isMessage(message)) return false;
    if (message?.action === 'cancel' && typeof message.operationId === 'string') { operations.get(message.operationId)?.abort(); sendResponse({ success: true }); return false; }
    if (message?.action === 'startHighlights') { startHighlights(); sendResponse({ success: true }); return false; }
    if (message?.action === 'getHighlights') { sendResponse({ success: true, session: highlightSession ? { ...highlightSession, items: highlightSession.items.map((item) => ({ ...item })) } : null }); return false; }
    if (message?.action === 'finishHighlights') { const result = finishHighlights(); sendResponse({ success: true, markdown: result }); return false; }
    if (message?.action === 'addHighlight') { const item = highlightSession ? captureSelection(highlightSession, document, String(message.note || '')) : null; sendResponse({ success: Boolean(item), item }); return false; }
    if (message?.action === 'removeHighlight' && typeof message.id === 'string') { if (highlightSession) removeHighlight(highlightSession, message.id); sendResponse({ success: true }); return false; }
    if (message?.action === 'reorderHighlights' && Array.isArray(message.ids)) { if (highlightSession) reorderHighlights(highlightSession, message.ids.filter((id: unknown): id is string => typeof id === 'string')); sendResponse({ success: true }); return false; }
    if (message?.action === 'aiProcess' && typeof message.operation === 'string') { void performAi(message, sendResponse); return true; }
    if (!['capture', 'getMarkdown'].includes(message?.action)) return false;
    void performCapture(message, sendResponse);
    return true;
  });

  function startHighlights(): void {
    cleanupHighlights();
    highlightSession = createHighlightSession();
    document.documentElement.dataset.yezaiHighlights = 'active';
    highlightBar = document.createElement('div');
    highlightBar.id = 'yezai-highlight-toolbar';
    highlightBar.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;padding:8px;background:#183526;color:#fff;border-radius:7px;box-shadow:0 3px 18px #0005;font:13px system-ui;display:flex;gap:6px;align-items:center';
    const label = document.createElement('span'); label.textContent = '页摘摘录模式'; highlightBar.append(label);
    const add = document.createElement('button'); add.textContent = '摘录';
    const note = document.createElement('button'); note.textContent = '摘录并备注';
    const done = document.createElement('button'); done.textContent = '完成';
    const cancel = document.createElement('button'); cancel.textContent = '取消';
    for (const button of [add, note, done, cancel]) { button.type = 'button'; button.style.cssText = 'border:1px solid #b9d2bd;border-radius:4px;padding:4px 7px;background:transparent;color:#fff;cursor:pointer'; }
    add.addEventListener('click', () => { if (highlightSession) captureSelection(highlightSession, document, '', pendingHighlightRange || undefined); pendingHighlightRange = null; updateHighlightCount(label); });
    note.addEventListener('click', () => { const value = window.prompt('备注（可选）', '') || ''; if (highlightSession) captureSelection(highlightSession, document, value, pendingHighlightRange || undefined); pendingHighlightRange = null; updateHighlightCount(label); });
    done.addEventListener('click', () => { const markdown = finishHighlights(); if (markdown) void copyToClipboard(markdown); });
    cancel.addEventListener('click', cleanupHighlights);
    highlightBar.append(add, note, done, cancel); document.documentElement.append(highlightBar);
    highlightMouseUp = () => { const selection = window.getSelection(); if (selection?.rangeCount && selection.toString().trim()) { pendingHighlightRange = selection.getRangeAt(0).cloneRange(); label.textContent = '已选择文本，点击摘录'; } };
    document.addEventListener('mouseup', highlightMouseUp, { passive: true });
  }

  function updateHighlightCount(label: HTMLSpanElement): void { label.textContent = `页摘摘录模式 · ${highlightSession?.items.length || 0} 条`; }
  function finishHighlights(): string {
    if (!highlightSession) return '';
    const markdown = renderHighlights(highlightSession, document.title);
    cleanupHighlights();
    return markdown;
  }
  function cleanupHighlights(): void {
    if (highlightMouseUp) document.removeEventListener('mouseup', highlightMouseUp);
    highlightMouseUp = null; pendingHighlightRange = null; highlightBar?.remove(); highlightBar = null; highlightSession = null;
    delete document.documentElement.dataset.yezaiHighlights;
  }
});
