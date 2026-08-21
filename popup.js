let currentMarkdown = '';
let currentTitle = '';
let activeOperationId = null;
let activeTabId = null;
let extractionMode = 'main';
let removeImages = false;
let localizeImages = false;
let floatingEnabled = false;
let theme = 'dark';

const { STORAGE_DEFAULTS, STORAGE_KEYS } = MarkClipPopupState;
const $ = (id) => document.getElementById(id);

function showToast(message, duration = 1600) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function showError(message) {
  const el = $('errorMsg');
  el.textContent = message;
  el.classList.add('visible');
}

function hideError() {
  $('errorMsg').classList.remove('visible');
}

function setBusy(busy) {
  ['btnDownload', 'btnCopy', 'btnConvert', 'btnObsidian', 'btnBatch'].forEach((id) => {
    $(id).classList.toggle('loading', busy);
    $(id).disabled = busy;
  });
  const cancelButton = $('btnCancel');
  if (cancelButton) {
    cancelButton.hidden = !busy;
    cancelButton.disabled = !busy;
  }
  $('convertIcon').textContent = busy ? '...' : '↻';
}

function setTheme(nextTheme) {
  theme = nextTheme;
  document.body.classList.toggle('light', theme === 'light');
}

function setSwitch(button, on) {
  button.classList.toggle('on', on);
  button.setAttribute('aria-checked', String(Boolean(on)));
}

