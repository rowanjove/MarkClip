import { browser } from 'wxt/browser';
import { createClipRequest, type CaptureMode } from '../../shared/contracts';
import { loadSettings } from '../../shared/settings';
import { friendlyError } from '../../shared/errors';
import { resolveProfile } from '../../core/profiles';

let mode: CaptureMode = 'main';
let tabId: number | undefined;
let customProfiles: unknown[] = [];
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

async function loadTemplateOptions(): Promise<void> {
  const select = $('template') as HTMLSelectElement;
  const settings = await loadSettings();
  customProfiles = settings.settings.profiles;
  document.documentElement.dataset.theme = settings.settings.appearance.theme;
  const profileSelect = $('profile') as HTMLSelectElement;
  const builtInGithub = document.createElement('option'); builtInGithub.value = 'github'; builtInGithub.textContent = 'GitHub 笔记';
  if (![...profileSelect.options].some((option) => option.value === 'github')) profileSelect.append(builtInGithub);
  for (const item of customProfiles) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    if (typeof value.id !== 'string' || typeof value.name !== 'string' || !value.id.trim() || [...profileSelect.options].some((option) => option.value === value.id)) continue;
    const option = document.createElement('option'); option.value = value.id; option.textContent = value.name.slice(0, 120); profileSelect.append(option);
  }
  for (const item of settings.settings.templates) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    if (typeof value.id !== 'string' || typeof value.name !== 'string') continue;
    if ([...select.options].some((option) => option.value === value.id)) continue;
    const option = document.createElement('option'); option.value = value.id; option.textContent = value.name.slice(0, 120); select.append(option);
  }
}

async function activeTab(): Promise<any> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('没有找到当前标签页。');
  tabId = tab.id;
  $('pageTitle').textContent = tab.title || tab.url || '当前页面';
  return tab;
}

async function ensureBootstrap(): Promise<void> {
  const tab = await activeTab();
  try {
    const ping = await browser.tabs.sendMessage(tab.id!, { action: 'ping' });
    if (ping?.success) return;
  } catch { /* inject on demand */ }
  await browser.scripting.executeScript({ target: { tabId: tab.id! }, files: ['bootstrap.js'] });
}

async function run(after: 'copy' | 'download'): Promise<void> {
  $('error').classList.remove('visible');
  $('status').textContent = '正在提取…';
  try {
    await ensureBootstrap();
    if (mode === 'highlights') {
      await browser.tabs.sendMessage(tabId!, { action: 'startHighlights' });
      $('status').textContent = '已在页面开启摘录模式，请在页面工具条中完成。';
      return;
    }
    const profileId = ($('profile') as HTMLSelectElement).value;
    const profile = resolveProfile(profileId, customProfiles);
    const selectedTemplate = ($('template') as HTMLSelectElement).value || profile.request.templateId;
    const request = createClipRequest({ ...profile.request, mode, imageMode: ($('assets') as HTMLInputElement).checked ? 'assets' : profile.request.imageMode || 'remote', templateId: selectedTemplate, includeSnapshot: Boolean(profile.request.includeSnapshot) });
    const effectiveAfter = after === 'download' && request.includeSnapshot ? 'archive' : after;
    const response = await browser.tabs.sendMessage(tabId!, { action: 'capture', ...request, after: effectiveAfter });
    if (!response?.success) throw new Error(response?.error?.message || response?.error || '提取失败。');
    $('status').textContent = response.warnings?.[0] || '已完成';
    if (after === 'copy') $('status').textContent = '已复制到剪贴板';
  } catch (error) {
    $('error').textContent = friendlyError(error);
    $('error').classList.add('visible'); $('status').textContent = '未完成';
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => button.addEventListener('click', () => {
  mode = button.dataset.mode as CaptureMode;
  document.querySelectorAll('[data-mode]').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
}));
$('copy').addEventListener('click', () => void run('copy'));
$('save').addEventListener('click', () => void run('download'));
$('sidepanel').addEventListener('click', async () => { const [tab] = await browser.tabs.query({ active: true, currentWindow: true }); if (browser.sidePanel?.open && tab?.windowId !== undefined) await browser.sidePanel.open({ windowId: tab.windowId }); else await browser.runtime.sendMessage({ action: 'openSidePanel', tabId: tab?.id }); });
$('openOptions').addEventListener('click', () => void browser.runtime.openOptionsPage());
void activeTab().catch(() => undefined);
void loadTemplateOptions().catch(() => undefined);
