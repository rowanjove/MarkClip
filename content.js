// Bootstrap and message routing for MarkClip's lightweight content layer.

(function () {
  if (window.__markclip_initialized) return;
  window.__markclip_initialized = true;

  const { buildMarkdown, copyMarkdown, downloadMarkdown, librariesReady } = window.MarkClipExtractor;

  async function runDetachedPickAction(action, removeImages) {
    const result = await window.MarkClipPick.pickMarkdown({
      message: '点击页面区域，可多选后完成',
      removeImages,
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
    if (msg.action === 'page2md:ping') {
      sendResponse({ success: true });
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
          const result = await runDetachedPickAction(msg.after, Boolean(msg.removeImages));
          sendResponse({
            success: true,
            markdown: result.markdown,
            title: result.title,
            charCount: result.charCount,
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

    (async () => {
      try {
        const result = await buildMarkdown({
          mode: msg.mode,
          removeImages: Boolean(msg.removeImages),
        });
        sendResponse({
          success: true,
          markdown: result.markdown,
          title: result.title,
          charCount: result.charCount,
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true;
  });

  window.MarkClipFloating.createFloatingUi().catch((err) => {
    console.error('[MarkClip] Failed to create floating UI:', err);
  });
})();
