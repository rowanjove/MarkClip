let currentMarkdown = '';
let currentTitle = '';
let extractionMode = 'main';
let removeImages = false;
let floatingEnabled = true;
let theme = 'dark';

const STORAGE_KEYS = {
  theme: 'page2md:theme',
  mode: 'page2md:mode',
  removeImages: 'page2md:removeImages',
  hidden: 'page2md:floatingHidden',
};
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
  ['btnDownload', 'btnCopy', 'btnConvert'].forEach((id) => {
    $(id).classList.toggle('loading', busy);
    $(id).disabled = busy;
  });
  $('convertIcon').textContent = busy ? '...' : '↻';
}

function setTheme(nextTheme) {
  theme = nextTheme;
  document.body.classList.toggle('light', theme === 'light');
}

function setSwitch(button, on) {
  button.classList.toggle('on', on);
}

function renderPrefs() {
  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === extractionMode);
  });
  setSwitch($('removeImagesSwitch'), removeImages);
  setSwitch($('floatingSwitch'), floatingEnabled);
}

function renderResult(markdown, title, charCount) {
  currentMarkdown = markdown;
  currentTitle = title;

  const lines = markdown.split('\n').length;
  const words = Math.round(charCount / 1.8);
  $('statChars').textContent = charCount >= 1000 ? `${(charCount / 1000).toFixed(1)}k` : charCount;
  $('statLines').textContent = lines;
  $('statWords').textContent = words >= 1000 ? `${(words / 1000).toFixed(1)}k` : words;
  $('stats').classList.add('visible');

  $('previewContent').textContent = markdown.substring(0, 500);
  $('previewTitle').textContent = title.length > 18 ? `${title.substring(0, 18)}...` : title;
  $('pageTitle').textContent = `${formatMode(extractionMode)} · ${formatCount(charCount)} 字`;
  $('previewBox').classList.add('visible');
  $('statusText').textContent = '已提取当前内容';
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
  return Page2MDExtension.sendTabMessage(tabId, {
    action: 'getMarkdown',
    mode: extractionMode,
    removeImages,
  });
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
    renderResult(response.markdown, response.title, response.charCount);
    return response.markdown;
  } catch (err) {
    showError(`× ${err.message}`);
    return '';
  } finally {
    setBusy(false);
  }
}

async function ensureMarkdown() {
  if (currentMarkdown) return currentMarkdown;
  return extractPage();
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

  const safeName = Page2MDCore.sanitizeFileName(currentTitle);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}.md`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('开始下载...');
}

async function persistPrefs(values) {
  await chrome.storage.local.set(values);
}

async function notifyFloatingVisibility() {
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
  const stored = await chrome.storage.local.get({
    [STORAGE_KEYS.theme]: 'dark',
    [STORAGE_KEYS.mode]: 'main',
    [STORAGE_KEYS.removeImages]: false,
    [STORAGE_KEYS.hidden]: false,
  });

  setTheme(stored[STORAGE_KEYS.theme]);
  extractionMode = normalizeMode(stored[STORAGE_KEYS.mode]);
  removeImages = Boolean(stored[STORAGE_KEYS.removeImages]);
  floatingEnabled = !stored[STORAGE_KEYS.hidden];
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

$('floatingSwitch').addEventListener('click', async () => {
  floatingEnabled = !floatingEnabled;
  await persistPrefs({ [STORAGE_KEYS.hidden]: !floatingEnabled });
  renderPrefs();
  await notifyFloatingVisibility();
  showToast(floatingEnabled ? '悬浮按钮已开启' : '悬浮按钮已隐藏');
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
