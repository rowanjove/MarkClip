(function () {
  if (window.MarkClipFloating) return;

  const STORAGE_KEYS = {
    position: 'page2md:floatingPosition',
    theme: 'page2md:theme',
    mode: 'page2md:mode',
    removeImages: 'page2md:removeImages',
    hidden: 'page2md:floatingHidden',
  };
  let ui;

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
    if (mode === 'pick') return '框选';
    if (mode === 'full') return '全页';
    return '主内容';
  }

  function normalizeMode(mode) {
    return mode === 'selection' ? 'pick' : (mode || 'main');
  }

  async function createFloatingUi() {
    if (ui || document.getElementById('page2md-floating-root')) return;

    const defaults = {
      [STORAGE_KEYS.position]: null,
      [STORAGE_KEYS.theme]: 'dark',
      [STORAGE_KEYS.mode]: 'main',
      [STORAGE_KEYS.removeImages]: false,
      [STORAGE_KEYS.hidden]: false,
    };
    const stored = await storageGet(defaults);
    if (stored[STORAGE_KEYS.hidden]) return;

    const host = document.createElement('div');
    host.id = 'page2md-floating-root';
    const shadow = host.attachShadow({ mode: 'open' });
    const position = stored[STORAGE_KEYS.position] || { right: 22, bottom: 82 };

    host.style.cssText = [
      'position:fixed',
      `right:${Math.max(8, position.right)}px`,
      `bottom:${Math.max(8, position.bottom)}px`,
      'z-index:2147483647',
      'font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap { --bg:#0b1220; --panel:#111827; --panel-2:#182232; --border:rgba(148,163,184,.18); --text:#f2f6fb; --muted:#93a4b8; --accent:#2ee6a6; --primary:#2aa8ff; --primary-text:#fff; color:var(--text); font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        .wrap.light { --bg:#f8fafc; --panel:#fff; --panel-2:#eef4fb; --border:rgba(15,23,42,.12); --text:#172033; --muted:#637084; --accent:#0fae7a; --primary:#138ff2; --primary-text:#fff; }
        button { font: inherit; }
        .fab { width:52px; height:52px; border:1px solid var(--border); border-radius:18px; background:linear-gradient(145deg,var(--panel),var(--bg)); color:var(--text); box-shadow:0 16px 42px rgba(0,0,0,.30); cursor:grab; display:grid; place-items:center; user-select:none; }
        .fab:active { cursor:grabbing; }
        .fab-mark { width:31px; height:31px; border-radius:12px; background:rgba(46,230,166,.16); color:var(--accent); display:grid; place-items:center; font-size:13px; font-weight:800; letter-spacing:.2px; }
        .panel { position:absolute; right:0; bottom:62px; width:300px; padding:14px; border:1px solid var(--border); border-radius:18px; background:linear-gradient(180deg,var(--panel),var(--bg)); box-shadow:0 22px 60px rgba(0,0,0,.36); display:none; }
        .panel.open { display:block; }
        .head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .title { font-size:15px; font-weight:760; line-height:1.2; }
        .sub { margin-top:4px; font-size:12px; color:var(--muted); }
        .icon-btn { width:30px; height:30px; border:1px solid var(--border); border-radius:12px; background:var(--panel-2); color:var(--muted); cursor:pointer; }
        .status { margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 11px; border-radius:14px; background:rgba(46,230,166,.12); border:1px solid rgba(46,230,166,.22); color:var(--accent); font-size:12px; font-weight:700; }
        .dot { width:7px; height:7px; border-radius:50%; background:var(--accent); display:inline-block; margin-right:7px; }
        .group { margin-top:13px; padding:12px; border-radius:14px; background:rgba(127,143,166,.08); border:1px solid var(--border); }
        .label { color:var(--muted); font-size:12px; margin-bottom:9px; }
        .seg { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; padding:4px; border-radius:14px; background:var(--panel-2); }
        .seg button { border:0; border-radius:11px; padding:8px 6px; color:var(--muted); background:transparent; cursor:pointer; font-size:12px; font-weight:700; }
        .seg button.active { color:var(--primary-text); background:rgba(42,168,255,.32); box-shadow:inset 0 0 0 1px rgba(42,168,255,.28); }
        .toggle-row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:12px; }
        .toggle-label { font-size:12px; color:var(--muted); }
        .switch { width:46px; height:26px; border-radius:999px; border:1px solid var(--border); background:var(--panel-2); position:relative; cursor:pointer; }
        .switch::after { content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%; background:var(--muted); transition:transform .16s,background .16s; }
        .switch.on { background:rgba(46,230,166,.16); border-color:rgba(46,230,166,.35); }
        .switch.on::after { transform:translateX(20px); background:var(--accent); }
        .hint { margin-top:9px; color:var(--muted); font-size:12px; line-height:1.5; }
        .actions { display:grid; grid-template-columns:1fr 1fr auto; gap:9px; margin-top:14px; }
        .action { border:0; border-radius:999px; min-height:42px; padding:0 15px; cursor:pointer; font-size:13px; font-weight:800; }
        .primary { background:var(--primary); color:var(--primary-text); }
        .secondary { background:var(--panel-2); color:var(--text); }
        .mini { width:46px; padding:0; background:var(--panel-2); color:var(--muted); }
        .busy { opacity:.68; pointer-events:none; }
      </style>
      <div class="wrap">
        <button class="fab" type="button" title="MarkClip"><span class="fab-mark">MC</span></button>
        <section class="panel" aria-label="MarkClip">
          <div class="head">
            <div><div class="title">MarkClip</div><div class="sub">网页正文，一键转 Markdown</div></div>
            <div><button class="icon-btn theme" type="button" title="深浅色切换">◐</button><button class="icon-btn hide" type="button" title="隐藏悬浮按钮">×</button></div>
          </div>
          <div class="status"><span><span class="dot"></span><span class="status-text">可导出当前内容</span></span><span class="count">主内容</span></div>
          <div class="group">
            <div class="label">导出模式</div>
            <div class="seg"><button type="button" data-mode="main">主内容</button><button type="button" data-mode="pick">框选</button><button type="button" data-mode="full">全页</button></div>
            <div class="toggle-row"><span class="toggle-label">移除图片链接，减少 token</span><button class="switch images" type="button" aria-label="移除图片"></button></div>
            <div class="hint">转换只在点击复制、下载或刷新时运行。</div>
          </div>
          <div class="actions"><button class="action primary download" type="button">下载</button><button class="action secondary copy" type="button">复制</button><button class="action mini refresh" type="button" title="刷新">↻</button></div>
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
      state: {
        open: false,
        dragging: false,
        moved: false,
        mode: normalizeMode(stored[STORAGE_KEYS.mode]),
        removeImages: stored[STORAGE_KEYS.removeImages],
        theme: stored[STORAGE_KEYS.theme],
        lastResult: null,
      },
    };

    bindFloatingUi();
    renderFloatingUi();
  }

  function renderFloatingUi() {
    if (!ui) return;
    ui.wrap.classList.toggle('light', ui.state.theme === 'light');
    ui.panel.classList.toggle('open', ui.state.open);
    ui.buttons.forEach((button) => button.classList.toggle('active', button.dataset.mode === ui.state.mode));
    ui.imageSwitch.classList.toggle('on', ui.state.removeImages);
    ui.count.textContent = ui.state.lastResult ? `${formatCount(ui.state.lastResult.charCount)} 字` : formatMode(ui.state.mode);
  }

  function setUiBusy(busy) {
    ui?.panel.classList.toggle('busy', busy);
  }

  function setUiStatus(message) {
    if (ui) ui.status.textContent = message;
  }

  function getHostPosition() {
    const rect = ui.host.getBoundingClientRect();
    return {
      right: Math.max(8, window.innerWidth - rect.right),
      bottom: Math.max(8, window.innerHeight - rect.bottom),
    };
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
      ui.host.style.right = `${Math.max(8, startRight - dx)}px`;
      ui.host.style.bottom = `${Math.max(8, startBottom - dy)}px`;
    });

    ui.fab.addEventListener('pointerup', async (event) => {
      ui.fab.releasePointerCapture(event.pointerId);
      ui.state.dragging = false;
      if (ui.state.moved) {
        await storageSet({ [STORAGE_KEYS.position]: getHostPosition() });
        return;
      }

      ui.state.open = !ui.state.open;
      renderFloatingUi();
    });

    ui.buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        ui.state.mode = button.dataset.mode;
        ui.state.lastResult = null;
        await storageSet({ [STORAGE_KEYS.mode]: ui.state.mode });
        setUiStatus(ui.state.mode === 'pick' ? '点击复制或下载后框选区域' : '可导出当前内容');
        renderFloatingUi();
      });
    });

    ui.imageSwitch.addEventListener('click', async () => {
      ui.state.removeImages = !ui.state.removeImages;
      ui.state.lastResult = null;
      await storageSet({ [STORAGE_KEYS.removeImages]: ui.state.removeImages });
      setUiStatus(ui.state.removeImages ? '将移除图片链接' : '将保留图片链接');
      renderFloatingUi();
    });

    ui.themeButton.addEventListener('click', async () => {
      ui.state.theme = ui.state.theme === 'dark' ? 'light' : 'dark';
      await storageSet({ [STORAGE_KEYS.theme]: ui.state.theme });
      renderFloatingUi();
    });

    ui.hideButton.addEventListener('click', async () => {
      await storageSet({ [STORAGE_KEYS.hidden]: true });
      ui.host.remove();
      ui = null;
    });

    ui.refreshButton.addEventListener('click', () => runFloatingAction('refresh'));
    ui.copyButton.addEventListener('click', () => runFloatingAction('copy'));
    ui.downloadButton.addEventListener('click', () => runFloatingAction('download'));
  }

  async function getFloatingMarkdown() {
    if (ui.state.mode === 'pick') {
      const result = await window.MarkClipPick.pickMarkdown({
        closePanel: () => {
          ui.state.open = false;
          renderFloatingUi();
        },
        message: '点击页面区域，可多选后完成',
        removeImages: ui.state.removeImages,
        setStatus: setUiStatus,
        uiHost: ui.host,
      });
      ui.state.lastResult = result;
      setUiStatus('框选区域 · 已提取');
      renderFloatingUi();
      return result;
    }

    const result = await window.MarkClipExtractor.buildMarkdown({
      mode: ui.state.mode,
      removeImages: ui.state.removeImages,
    });
    ui.state.lastResult = result;
    setUiStatus(`${result.source} · 已提取`);
    renderFloatingUi();
    return result;
  }

  async function runFloatingAction(action) {
    if (!ui) return;
    setUiBusy(true);
    setUiStatus('正在提取...');
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
    await storageSet({ [STORAGE_KEYS.hidden]: false });
    await createFloatingUi();
  }

  async function hideFloating() {
    await storageSet({ [STORAGE_KEYS.hidden]: true });
    ui?.host.remove();
    ui = null;
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
