import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { reconcileFloatingScripts, requestSiteAccess, setAllSitesFloating, setSiteFloating } from '../browser/permissions';
import { friendlyError } from '../shared/errors';
import { BatchQueue, type BatchTask } from '../core/batch/queue';
import { isMessage } from '../shared/messages';
import { createBatchArchive } from '../core/assets/pipeline';
import { loadSettings } from '../shared/settings';
import { resolveExporter, safeExportFileName } from '../core/exporters';

export default defineBackground(() => {
  const batches = new Map<string, { queue: BatchQueue; request: Record<string, unknown>; temporaryPermission: boolean }>();
  const batchRuns = new Map<string, Promise<void>>();
  const taskSummary = (tasks: BatchTask[]) => tasks.map(({ id, tabId, url, title, state, error, startedAt, finishedAt }) => ({ id, tabId, url, title, state, error, startedAt, finishedAt }));

  browser.runtime.onInstalled.addListener(() => {
    void reconcileFloatingScripts();
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: 'save-main', title: '页摘：保存正文', contexts: ['page'] });
      browser.contextMenus.create({ id: 'copy-selection', title: '页摘：复制选中内容 Markdown', contexts: ['selection'] });
      browser.contextMenus.create({ id: 'pick-element', title: '页摘：选择页面区域', contexts: ['page'] });
      browser.contextMenus.create({ id: 'start-highlights', title: '页摘：开始摘录', contexts: ['page'] });
      browser.contextMenus.create({ id: 'archive-page', title: '页摘：完整资料包', contexts: ['page'] });
      browser.contextMenus.create({ id: 'open-sidepanel', title: '页摘：打开侧栏', contexts: ['page'] });
    }).catch(() => undefined);
  });

  browser.runtime.onStartup.addListener(() => { void reconcileFloatingScripts(); });
  browser.permissions.onAdded.addListener(() => { void reconcileFloatingScripts(); });
  browser.permissions.onRemoved.addListener(() => { void reconcileFloatingScripts(); });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;
    if (info.menuItemId === 'open-sidepanel') {
      await openSidePanel(tab.id, tab.windowId);
      return;
    }
    await ensureBootstrap(tab.id);
    if (info.menuItemId === 'start-highlights') {
      await browser.tabs.sendMessage(tab.id, { action: 'startHighlights' }).catch(() => undefined);
      return;
    }
    const archive = info.menuItemId === 'archive-page';
    await browser.tabs.sendMessage(tab.id, { action: 'capture', mode: info.menuItemId === 'copy-selection' ? 'selection' : info.menuItemId === 'pick-element' ? 'pick' : 'main', imageMode: archive ? 'assets' : 'remote', includeSnapshot: archive, after: info.menuItemId === 'copy-selection' ? 'copy' : archive ? 'archive' : 'download', operationId: crypto.randomUUID() }).catch(() => undefined);
  });

  browser.commands.onCommand.addListener(async (command, tab) => {
    if (!tab?.id) return;
    if (command === 'open-sidepanel') return openSidePanel(tab.id, tab.windowId);
    await ensureBootstrap(tab.id);
    const mode = command === 'start-highlights' ? 'highlights' : 'main';
    await browser.tabs.sendMessage(tab.id, { action: command === 'copy-markdown' ? 'capture' : mode === 'highlights' ? 'startHighlights' : 'capture', mode, after: command === 'copy-markdown' ? 'copy' : 'download', operationId: crypto.randomUUID() }).catch(() => undefined);
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Keep internal batchUpdate/ensureBootstrap messages private while
    // rejecting malformed external messages before they reach permission or
    // export handlers.
    if (!isMessage(message) && !['ensureBootstrap', 'batchUpdate'].includes(String(message?.action))) return false;
    const privileged = !sender.tab;
    if (message?.action === 'batchUpdate' && !privileged) return false;
    if (['setSiteFloating', 'setAllSitesFloating', 'requestSiteAccess', 'batchStart', 'batchControl', 'openSidePanel'].includes(String(message?.action)) && !privileged) return false;
    if (message?.action === 'ensureBootstrap' && sender.tab?.id) {
      ensureBootstrap(sender.tab.id).then(() => sendResponse({ success: true })).catch((error) => sendResponse({ success: false, error: friendlyError(error) }));
      return true;
    }
    if (message?.action === 'setSiteFloating') {
      setSiteFloating(String(message.origin), Boolean(message.enabled)).then(() => sendResponse({ success: true })).catch((error) => sendResponse({ success: false, error: friendlyError(error) }));
      return true;
    }
    if (message?.action === 'setAllSitesFloating') {
      setAllSitesFloating(Boolean(message.enabled)).then(() => sendResponse({ success: true })).catch((error) => sendResponse({ success: false, error: friendlyError(error) }));
      return true;
    }
    if (message?.action === 'requestSiteAccess') {
      requestSiteAccess(String(message.origin)).then((granted) => sendResponse({ success: granted })).catch((error) => sendResponse({ success: false, error: friendlyError(error) }));
      return true;
    }
    if (message?.action === 'exportClip') {
      (async () => {
        const settings = await loadSettings();
        const target = resolveExporter(String(message.targetId), settings.settings.exporters);
        if (!target || !(await target.isAvailable({ browser: 'chrome' }))) throw new Error('导出目标当前不可用。');
        const options = { ...(message.options && typeof message.options === 'object' ? message.options : {}) } as Record<string, unknown>;
        const exporterConfig = settings.settings.exporters[String(message.targetId)];
        if (!options.path && String(message.targetId) === 'obsidian' && exporterConfig && typeof exporterConfig === 'object' && typeof (exporterConfig as Record<string, unknown>).vault === 'string') options.path = (exporterConfig as Record<string, unknown>).vault;
        const result = await target.export(message.clip as any, options as any, { browser: 'chrome' });
        sendResponse(result);
      })().catch((error) => sendResponse({ success: false, error: friendlyError(error) }));
      return true;
    }
    if (message?.action === 'openSidePanel') {
      (async () => { const [active] = await browser.tabs.query({ active: true, currentWindow: true }); return openSidePanel(sender.tab?.id || message.tabId || active?.id, sender.tab?.windowId || active?.windowId); })().then(() => sendResponse({ success: true })).catch((error) => sendResponse({ success: false, error: friendlyError(error) }));
      return true;
    }
    if (message?.action === 'batchStart' && Array.isArray(message.tabIds)) {
      (async () => {
        let temporaryPermission = false;
        try {
          const operationId = crypto.randomUUID(); const queue = new BatchQueue(2);
          const settings = await loadSettings();
          const alreadyGranted = await browser.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false);
          // Only revoke a grant that this batch acquired itself. If a user
          // already granted <all_urls> outside the current settings toggle,
          // a batch must not silently remove that standing permission.
          temporaryPermission = !settings.settings.permissions.allSites && !alreadyGranted;
          if (!alreadyGranted && !(await browser.permissions.request({ origins: ['<all_urls>'] }))) throw new Error('批量导出需要临时网页访问权限。');
          const tabs = (await browser.tabs.query({})).filter((tab) => tab.id !== undefined && message.tabIds.includes(tab.id)).map((tab) => ({ id: tab.id!, url: tab.url, title: tab.title }));
          queue.enqueue(tabs); const request = (message.request && typeof message.request === 'object' ? message.request : {}) as Record<string, unknown>;
          batches.set(operationId, { queue, request, temporaryPermission }); void runBatch(operationId, queue, request, temporaryPermission); sendResponse({ success: true, operationId, tasks: taskSummary(queue.tasks) });
        } catch (error) {
          if (temporaryPermission) await browser.permissions.remove({ origins: ['<all_urls>'] }).catch(() => undefined);
          sendResponse({ success: false, error: friendlyError(error) });
        }
      })();
      return true;
    }
    if (message?.action === 'batchControl' && typeof message.operationId === 'string') {
      const batch = batches.get(message.operationId);
      if (!batch) { sendResponse({ success: false, error: '批量任务不存在。' }); return false; }
      const command = message.command;
      if (command === 'pause') batch.queue.pause();
      if (command === 'resume') { batch.queue.resume(); void runBatch(message.operationId, batch.queue, batch.request, batch.temporaryPermission); }
      if (command === 'cancel') batch.queue.cancel();
      if (command === 'retry') { batch.queue.retryFailed(); void runBatch(message.operationId, batch.queue, batch.request, batch.temporaryPermission); }
      sendResponse({ success: true, tasks: taskSummary(batch.queue.tasks) }); return false;
    }
    return false;
  });

  async function ensureBootstrap(tabId: number): Promise<void> {
    try {
      const ping = await browser.tabs.sendMessage(tabId, { action: 'ping' });
      if (ping?.success) return;
    } catch { /* not injected */ }
    await browser.scripting.executeScript({ target: { tabId }, files: ['bootstrap.js'] });
  }

  function runBatch(operationId: string, queue: BatchQueue, request: Record<string, unknown>, temporaryPermission = false): Promise<void> {
    const active = batchRuns.get(operationId);
    if (active) return active;
    const promise = runBatchInternal(operationId, queue, request, temporaryPermission).catch((error) => {
      // Archive/download failures happen after individual tasks settle. Keep
      // the background promise handled and surface the failure to the open
      // Side Panel instead of leaving an unhandled rejection in the service
      // worker.
      void browser.runtime.sendMessage({ action: 'batchUpdate', operationId, tasks: taskSummary(queue.tasks), error: friendlyError(error) }).catch(() => undefined);
    }).finally(() => {
      if (batchRuns.get(operationId) === promise) batchRuns.delete(operationId);
    });
    batchRuns.set(operationId, promise);
    return promise;
  }

  async function runBatchInternal(operationId: string, queue: BatchQueue, request: Record<string, unknown>, temporaryPermission = false): Promise<void> {
    try {
      await queue.run(request as any, async (task: BatchTask, clipRequest: any, signal) => {
        await ensureBootstrap(task.tabId);
        const cancelCapture = () => { void browser.tabs.sendMessage(task.tabId, { action: 'cancel', operationId: task.id }).catch(() => undefined); };
        signal.addEventListener('abort', cancelCapture, { once: true });
        if (signal.aborted) { signal.removeEventListener('abort', cancelCapture); throw new Error('批量任务已取消。'); }
        let response: any;
        try {
          const currentTab = await browser.tabs.get(task.tabId);
          if (!currentTab?.url || currentTab.url !== task.url) throw new Error('标签页已导航，已跳过原任务页面。');
          response = await browser.tabs.sendMessage(task.tabId, { action: 'capture', ...clipRequest, operationId: task.id, after: 'preview', includeAssetData: (clipRequest.exportTargetId === 'zip' || clipRequest.exportTargetId === 'bundle') && (clipRequest.imageMode === 'assets' || clipRequest.includeSnapshot === true) });
        } finally {
          signal.removeEventListener('abort', cancelCapture);
        }
        if (!response?.success) throw new Error(response?.error?.message || response?.error || '提取失败。');
        const targetId = typeof clipRequest.exportTargetId === 'string' ? clipRequest.exportTargetId : undefined;
        if (targetId && !['preview', 'zip', 'bundle', 'markdown'].includes(targetId)) {
          const settings = await loadSettings();
          const target = resolveExporter(targetId, settings.settings.exporters);
          if (!target || !(await target.isAvailable({ browser: 'chrome' }))) throw new Error('导出目标当前不可用。');
          const exported = await target.export(response, (clipRequest.exportOptions && typeof clipRequest.exportOptions === 'object' ? clipRequest.exportOptions : {}) as any, { browser: 'chrome', signal });
          if (!exported.success) throw new Error(exported.error?.message || '导出失败。');
        }
        if (!targetId || targetId === 'markdown') {
          const blobUrl = URL.createObjectURL(new Blob([response.markdown], { type: 'text/markdown;charset=utf-8' }));
          await browser.downloads.download({ url: blobUrl, filename: `${safeExportFileName(response.metadata?.title || task.title)}.md`, saveAs: false });
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
        }
        if (signal.aborted) throw new Error('批量任务已取消。');
        return response;
      });
      const completed = queue.tasks.filter((task) => task.result?.markdown).map((task) => ({ id: task.id, markdown: task.result!.markdown, metadata: task.result!.metadata, diagnostics: task.result!.diagnostics, assets: task.result!.assets, snapshot: task.result!.snapshot }));
      const settled = queue.tasks.every((task) => !['queued', 'running'].includes(task.state));
      if (settled && completed.length && (request.exportTargetId === 'zip' || request.exportTargetId === 'bundle')) {
        const archive = await createBatchArchive(completed);
        const blobUrl = URL.createObjectURL(archive);
        await browser.downloads.download({ url: blobUrl, filename: `yezai-batch-${new Date().toISOString().slice(0, 10)}.zip`, saveAs: true });
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
      }
    } finally {
      // A failed archive/download must not strand a temporary <all_urls>
      // grant. Keep it only while a paused queue still has work to resume.
      const settled = queue.tasks.every((task) => !['queued', 'running'].includes(task.state));
      if (settled && temporaryPermission) await browser.permissions.remove({ origins: ['<all_urls>'] }).catch(() => undefined);
      await browser.runtime.sendMessage({ action: 'batchUpdate', operationId, tasks: taskSummary(queue.tasks) }).catch(() => undefined);
      if (settled && batches.get(operationId)?.queue === queue) batches.delete(operationId);
    }
  }

  async function openSidePanel(tabId?: number, windowId?: number): Promise<void> {
    if (browser.sidePanel?.open && windowId !== undefined) await browser.sidePanel.open({ windowId });
    else if ((browser as any).sidebarAction?.open) await (browser as any).sidebarAction.open();
    else if (tabId !== undefined) await ensureBootstrap(tabId);
  }

});
