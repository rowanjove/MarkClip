import { browser } from 'wxt/browser';
import { friendlyError } from '../../shared/errors';
import { loadSettings } from '../../shared/settings';
import { resolveProfile } from '../../core/profiles';
import { safeExportFileName } from '../../core/exporters';

let tabId: number | undefined;
let batchOperationId: string | undefined;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

async function applyTheme(): Promise<void> {
  const settings = await loadSettings();
  document.documentElement.dataset.theme = settings.settings.appearance.theme;
  const select = $('batchProfile') as HTMLSelectElement;
  for (const item of settings.settings.profiles) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    if (typeof value.id !== 'string' || typeof value.name !== 'string' || [...select.options].some((option) => option.value === value.id)) continue;
    const option = document.createElement('option'); option.value = value.id; option.textContent = value.name.slice(0, 120); select.append(option);
  }
}

async function copyText(value: string): Promise<void> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; } } catch { /* use textarea fallback */ }
  const area = document.createElement('textarea'); area.value = value; area.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(area); area.select();
  try { if (!document.execCommand('copy')) throw new Error('无法写入剪贴板。'); } finally { area.remove(); }
}

async function refresh(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  tabId = tab.id;
  try { await browser.tabs.sendMessage(tab.id, { action: 'ping' }); } catch { await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['bootstrap.js'] }); }
  const response = await browser.tabs.sendMessage(tab.id, { action: 'capture', mode: 'main', extractionProfile: 'smart', renderProfile: 'gfm', imageMode: 'remote', includeSnapshot: false, operationId: crypto.randomUUID() });
  if (!response?.success) throw new Error(response?.error?.message || response?.error || '提取失败');
  ($('title') as HTMLInputElement).value = response.metadata?.title || response.title || '';
  ($('markdown') as HTMLTextAreaElement).value = response.markdown || '';
  $('diagnosticData').textContent = JSON.stringify(response.diagnostics || {}, null, 2);
  const assets = response.assets || []; $('assetStatus').textContent = `${assets.length} 个资源`;
  const list = $('assetList'); list.replaceChildren();
  assets.forEach((asset: { fileName: string; status: string }) => { const item = document.createElement('li'); item.textContent = `${asset.fileName} · ${asset.status}`; list.append(item); });
}

function renderBatch(tasks: Array<{ title: string; state: string; error?: string }>): void {
  const list = $('batchList'); list.replaceChildren();
  tasks.forEach((task) => { const item = document.createElement('li'); item.textContent = `${task.title} · ${task.state}${task.error ? ` · ${task.error}` : ''}`; list.append(item); });
}

async function refreshHighlights(): Promise<void> {
  if (!tabId) return;
  const response = await browser.tabs.sendMessage(tabId, { action: 'getHighlights' });
  const list = $('highlightList'); list.replaceChildren();
  const items = response?.session?.items || [];
  for (const [index, item] of items.entries()) {
    const node = document.createElement('li');
    const text = document.createElement('span'); text.textContent = `${item.text}${item.note ? ` · ${item.note}` : ''}`;
    const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.disabled = index === 0;
    const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.disabled = index === items.length - 1;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除';
    const move = async (offset: number) => { const ids = items.map((entry: { id: string }) => entry.id); [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]]; await browser.tabs.sendMessage(tabId!, { action: 'reorderHighlights', ids }); await refreshHighlights(); };
    up.addEventListener('click', () => void move(-1).catch((error) => { $('diagnosticData').textContent = friendlyError(error); })); down.addEventListener('click', () => void move(1).catch((error) => { $('diagnosticData').textContent = friendlyError(error); }));
    remove.addEventListener('click', async () => { try { await browser.tabs.sendMessage(tabId!, { action: 'removeHighlight', id: item.id }); await refreshHighlights(); } catch (error) { $('diagnosticData').textContent = friendlyError(error); } });
    node.append(text, up, down, remove); list.append(node);
  }
}

async function captureArchive(): Promise<void> {
  if (!tabId) return;
  const response = await browser.tabs.sendMessage(tabId, { action: 'capture', mode: 'main', extractionProfile: 'smart', renderProfile: 'gfm', imageMode: 'assets', includeSnapshot: true, operationId: crypto.randomUUID(), after: 'archive' });
  if (!response?.success) throw new Error(response?.error?.message || response?.error || '归档失败');
}

