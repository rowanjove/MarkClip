(function () {
  if (window.MarkClipFloating) return;

  const STORAGE_KEYS = {
    position: 'page2md:floatingPosition',
    theme: 'page2md:theme',
    mode: 'page2md:mode',
    removeImages: 'page2md:removeImages',
    localizeImages: 'page2md:localizeImages',
    hidden: 'page2md:floatingHidden',
  };
  let ui;
  let storageListenerBound = false;
  let creationInFlight = null;
  let visibilityGeneration = 0;

  function storageGet(defaults) {
    return chrome.storage.local.get(defaults);
  }

  function storageSet(values) {
    return chrome.storage.local.set(values);
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

  async function createFloatingUi() {
    bindStorageListener();
    if (ui || document.getElementById('page2md-floating-root')) return;
    const generation = visibilityGeneration;
    if (creationInFlight?.generation === generation) return creationInFlight.promise;
    const promise = createFloatingUiInternal(generation);
    creationInFlight = { generation, promise };
    try {
      await promise;
    } finally {
      if (creationInFlight?.promise === promise) creationInFlight = null;
    }
  }

  async function createFloatingUiInternal(generation) {
    if (ui || document.getElementById('page2md-floating-root')) return;

    const defaults = {
      [STORAGE_KEYS.position]: null,
      [STORAGE_KEYS.theme]: 'light',
      [STORAGE_KEYS.mode]: 'main',
      [STORAGE_KEYS.removeImages]: false,
      [STORAGE_KEYS.localizeImages]: false,
      [STORAGE_KEYS.hidden]: true,
    };
    const stored = await storageGet(defaults);
    if (generation !== visibilityGeneration || stored[STORAGE_KEYS.hidden]) return;

    const host = document.createElement('div');
    host.id = 'page2md-floating-root';
    const shadow = host.attachShadow({ mode: 'open' });
    const position = stored[STORAGE_KEYS.position] || { right: 22, bottom: 82 };

    host.style.cssText = [
      'position:fixed',
      `right:${Math.max(8, Number(position.right) || 22)}px`,
      `bottom:${Math.max(8, Number(position.bottom) || 82)}px`,
      'z-index:2147483647',
      'font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap { --bg:#202522; --panel:#292f2b; --panel-2:#252b27; --border:#424b45; --text:#f4f6f2; --muted:#aeb8b0; --accent:#a9ddb4; --primary:#6fba84; --primary-text:#17341f; color:var(--text); font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:13px; line-height:1.4; }
        .wrap.light { --bg:#f6f7f3; --panel:#fff; --panel-2:#eef2ed; --border:#d4ddd5; --text:#1e2721; --muted:#58675d; --accent:#24623d; --primary:#24623d; --primary-text:#fff; }
        *, *::before, *::after { box-sizing:border-box; }
        button { font:inherit; }
        button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
        .fab { width:48px; height:48px; border:1px solid var(--border); border-radius:8px; background:var(--panel); color:var(--text); box-shadow:0 8px 24px rgba(0,0,0,.22); cursor:grab; display:grid; place-items:center; user-select:none; }
        .fab:active { cursor:grabbing; }
        .fab-mark { width:28px; height:30px; display:grid; place-items:center; }
        .fab-mark img { display:block; width:28px; height:30px; object-fit:contain; }
        .panel { position:absolute; right:0; bottom:58px; width:min(304px, calc(100vw - 16px)); max-height:calc(100vh - 24px); overflow:auto; padding:13px; border:1px solid var(--border); border-radius:9px; background:var(--panel); box-shadow:0 14px 34px rgba(0,0,0,.26); display:none; }
        .panel.open { display:block; }
        .head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .title { font-size:14px; font-weight:720; line-height:1.2; }
        .sub { margin-top:3px; font-size:11px; color:var(--muted); }
        .head-actions { display:flex; gap:5px; }
        .icon-btn { width:28px; height:28px; border:1px solid var(--border); border-radius:6px; background:transparent; color:var(--muted); cursor:pointer; }
        .status { margin-top:11px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 0; border-top:1px solid var(--border); border-bottom:1px solid var(--border); color:var(--muted); font-size:11px; }
        .dot { width:6px; height:6px; border-radius:50%; background:var(--accent); display:inline-block; margin-right:6px; }
        .group { margin-top:12px; }
        .label { color:var(--muted); font-size:11px; margin-bottom:7px; }
        .seg { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; padding:3px; border:1px solid var(--border); border-radius:7px; background:var(--panel-2); }
        .seg button { border:0; border-radius:5px; padding:7px 5px; color:var(--muted); background:transparent; cursor:pointer; font-size:11px; font-weight:650; }
        .seg button.active { color:var(--text); background:var(--panel); box-shadow:0 0 0 1px var(--accent); }
        .toggle-row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:11px; }
        .toggle-label { font-size:11px; color:var(--muted); }
        .switch { width:38px; height:22px; border-radius:999px; border:1px solid var(--border); background:var(--panel-2); position:relative; cursor:pointer; }
        .switch::after { content:""; position:absolute; top:3px; left:3px; width:14px; height:14px; border-radius:50%; background:var(--muted); transition:transform .16s,background .16s; }
        .switch.on { background:color-mix(in srgb, var(--accent) 18%, transparent); border-color:var(--accent); }
        .switch.on::after { transform:translateX(16px); background:var(--accent); }
        .hint { margin-top:8px; color:var(--muted); font-size:11px; line-height:1.4; }
        .actions { display:grid; grid-template-columns:1fr 1fr auto; gap:7px; margin-top:13px; }
        .action { border:1px solid var(--border); border-radius:6px; min-height:36px; padding:0 11px; cursor:pointer; font-size:12px; font-weight:700; }
        .primary { border-color:var(--primary); background:var(--primary); color:var(--primary-text); }
        .secondary, .mini { background:var(--panel-2); color:var(--text); }
        .mini { width:38px; padding:0; color:var(--muted); }
        .busy { opacity:.68; }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; } }
      </style>
      <div class="wrap">
        <button class="fab" type="button" title="打开页摘" aria-label="打开页摘" aria-expanded="false" aria-controls="page2md-floating-panel"><span class="fab-mark"><img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="" /></span></button>
        <section class="panel" id="page2md-floating-panel" aria-label="页摘快捷操作">
          <div class="head">
            <div><div class="title">页摘</div><div class="sub">网页摘录为 Markdown</div></div>
            <div class="head-actions"><button class="icon-btn theme" type="button" title="切换主题" aria-label="切换主题">◐</button><button class="icon-btn hide" type="button" title="关闭页面快捷入口" aria-label="关闭页面快捷入口">×</button></div>
          </div>
          <div class="status"><span><span class="dot"></span><span class="status-text" aria-live="polite">准备提取正文</span></span><span class="count">正文</span></div>
          <div class="group">
            <div class="label">提取范围</div>
            <div class="seg"><button type="button" data-mode="main" aria-pressed="false">正文</button><button type="button" data-mode="pick" aria-pressed="false">选择区域</button><button type="button" data-mode="full" aria-pressed="false">整页</button></div>
            <div class="toggle-row"><span class="toggle-label">移除图片链接</span><button class="switch images" type="button" role="switch" aria-checked="false" aria-label="移除图片链接"></button></div>
            <div class="hint">转换只在点击复制、下载或刷新时运行。</div>
          </div>
          <div class="actions"><button class="action primary download" type="button">保存 .md</button><button class="action secondary copy" type="button">复制</button><button class="action mini refresh" type="button" title="重新提取" aria-label="重新提取">↻</button></div>
        </section>
      </div>
    `;

    document.documentElement.appendChild(host);
    ui = {
      host,
      shadow,
      wrap: shadow.querySelector('.wrap'),
      fab: shadow.querySelector('.fab'),
      panel: shadow.querySelector('.panel'),
      count: shadow.querySelector('.count'),
      status: shadow.querySelector('.status-text'),
      buttons: Array.from(shadow.querySelectorAll('[data-mode]')),
      imageSwitch: shadow.querySelector('.images'),
      themeButton: shadow.querySelector('.theme'),
      hideButton: shadow.querySelector('.hide'),
      copyButton: shadow.querySelector('.copy'),
      downloadButton: shadow.querySelector('.download'),
      refreshButton: shadow.querySelector('.refresh'),
      resizeHandler: null,
      state: {
        open: false,
        dragging: false,
        moved: false,
        mode: normalizeMode(stored[STORAGE_KEYS.mode]),
        removeImages: stored[STORAGE_KEYS.removeImages],
        localizeImages: stored[STORAGE_KEYS.localizeImages],
        theme: stored[STORAGE_KEYS.theme],
        lastResult: null,
        busy: false,
      },
    };

    bindFloatingUi();
    bindStorageListener();
    clampHostPosition();
    renderFloatingUi();
  }

  function renderFloatingUi() {
    if (!ui) return;
    ui.wrap.classList.toggle('light', ui.state.theme === 'light');
    ui.panel.classList.toggle('open', ui.state.open);
    ui.fab.setAttribute('aria-expanded', String(ui.state.open));
    ui.fab.setAttribute('aria-busy', String(ui.state.busy));
    ui.panel.setAttribute('aria-busy', String(ui.state.busy));
    ui.buttons.forEach((button) => button.classList.toggle('active', button.dataset.mode === ui.state.mode));
    ui.imageSwitch.classList.toggle('on', ui.state.removeImages);
    ui.imageSwitch.setAttribute('aria-checked', String(ui.state.removeImages));
    ui.buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === ui.state.mode)));
    ui.count.textContent = ui.state.lastResult ? `${formatCount(ui.state.lastResult.charCount)} 字` : formatMode(ui.state.mode);
    [ui.fab, ui.themeButton, ui.hideButton, ui.copyButton, ui.downloadButton, ui.refreshButton, ...ui.buttons, ui.imageSwitch].forEach((control) => {
      if (control) control.disabled = ui.state.busy;
    });
    positionPanel();
  }

  function setUiBusy(busy) {
    if (!ui) return;
    ui.state.busy = busy;
    ui.panel.classList.toggle('busy', busy);
    renderFloatingUi();
  }

  function setUiStatus(message) {
    if (ui) ui.status.textContent = message;
  }

  function destroyFloatingUi(expectedUi = ui) {
    if (ui !== expectedUi) return;
    visibilityGeneration += 1;
    if (!ui) return;
    if (ui.resizeHandler) window.removeEventListener('resize', ui.resizeHandler);
    ui.host.remove();
    ui = null;
  }

  function getHostPosition() {
    clampHostPosition();
    const rect = ui.host.getBoundingClientRect();
    return {
      right: Math.max(8, window.innerWidth - rect.right),
      bottom: Math.max(8, window.innerHeight - rect.bottom),
    };
  }

  function clampHostPosition() {
    if (!ui?.host) return;
    const rect = ui.host.getBoundingClientRect();
    const position = MarkClipFloatingUtils.clampPosition({
      right: Number.parseFloat(ui.host.style.right),
      bottom: Number.parseFloat(ui.host.style.bottom),
    }, { width: window.innerWidth, height: window.innerHeight }, { width: rect.width, height: rect.height });
    ui.host.style.right = `${position.right}px`;
    ui.host.style.bottom = `${position.bottom}px`;
  }

  function positionPanel() {
    if (!ui?.panel || !ui.state.open) return;
    const margin = 8;
    const gap = 10;
    const hostRect = ui.host.getBoundingClientRect();
    const viewportHeight = Math.max(0, window.innerHeight - margin * 2);
    ui.panel.style.width = `${Math.min(304, Math.max(0, window.innerWidth - margin * 2))}px`;
    ui.panel.style.left = '0';
    ui.panel.style.top = '0';
    ui.panel.style.right = 'auto';
    ui.panel.style.bottom = 'auto';
    ui.panel.style.maxHeight = `${viewportHeight}px`;
    const naturalHeight = ui.panel.getBoundingClientRect().height;
    const above = Math.max(0, hostRect.top - gap - margin);
    const below = Math.max(0, window.innerHeight - hostRect.bottom - gap - margin);
    const openAbove = naturalHeight <= above || above >= below;
    const available = openAbove ? above : below;
    // On very short viewports, allow overlap with the launcher to keep the panel usable.
    ui.panel.style.maxHeight = `${available >= 48 ? Math.min(available, viewportHeight) : viewportHeight}px`;
    const rect = ui.panel.getBoundingClientRect();
    const left = Math.max(margin, Math.min(hostRect.right - rect.width, window.innerWidth - margin - rect.width));
    const preferredTop = openAbove ? hostRect.top - gap - rect.height : hostRect.bottom + gap;
    const top = Math.max(margin, Math.min(preferredTop, window.innerHeight - margin - rect.height));
    ui.panel.style.left = `${left - hostRect.left}px`;
    ui.panel.style.top = `${top - hostRect.top}px`;
  }

  function bindStorageListener() {
    if (storageListenerBound || !chrome.storage?.onChanged?.addListener) return;
    storageListenerBound = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes[STORAGE_KEYS.hidden]?.newValue) {
        destroyFloatingUi();
        return;
      }
      if (!ui) return;
      if (changes[STORAGE_KEYS.mode]) ui.state.mode = normalizeMode(changes[STORAGE_KEYS.mode].newValue);
      if (changes[STORAGE_KEYS.removeImages]) ui.state.removeImages = Boolean(changes[STORAGE_KEYS.removeImages].newValue);
      if (changes[STORAGE_KEYS.localizeImages]) ui.state.localizeImages = Boolean(changes[STORAGE_KEYS.localizeImages].newValue);
      if (changes[STORAGE_KEYS.theme]) ui.state.theme = changes[STORAGE_KEYS.theme].newValue === 'light' ? 'light' : 'dark';
      renderFloatingUi();
    });
  }

  function bindFloatingUi() {
    let startX = 0;
    let startY = 0;
    let startRight = 0;
    let startBottom = 0;

    ui.fab.addEventListener('pointerdown', (event) => {
      ui.state.dragging = true;
      ui.state.moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const rect = ui.host.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;
      ui.fab.setPointerCapture(event.pointerId);
    });

    ui.fab.addEventListener('pointermove', (event) => {
      if (!ui.state.dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) ui.state.moved = true;
      const position = MarkClipFloatingUtils.clampPosition({ right: startRight - dx, bottom: startBottom - dy }, {
        width: window.innerWidth,
        height: window.innerHeight,
      }, ui.host.getBoundingClientRect());
      ui.host.style.right = `${position.right}px`;
      ui.host.style.bottom = `${position.bottom}px`;
      positionPanel();
    });

    let suppressNextClick = false;

    async function finishPointer(event) {
      if (!ui?.state.dragging) return;
      ui.state.dragging = false;
      try { ui.fab.releasePointerCapture(event.pointerId); } catch (_err) { /* already released */ }
      if (ui.state.moved) {
        suppressNextClick = true;
        await storageSet({ [STORAGE_KEYS.position]: getHostPosition() });
        return;
      }
    }

    function cancelPointer(event) {
      if (!ui?.state.dragging) return;
      try { ui.fab.releasePointerCapture(event.pointerId); } catch (_err) { /* already released */ }
      ui.state.dragging = false;
      ui.state.moved = true;
      clampHostPosition();
      positionPanel();
    }

    ui.fab.addEventListener('pointerup', finishPointer);
    ui.fab.addEventListener('pointercancel', cancelPointer);
    ui.fab.addEventListener('lostpointercapture', cancelPointer);
    ui.fab.addEventListener('click', () => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      ui.state.open = !ui.state.open;
      renderFloatingUi();
      if (ui.state.open) ui.buttons[0]?.focus();
    });
    ui.resizeHandler = () => {
      clampHostPosition();
      positionPanel();
    };
    window.addEventListener('resize', ui.resizeHandler);

    ui.buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        ui.state.mode = button.dataset.mode;
        ui.state.lastResult = null;
        await storageSet({ [STORAGE_KEYS.mode]: ui.state.mode });
        setUiStatus(ui.state.mode === 'pick' ? '点击复制或保存后选择区域' : '准备提取正文');
        renderFloatingUi();
      });
    });

    ui.imageSwitch.addEventListener('click', async () => {
      ui.state.removeImages = !ui.state.removeImages;
      ui.state.lastResult = null;
      await storageSet({ [STORAGE_KEYS.removeImages]: ui.state.removeImages });
      setUiStatus(ui.state.removeImages ? '图片链接将被移除' : '图片链接将被保留');
      renderFloatingUi();
    });

    ui.themeButton.addEventListener('click', async () => {
      ui.state.theme = ui.state.theme === 'dark' ? 'light' : 'dark';
      await storageSet({ [STORAGE_KEYS.theme]: ui.state.theme });
      renderFloatingUi();
    });

    ui.hideButton.addEventListener('click', async () => {
      const currentUi = ui;
      destroyFloatingUi(currentUi);
      await storageSet({ [STORAGE_KEYS.hidden]: true });
      try {
        await chrome.runtime.sendMessage({ action: 'page2md:disableFloating' });
      } catch (_err) {
        // The UI is already hidden; the popup can retry permission cleanup.
      }
    });

    ui.refreshButton.addEventListener('click', () => runFloatingAction('refresh'));
    ui.copyButton.addEventListener('click', () => runFloatingAction('copy'));
    ui.downloadButton.addEventListener('click', () => runFloatingAction('download'));
    ui.panel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || ui.state.busy) return;
      event.preventDefault();
      ui.state.open = false;
      renderFloatingUi();
      ui.fab.focus();
    });
  }

  async function getFloatingMarkdown() {
    const stored = await storageGet({ [STORAGE_KEYS.localizeImages]: false });
    ui.state.localizeImages = Boolean(stored[STORAGE_KEYS.localizeImages]);
    if (ui.state.mode === 'pick') {
      const result = await window.MarkClipPick.pickMarkdown({
        closePanel: () => {
          ui.state.open = false;
          renderFloatingUi();
        },
        message: '点击页面区域，可多选后完成',
        removeImages: ui.state.removeImages,
        localizeImages: ui.state.localizeImages,
        setStatus: setUiStatus,
        uiHost: ui.host,
      });
      ui.state.lastResult = result;
      setUiStatus(result.warnings?.[0] || '选择区域 · 已提取');
      renderFloatingUi();
      return result;
    }

    const result = await window.MarkClipExtractor.buildMarkdown({
      mode: ui.state.mode,
      removeImages: ui.state.removeImages,
      localizeImages: ui.state.localizeImages,
    });
    ui.state.lastResult = result;
    setUiStatus(result.warnings?.[0] || `${result.source} · 已提取`);
    renderFloatingUi();
    return result;
  }

  async function runFloatingAction(action) {
    if (!ui || ui.state.busy) return;
    setUiBusy(true);
    setUiStatus('正在提取…');
    try {
      const result = await getFloatingMarkdown();
      if (action === 'copy') {
        await window.MarkClipExtractor.copyMarkdown(result.markdown);
        setUiStatus('已复制到剪贴板');
      } else if (action === 'download') {
        window.MarkClipExtractor.downloadMarkdown(result.markdown, result.title);
        setUiStatus('已开始下载');
      }
    } catch (err) {
      setUiStatus(err.message || '提取失败');
    } finally {
      setUiBusy(false);
    }
  }

  async function showFloating() {
    const generation = visibilityGeneration;
    await storageSet({ [STORAGE_KEYS.hidden]: false });
    if (generation !== visibilityGeneration) return;
    await createFloatingUi();
  }

  async function hideFloating() {
    destroyFloatingUi();
    await storageSet({ [STORAGE_KEYS.hidden]: true });
  }

  function getUiHost() {
    return ui?.host || null;
  }

  window.MarkClipFloating = {
    createFloatingUi,
    getUiHost,
    hideFloating,
    setStatus: setUiStatus,
    showFloating,
  };
})();