function renderPrefs() {
  document.querySelectorAll('.mode-btn').forEach((button) => {
    const active = button.dataset.mode === extractionMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  setSwitch($('removeImagesSwitch'), removeImages);
  setSwitch($('localizeImagesSwitch'), localizeImages);
  setSwitch($('floatingSwitch'), floatingEnabled);
}

function renderResult(markdown, title, charCount, warnings = []) {
  currentMarkdown = markdown;
  currentTitle = title;

  const lines = markdown.split('\n').length;
  const words = Math.round(charCount / 1.8);
  $('statChars').textContent = charCount >= 1000 ? `${(charCount / 1000).toFixed(1)}k` : charCount;
  $('statLines').textContent = lines;
  $('statWords').textContent = words >= 1000 ? `${(words / 1000).toFixed(1)}k` : words;
  $('stats').classList.add('visible');

  $('previewContent').value = markdown;
  $('previewTitle').value = title;
  $('pageTitle').textContent = `${formatMode(extractionMode)} · ${formatCount(charCount)} 字`;
  $('previewBox').classList.add('visible');
  $('statusText').textContent = warnings.length ? warnings[0] : '已提取当前内容';
}

function formatCount(count) {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

function formatMode(mode) {
  if (mode === 'selection') return '选区';
  if (mode === 'pick') return '框选';
  if (mode === 'full') return '全页';
  return '主内容';
}

function normalizeMode(mode) {
  return mode === 'selection' ? 'pick' : (mode || 'main');
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('没有找到当前标签页。');
  return tab;
}

async function requestMarkdown(tabId) {
  activeTabId = tabId;
  activeOperationId = globalThis.crypto?.randomUUID?.() || `popup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return Page2MDExtension.sendTabMessage(tabId, {
    action: 'getMarkdown',
    id: activeOperationId,
    mode: extractionMode,
    removeImages,
    localizeImages,
  });
}

async function cancelExtraction() {
  if (!activeOperationId || !activeTabId) return;
  try {
    await Page2MDExtension.sendTabMessage(activeTabId, {
      action: 'page2md:cancel',
      id: activeOperationId,
    }, 3000);
    showToast('正在取消转换');
  } catch (_err) {
    showToast('已请求取消');
  }
}

async function startPickAction(after) {
  hideError();
  try {
    const tab = await getActiveTab();
    await Page2MDExtension.ensureBootstrap(tab.id);
    Page2MDExtension.sendTabMessage(tab.id, {
      action: 'page2md:startPick',
      after,
      removeImages,
      localizeImages,
    }).catch(() => {
      // The popup may close while the user is picking on the page.
    });
    showToast('请在页面中框选区域');
    window.close();
  } catch (err) {
    showError(`× ${err.message}`);
  }
}

async function extractPage() {
  hideError();
  setBusy(true);

  try {
    const tab = await getActiveTab();
    await Page2MDExtension.ensureContentScripts(tab.id);
    if (extractionMode === 'pick') {
      showError('框选模式请直接点击“下载”或“复制”，然后在页面中选择区域。');
      return '';
    }
    const response = await requestMarkdown(tab.id);
    if (!response?.success) throw new Error(response?.error || '提取失败，请刷新页面后重试。');
    if (typeof response.charCount !== 'number') throw new Error('提取结果缺少字符数，请重新加载扩展后再试。');
    renderResult(response.markdown, response.title, response.charCount, response.warnings || []);
    return response.markdown;
  } catch (err) {
    showError(`× ${err.message}`);
    return '';
  } finally {
    activeOperationId = null;
    activeTabId = null;
    setBusy(false);
  }
}

async function ensureMarkdown() {
  syncPreviewState();
  if (currentMarkdown) return currentMarkdown;
  return extractPage();
}

function syncPreviewState() {
  const preview = $('previewContent');
  const title = $('previewTitle');
  if (preview?.value) currentMarkdown = preview.value;
  if (title?.value?.trim()) currentTitle = title.value.trim();
}

async function copyMarkdown() {
  if (extractionMode === 'pick') {
    await startPickAction('copy');
    return;
  }

  const markdown = await ensureMarkdown();
  if (!markdown) return;

  try {
    await navigator.clipboard.writeText(markdown);
    showToast('已复制到剪贴板');
  } catch (_err) {
    const textarea = document.createElement('textarea');
    textarea.value = markdown;
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (copied) showToast('已复制');
    else showError('复制失败，请手动复制预览内容。');
  }
}

async function downloadMarkdown() {
  if (extractionMode === 'pick') {
    await startPickAction('download');
    return;
  }

  const markdown = await ensureMarkdown();
  if (!markdown) return;

  triggerMarkdownDownload(markdown, currentTitle);
  showToast('开始下载...');
}

function triggerMarkdownDownload(markdown, title) {
  const safeName = Page2MDCore.sanitizeFileName(title);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}.md`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function openObsidianMarkdown() {
  if (extractionMode === 'pick') {
    showError('Obsidian 导出暂不支持框选模式，请先切换到主内容或全页。');
    return;
  }

  const markdown = await ensureMarkdown();
  if (!markdown) return;

  const stored = await chrome.storage.local.get({
    obsidianVault: '',
    obsidianPathTemplate: '{{title}}.md',
  });
  const date = new Date().toISOString().slice(0, 10);
  const file = MarkClipObsidian.renderFilePath(stored.obsidianPathTemplate, {
    title: currentTitle,
    date,
  });
  const uri = MarkClipObsidian.buildUri({ vault: stored.obsidianVault, file, content: markdown });
  if (chrome.tabs?.create) await chrome.tabs.create({ url: uri });
  else window.open(uri, '_blank', 'noopener');
  showToast('已打开 Obsidian');
}

async function batchExport() {
  if (extractionMode === 'pick') {
    showError('批量导出不支持框选模式，请切换到主内容或全页。');
    return;
  }
  setBusy(true);
  hideError();
  try {
    await MarkClipPopupState.withOptionalOrigins(
      chrome.permissions,
      ['<all_urls>'],
      {
        releaseAfter: !floatingEnabled,
        deniedMessage: '未授予网页访问权限，批量导出未开启。',
      },
      async () => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const candidates = tabs.filter((tab) => tab.id && /^https?:/i.test(tab.url || '')).slice(0, 20);
        if (!candidates.length) throw new Error('当前窗口没有可导出的普通网页标签页。');
        let successCount = 0;
        const failures = [];
        for (const tab of candidates) {
          try {
            await Page2MDExtension.ensureContentScripts(tab.id);
            const response = await Page2MDExtension.sendTabMessage(tab.id, {
              action: 'getMarkdown',
              mode: extractionMode,
              removeImages,
              localizeImages,
            });
            if (!response?.success) throw new Error(response?.error || '提取失败');
            triggerMarkdownDownload(response.markdown, response.title || tab.title || 'page');
            successCount += 1;
          } catch (err) {
            failures.push(`${tab.title || tab.url}: ${err.message}`);
          }
        }
        if (failures.length) showError(`已导出 ${successCount} 个标签页；${failures.length} 个失败。`);
        else showToast(`已批量导出 ${successCount} 个标签页`);
      }
    );
  } catch (err) {
    showError(`× ${err.message}`);
  } finally {
    setBusy(false);
  }
}

async function persistPrefs(values) {
  await chrome.storage.local.set(values);
}

async function notifyFloatingVisibility() {
  if (floatingEnabled) {
    const granted = chrome.permissions?.contains
      ? await chrome.permissions.contains({ origins: ['<all_urls>'] })
      : true;
    if (!granted && chrome.permissions?.request) {
      const requested = await chrome.permissions.request({ origins: ['<all_urls>'] });
      if (!requested) throw new Error('未授予网页访问权限，悬浮按钮未开启。');
    }
    await Page2MDExtension.registerFloatingContentScript();
  } else {
    await Page2MDExtension.disableFloatingEverywhere();
    return;
  }

  try {
    const tab = await getActiveTab();
    await Page2MDExtension.ensureBootstrap(tab.id);
    await Page2MDExtension.sendTabMessage(tab.id, {
      action: floatingEnabled ? 'page2md:showFloating' : 'page2md:hideFloating',
    });
  } catch (_err) {
    // Some browser-owned pages cannot host content scripts.
  }
}

async function initPrefs() {
  const stored = await chrome.storage.local.get(STORAGE_DEFAULTS);

  setTheme(stored[STORAGE_KEYS.theme]);
  extractionMode = normalizeMode(stored[STORAGE_KEYS.mode]);
  removeImages = Boolean(stored[STORAGE_KEYS.removeImages]);
  localizeImages = Boolean(stored[STORAGE_KEYS.localizeImages]);
  floatingEnabled = stored[STORAGE_KEYS.hidden] === false;
  if (floatingEnabled && chrome.permissions?.contains) {
    const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] });
    if (!granted) {
      floatingEnabled = false;
      await persistPrefs({ [STORAGE_KEYS.hidden]: true });
    }
  }
  renderPrefs();
}