document.querySelectorAll<HTMLButtonElement>('nav [data-tab]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.tab').forEach((section) => section.classList.toggle('active', section.id === button.dataset.tab)); document.querySelectorAll('nav button').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); }); }));
$('refresh').addEventListener('click', () => void refresh());
$('startHighlights').addEventListener('click', () => { if (tabId) void browser.tabs.sendMessage(tabId, { action: 'startHighlights' }).then(() => refreshHighlights()).catch(() => undefined); });
$('refreshHighlights').addEventListener('click', () => void refreshHighlights().catch(() => undefined));
$('copy').addEventListener('click', () => void copyText(($('markdown') as HTMLTextAreaElement).value).catch((error) => { $('diagnosticData').textContent = friendlyError(error); }));
$('copyDiagnostics').addEventListener('click', () => void copyText($('diagnosticData').textContent || '').catch((error) => { $('diagnosticData').textContent = friendlyError(error); }));
$('runAi').addEventListener('click', async () => { if (!tabId) return; try { const response = await browser.tabs.sendMessage(tabId, { action: 'aiProcess', operation: ($('aiOperation') as HTMLSelectElement).value, operationId: crypto.randomUUID() }); if (!response?.success) throw new Error(response?.error?.message || response?.error || 'AI 后处理失败'); ($('markdown') as HTMLTextAreaElement).value = response.markdown || ''; $('diagnosticData').textContent = JSON.stringify(response.diagnostics || {}, null, 2); } catch (error) { $('diagnosticData').textContent = friendlyError(error); } });
$('save').addEventListener('click', () => { const blob = new Blob([($('markdown') as HTMLTextAreaElement).value], { type: 'text/markdown' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${safeExportFileName(($('title') as HTMLInputElement).value)}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); });
$('saveZip').addEventListener('click', () => void captureArchive().catch((error) => { $('diagnosticData').textContent = friendlyError(error); }));
$('batchStart').addEventListener('click', async () => { try { const tabs = await browser.tabs.query({ currentWindow: true }); const candidates = tabs.filter((tab) => tab.id !== undefined && /^https?:/i.test(tab.url || '')).slice(0, 20); const settings = await loadSettings(); const profile = resolveProfile(($('batchProfile') as HTMLSelectElement).value, settings.settings.profiles); const includeAssets = ($('batchAssets') as HTMLInputElement).checked; const includeSnapshot = ($('batchSnapshot') as HTMLInputElement).checked; const request = { ...profile.request, mode: 'main', imageMode: includeAssets ? 'assets' : profile.request.imageMode || 'remote', includeSnapshot: includeSnapshot || Boolean(profile.request.includeSnapshot), exportTargetId: profile.request.exportTargetId || (includeAssets || includeSnapshot ? 'zip' : undefined) }; const response = await browser.runtime.sendMessage({ action: 'batchStart', tabIds: candidates.map((tab) => tab.id!), request }); if (!response?.success) throw new Error(response?.error?.message || response?.error || '批量任务启动失败'); batchOperationId = response.operationId; renderBatch(response.tasks || []); } catch (error) { $('diagnosticData').textContent = friendlyError(error); } });
const controlBatchSafely = (command: 'pause' | 'resume' | 'cancel' | 'retry') => void controlBatch(command).catch((error) => { $('diagnosticData').textContent = friendlyError(error); });
$('batchPause').addEventListener('click', () => controlBatchSafely('pause'));
$('batchResume').addEventListener('click', () => controlBatchSafely('resume'));
$('batchCancel').addEventListener('click', () => controlBatchSafely('cancel'));
$('batchRetry').addEventListener('click', () => controlBatchSafely('retry'));
browser.runtime.onMessage.addListener((message) => { if (message?.action === 'batchUpdate' && message.operationId === batchOperationId) { renderBatch(message.tasks || []); if (message.error) $('diagnosticData').textContent = String(message.error); } });
void applyTheme().catch(() => undefined);
void refresh().catch((error) => { $('diagnosticData').textContent = friendlyError(error); });

function controlBatch(command: 'pause' | 'resume' | 'cancel' | 'retry'): Promise<void> { return batchOperationId ? browser.runtime.sendMessage({ action: 'batchControl', operationId: batchOperationId, command }).then((response) => { if (response?.tasks) renderBatch(response.tasks); }) : Promise.resolve(); }
