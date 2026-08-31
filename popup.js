let currentMarkdown = null;
let currentTitle = '';
let resultMeta = null;
let activeOperationId = null;
let activeTabId = null;
let extractionMode = 'main';
let removeImages = false;
let localizeImages = false;
let floatingEnabled = false;
let theme = 'light';
let busy = false;

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

function currentResultMeta(context = {}) {
  return {
    mode: extractionMode,
    removeImages,
    localizeImages,
    ...context,
  };
}

function resultMatchesContext(tab) {
  return Boolean(
    resultMeta &&
    resultMeta.mode === extractionMode &&
    resultMeta.removeImages === removeImages &&
    resultMeta.localizeImages === localizeImages &&
    resultMeta.tabId === tab?.id &&
    resultMeta.url === (tab?.url || ''),
  );
}

function invalidateResult(message = '设置已改变，请重新提取') {
  currentMarkdown = null;
  resultMeta = null;
  $('stats').classList.remove('visible');
  $('previewBox').classList.remove('visible');
  if (message) $('statusText').textContent = message;
}

function hideError() {
  $('errorMsg').classList.remove('visible');
}

function setBusy(nextBusy) {
  busy = nextBusy;
  document.body.setAttribute('aria-busy', String(nextBusy));
  ['btnDownload', 'btnCopy', 'btnConvert', 'btnObsidian', 'btnBatch', 'themeToggle'].forEach((id) => {
    $(id).classList.toggle('loading', nextBusy);
    $(id).disabled = nextBusy;
  });
  document.querySelectorAll('.mode-btn, .switch').forEach((control) => {
    control.disabled = nextBusy;
  });
  const cancelButton = $('btnCancel');
  if (cancelButton) {
    const canCancel = nextBusy && Boolean(activeOperationId);
    cancelButton.hidden = !canCancel;
    cancelButton.disabled = !canCancel;
  }
  $('convertIcon').textContent = nextBusy ? '...' : '↻';
  document.querySelector('.status-dot')?.classList.toggle('busy', nextBusy);
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

function renderResult(markdown, title, charCount, warnings = [], tab = null) {
  currentMarkdown = markdown;
  currentTitle = title;
  resultMeta = currentResultMeta({ tabId: tab?.id, url: tab?.url || '' });

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
  $('statusText').textContent = warnings.length ? warnings[0] : '已提取，可复制或保存';
}

function formatCount(count) {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

function formatMode(mode) {
  if (mode === 'selection') return '选区';
  if (mode === 'pick') return '选择区域';
  if (mode === 'full') return '整页';
  return '正文';
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
  setBusy(true);
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
    showToast('请在页面中选择区域');
    window.close();
  } catch (err) {
    showError(`× ${err.message}`);
  }
}

async function extractPage() {
  if (busy) return '';
  hideError();
  setBusy(true);

  try {
    const tab = await getActiveTab();
    await Page2MDExtension.ensureContentScripts(tab.id);
    if (extractionMode === 'pick') {
      showError('选择区域请直接点击“复制”或“保存”，然后在页面中选择内容。');
      return '';
    }
    const response = await requestMarkdown(tab.id);
    if (!response?.success) throw new Error(response?.error || '提取失败，请刷新页面后重试。');
    if (typeof response.charCount !== 'number') throw new Error('提取结果缺少字符数，请重新加载扩展后再试。');
    renderResult(response.markdown, response.title, response.charCount, response.warnings || [], tab);
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
  let tab = null;
  try {
    tab = await getActiveTab();
  } catch (_err) {
    // extractPage() will surface the user-facing tab error below.
  }
  if (resultMatchesContext(tab) && currentMarkdown !== null) return currentMarkdown;
  return extractPage();
}

function syncPreviewState() {
  const preview = $('previewContent');
  const title = $('previewTitle');
  if (!resultMeta || !preview || !title) return;
  if (preview.value !== currentMarkdown || title.value.trim() !== currentTitle) {
    currentMarkdown = preview.value;
    currentTitle = title.value.trim() || currentTitle;
  }
}

async function copyMarkdown() {
  if (busy) return;
  if (extractionMode === 'pick') {
    await startPickAction('copy');
    return;
  }

  const markdown = await ensureMarkdown();
  if (markdown === null || markdown === '') {
    showError('没有可复制的内容，请先提取正文。');
    return;
  }

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
  if (busy) return;
  if (extractionMode === 'pick') {
    await startPickAction('download');
    return;
  }

  const markdown = await ensureMarkdown();
  if (markdown === null || markdown === '') {
    showError('没有可保存的内容，请先提取正文。');
    return;
  }

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
  if (busy) return;
  if (extractionMode === 'pick') {
    showError('发送到 Obsidian 暂不支持选择区域，请切换到正文或整页。');
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
  if (busy) return;
  if (extractionMode === 'pick') {
    showError('批量保存不支持选择区域，请切换到正文或整页。');
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
  document.querySelector('.mode-btn.active')?.focus({ preventScroll: true });
}

document.querySelectorAll('.mode-btn').forEach((button) => {
  button.addEventListener('click', async () => {
    extractionMode = button.dataset.mode;
    invalidateResult(extractionMode === 'pick' ? '点击复制或保存后选择区域' : '设置已改变，请重新提取');
    await persistPrefs({ [STORAGE_KEYS.mode]: extractionMode });
    renderPrefs();
    $('pageTitle').textContent = formatMode(extractionMode);
    showToast('提取范围已切换');
  });
});

$('removeImagesSwitch').addEventListener('click', async () => {
  removeImages = !removeImages;
  invalidateResult();
  await persistPrefs({ [STORAGE_KEYS.removeImages]: removeImages });
  renderPrefs();
  showToast(removeImages ? '图片链接将被移除' : '图片链接将被保留');
});

$('localizeImagesSwitch').addEventListener('click', async () => {
  localizeImages = !localizeImages;
  invalidateResult();
  await persistPrefs({ [STORAGE_KEYS.localizeImages]: localizeImages });
  renderPrefs();
  showToast(localizeImages ? '将尝试内嵌图片' : '图片将保留为链接');
});

$('floatingSwitch').addEventListener('click', async () => {
  floatingEnabled = !floatingEnabled;
  try {
    await persistPrefs({ [STORAGE_KEYS.hidden]: !floatingEnabled });
    await notifyFloatingVisibility();
    renderPrefs();
    showToast(floatingEnabled ? '页面快捷入口已开启' : '页面快捷入口已关闭');
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
  invalidateResult('正在重新提取');
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
  const editing = event.target?.matches?.('textarea, input, [contenteditable="true"]');
  if (event.key === 'Escape' && !editing) {
    const advancedActions = $('advancedActions');
    if (advancedActions?.open) {
      advancedActions.open = false;
      event.preventDefault();
      return;
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    if (editing) return;
    invalidateResult('正在重新提取');
    extractPage();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    if (editing) return;
    event.preventDefault();
    copyMarkdown();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    if (editing) return;
    event.preventDefault();
    downloadMarkdown();
  }
});

initPrefs().then(() => {
  $('pageTitle').textContent = formatMode(extractionMode);
  $('statusText').textContent = extractionMode === 'pick' ? '点击复制或保存后选择区域' : '准备提取正文';
}).catch((err) => showError(`× ${err.message}`));
