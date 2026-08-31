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

    if (!node || node === document.documentElement || node === document.body) return null;
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
      'border:2px solid #6fba84',
      'background:rgba(111,186,132,.11)',
      'box-shadow:0 0 0 99999px rgba(22,29,24,.14)',
      'border-radius:4px',
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
      'top:14px',
      'transform:translateX(-50%)',
      'padding:8px 10px',
      'border-radius:6px',
      'background:#202522',
      'color:#f4f6f2',
      'font:600 12px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 8px 22px rgba(0,0,0,.20)',
      'border:1px solid #424b45',
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
      return Promise.reject(new Error('已有选择区域正在进行，请先完成或取消。'));
    }

    return new Promise((resolve, reject) => {
      const overlay = ensurePickOverlay();
      const tip = ensurePickTip();
      activePickMode = true;
      let selected = [];
      let selectedMarkers = [];
      let currentTarget = null;

      tip.innerHTML = '<span>选择要保留的区域</span><button type="button" data-action="done">完成</button><button type="button" data-action="cancel">取消</button>';
      tip.style.display = 'flex';
      tip.style.alignItems = 'center';
      tip.style.gap = '8px';
      tip.querySelectorAll('button').forEach((button) => {
        button.style.cssText = [
          'border:0',
          'border-radius:4px',
          'padding:4px 8px',
          'background:#6fba84',
          'color:#17341f',
          'font:700 12px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
          'cursor:pointer',
        ].join(';');
      });
      tip.querySelector('[data-action="cancel"]').style.cssText += ';background:#303833;color:#f4f6f2;border:1px solid #424b45';

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
          'border:2px solid #6fba84',
          'background:rgba(111,186,132,.08)',
          'border-radius:4px',
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
          wrapper.appendChild(cleanClone(target, { profile: 'pick' }));
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
        if (tip.contains(event.target)) {
          currentTarget = null;
          highlightPickTarget(null, overlay);
          return;
        }
        currentTarget = getPickCandidate(event.target, options.uiHost);
        highlightPickTarget(currentTarget, overlay);
      }

      function onClick(event) {
        const actionTarget = event.target?.closest?.('[data-action]');
        const action = actionTarget && tip.contains(actionTarget) ? actionTarget.dataset.action : null;
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
          reject(new Error('已取消选择区域。'));
          return;
        }
        if (tip.contains(event.target)) return;
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
        reject(new Error('已取消选择区域。'));
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
    return markdownFromElement(cleanClone(target, { profile: 'pick' }), {
      title: document.title,
      source: '选择区域',
      removeImages: options.removeImages,
      localizeImages: options.localizeImages,
    });
  }

  window.MarkClipPick = {
    pickMarkdown,
    startPickMode,
  };
})();
