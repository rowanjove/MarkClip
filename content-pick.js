(function () {
  if (window.MarkClipPick) return;

  const { cleanClone, markdownFromElement, textLength } = window.MarkClipExtractor;
  const { mergePickSelection } = window.MarkClipPickSelection;
  let activePickMode = false;

  function getPickCandidate(target, uiHost) {
    if (!(target instanceof Element)) return null;
    if (uiHost && (target === uiHost || uiHost.contains(target))) return null;

    const preferred = target.closest('article, main, section, pre, table, blockquote, ul, ol, div, p');
    let node = preferred || target;

    while (node && node !== document.body && textLength(node) < 40) {
      node = node.parentElement;
    }

    if (!node || node === document.documentElement) return null;
    return node;
  }

  function ensurePickOverlay() {
    let overlay = document.getElementById('markclip-pick-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'markclip-pick-overlay';
    overlay.style.cssText = [
      'position:fixed',
      'z-index:2147483646',
      'pointer-events:none',
      'border:2px solid #2aa8ff',
      'background:rgba(42,168,255,.10)',
      'box-shadow:0 0 0 99999px rgba(7,16,28,.18),0 12px 34px rgba(0,0,0,.28)',
      'border-radius:10px',
      'display:none',
    ].join(';');
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function ensurePickTip() {
    let tip = document.getElementById('markclip-pick-tip');
    if (tip) return tip;

    tip = document.createElement('div');
    tip.id = 'markclip-pick-tip';
    tip.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'left:50%',
      'top:18px',
      'transform:translateX(-50%)',
      'padding:8px 13px',
      'border-radius:999px',
      'background:#111827',
      'color:#f2f6fb',
      'font:700 12px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 10px 28px rgba(0,0,0,.28)',
      'border:1px solid rgba(148,163,184,.18)',
    ].join(';');
    document.documentElement.appendChild(tip);
    return tip;
  }

  function highlightPickTarget(target, overlay) {
    if (!target) {
      overlay.style.display = 'none';
      return;
    }

    const rect = target.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = `${Math.max(0, rect.left)}px`;
    overlay.style.top = `${Math.max(0, rect.top)}px`;
    overlay.style.width = `${Math.max(0, rect.width)}px`;
    overlay.style.height = `${Math.max(0, rect.height)}px`;
  }

  function startPickMode(options = {}) {
    if (activePickMode) {
      return Promise.reject(new Error('已有框选正在进行，请先完成或取消。'));
    }

    return new Promise((resolve, reject) => {
      const overlay = ensurePickOverlay();
      const tip = ensurePickTip();
      activePickMode = true;
      let selected = [];
      let selectedMarkers = [];
      let currentTarget = null;

      tip.innerHTML = '<span>点击区域可多选</span><button type="button" data-action="done">完成</button><button type="button" data-action="cancel">取消</button>';
      tip.style.display = 'flex';
      tip.style.alignItems = 'center';
      tip.style.gap = '8px';
      tip.querySelectorAll('button').forEach((button) => {
        button.style.cssText = [
          'border:0',
          'border-radius:999px',
          'padding:4px 9px',
          'background:#2aa8ff',
          'color:#fff',
          'font:700 12px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
          'cursor:pointer',
        ].join(';');
      });
      tip.querySelector('[data-action="cancel"]').style.background = '#273244';

      function updateTip(message) {
        tip.querySelector('span').textContent = message || (
          selected.length
            ? `已选 ${selected.length} 个区域，继续点选或完成`
            : '点击页面区域可多选，完成后导出'
        );
      }

      function updateMarker(marker) {
        const rect = marker.target.getBoundingClientRect();
        marker.node.style.left = `${Math.max(0, rect.left)}px`;
        marker.node.style.top = `${Math.max(0, rect.top)}px`;
        marker.node.style.width = `${Math.max(0, rect.width)}px`;
        marker.node.style.height = `${Math.max(0, rect.height)}px`;
      }

      function updateSelectedMarkers() {
        selectedMarkers.forEach(updateMarker);
      }

      function createMarker(target) {
        const marker = document.createElement('div');
        marker.style.cssText = [
          'position:fixed',
          'z-index:2147483645',
          'pointer-events:none',
          'border:2px solid #2ee6a6',
          'background:rgba(46,230,166,.08)',
          'border-radius:10px',
        ].join(';');
        document.documentElement.appendChild(marker);
        const markerEntry = { target, node: marker };
        updateMarker(markerEntry);
        return markerEntry;
      }

      function redrawSelectedMarkers() {
        selectedMarkers.forEach((item) => item.node.remove());
        selectedMarkers = selected.map(createMarker);
      }

      function addSelected(target) {
        const nextSelected = mergePickSelection(selected, target);
        if (nextSelected.length === selected.length && nextSelected.every((item, index) => item === selected[index])) {
          updateTip();
          return;
        }

        selected = nextSelected;
        redrawSelectedMarkers();
        updateTip();
      }

      function finish() {
        if (selected.length === 0) {
          updateTip('请先点击至少一个区域');
          return;
        }
        const wrapper = document.createElement('article');
        selected.forEach((target, index) => {
          if (index > 0) wrapper.appendChild(document.createElement('hr'));
          wrapper.appendChild(cleanClone(target));
        });
        cleanup();
        resolve(wrapper);
      }

      function cleanup() {
        activePickMode = false;
        overlay.remove();
        tip.remove();
        selectedMarkers.forEach((item) => item.node.remove());
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('scroll', updateSelectedMarkers, true);
        window.removeEventListener('resize', updateSelectedMarkers, true);
      }

      function onMove(event) {
        currentTarget = getPickCandidate(event.target, options.uiHost);
        highlightPickTarget(currentTarget, overlay);
      }

      function onClick(event) {
        const action = event.target?.dataset?.action;
        if (action === 'done') {
          event.preventDefault();
          event.stopPropagation();
          finish();
          return;
        }
        if (action === 'cancel') {
          event.preventDefault();
          event.stopPropagation();
          cleanup();
          reject(new Error('已取消框选。'));
          return;
        }
        if (!currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        addSelected(currentTarget);
      }

      function onKeyDown(event) {
        if (event.key === 'Enter' && selected.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          finish();
          return;
        }
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        cleanup();
        reject(new Error('已取消框选。'));
      }

      updateTip();
      options.setStatus?.(options.message || '点击页面区域，可多选后完成');
      options.closePanel?.();
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('scroll', updateSelectedMarkers, true);
      window.addEventListener('resize', updateSelectedMarkers, true);
    });
  }

  async function pickMarkdown(options = {}) {
    const target = await startPickMode(options);
    return markdownFromElement(cleanClone(target), {
      title: document.title,
      source: '框选',
      removeImages: options.removeImages,
    });
  }

  window.MarkClipPick = {
    pickMarkdown,
    startPickMode,
  };
})();