document.querySelectorAll('.mode-btn').forEach((button) => {
  button.addEventListener('click', async () => {
    extractionMode = button.dataset.mode;
    currentMarkdown = '';
    await persistPrefs({ [STORAGE_KEYS.mode]: extractionMode });
    renderPrefs();
    $('pageTitle').textContent = formatMode(extractionMode);
    $('statusText').textContent = extractionMode === 'pick' ? '点击复制或下载后框选区域' : '可导出当前内容';
    showToast('模式已切换');
  });
});

$('removeImagesSwitch').addEventListener('click', async () => {
  removeImages = !removeImages;
  currentMarkdown = '';
  await persistPrefs({ [STORAGE_KEYS.removeImages]: removeImages });
  renderPrefs();
  showToast(removeImages ? '将移除图片链接' : '将保留图片链接');
});

$('localizeImagesSwitch').addEventListener('click', async () => {
  localizeImages = !localizeImages;
  currentMarkdown = '';
  await persistPrefs({ [STORAGE_KEYS.localizeImages]: localizeImages });
  renderPrefs();
  showToast(localizeImages ? '将尝试内嵌图片' : '将保留图片链接');
});

$('floatingSwitch').addEventListener('click', async () => {
  floatingEnabled = !floatingEnabled;
  try {
    await persistPrefs({ [STORAGE_KEYS.hidden]: !floatingEnabled });
    await notifyFloatingVisibility();
    renderPrefs();
    showToast(floatingEnabled ? '悬浮按钮已开启' : '悬浮按钮已隐藏');
  } catch (err) {
    floatingEnabled = false;
    await persistPrefs({ [STORAGE_KEYS.hidden]: true });
    renderPrefs();
    showError(`× ${err.message}`);
  }
});

$('themeToggle').addEventListener('click', async () => {
  setTheme(theme === 'dark' ? 'light' : 'dark');
  await persistPrefs({ [STORAGE_KEYS.theme]: theme });
});

$('btnConvert').addEventListener('click', () => {
  currentMarkdown = '';
  extractPage();
});
$('btnCopy').addEventListener('click', copyMarkdown);
$('btnDownload').addEventListener('click', downloadMarkdown);
$('btnObsidian').addEventListener('click', openObsidianMarkdown);
$('btnBatch').addEventListener('click', batchExport);
$('btnCancel').addEventListener('click', cancelExtraction);
$('previewContent').addEventListener('input', syncPreviewState);
$('previewTitle').addEventListener('input', syncPreviewState);

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    currentMarkdown = '';
    extractPage();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    event.preventDefault();
    copyMarkdown();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    downloadMarkdown();
  }
});

initPrefs().then(() => {
  $('pageTitle').textContent = formatMode(extractionMode);
  $('statusText').textContent = extractionMode === 'pick' ? '点击复制或下载后框选区域' : '可导出当前内容';
}).catch((err) => showError(`× ${err.message}`));
