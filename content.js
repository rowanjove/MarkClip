// Bootstrap and message routing for MarkClip's lightweight content layer.

(function () {
  if (window.__markclip_initialized) return;
  window.__markclip_initialized = true;

  const { buildMarkdown, copyMarkdown, downloadMarkdown, librariesReady } = window.MarkClipExtractor;
  const activeOperations = new Map();

  async function runDetachedPickAction(action, removeImages, localizeImages) {
    const result = await window.MarkClipPick.pickMarkdown({
      message: '点击页面区域，可多选后完成',
      removeImages,
      localizeImages,
      setStatus: window.MarkClipFloating.setStatus,
      uiHost: window.MarkClipFloating.getUiHost(),
    });

    if (action === 'copy') {
      await copyMarkdown(result.markdown);
      window.MarkClipFloating.setStatus('已复制到剪贴板');
    } else if (action === 'download') {
      downloadMarkdown(result.markdown, result.title);
      window.MarkClipFloating.setStatus('已开始下载');
    }

    return result;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!window.MarkClipMessages?.isValidMessage(msg)) {
      sendResponse({ success: false, error: '无效的转换请求。' });
      return false;
    }

    if (msg.action === 'page2md:ping') {
      sendResponse({ success: true });
      return false;
    }

    if (msg.action === 'page2md:cancel') {
      const operation = activeOperations.get(msg.id);
      if (operation) operation.abort();
      sendResponse({ success: Boolean(operation) });
      return false;
    }

    if (msg.action === 'page2md:libsReady') {
      sendResponse({ success: librariesReady() });
      return false;
    }

    if (msg.action === 'page2md:showFloating') {
      (async () => {
        try {
          await window.MarkClipFloating.showFloating();
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    if (msg.action === 'page2md:hideFloating') {
      (async () => {
        try {
          await window.MarkClipFloating.hideFloating();
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    if (msg.action === 'page2md:startPick') {
      (async () => {
        try {
          const result = await runDetachedPickAction(msg.after, Boolean(msg.removeImages), Boolean(msg.localizeImages));
          sendResponse({
            success: true,
            markdown: result.markdown,
            title: result.title,
            source: result.source,
            charCount: result.charCount,
            warnings: result.warnings || [],
            timings: result.timings || {},
            diagnostics: result.diagnostics || {},
          });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    if (msg.action === 'page2md:downloadMarkdown') {
      try {
        downloadMarkdown(msg.markdown, msg.title || document.title || 'page');
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return false;
    }

    if (msg.action === 'page2md:copyMarkdown') {
      (async () => {
        try {
          await copyMarkdown(msg.markdown);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    if (msg.action !== 'getMarkdown') return false;

    const operationId = msg.id || `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const controller = new AbortController();
    activeOperations.set(operationId, controller);
    (async () => {
      try {
        const result = await buildMarkdown({
          mode: msg.mode,
          removeImages: Boolean(msg.removeImages),
          localizeImages: Boolean(msg.localizeImages),
          signal: controller.signal,
        });
        sendResponse({
          success: true,
          markdown: result.markdown,
          title: result.title,
          source: result.source,
          charCount: result.charCount,
          warnings: result.warnings || [],
          timings: result.timings || {},
          diagnostics: result.diagnostics || {},
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      } finally {
        activeOperations.delete(operationId);
      }
    })();

    return true;
  });

  window.MarkClipFloating.createFloatingUi().catch((err) => {
    console.error('[MarkClip] Failed to create floating UI:', err);
  });
})();
