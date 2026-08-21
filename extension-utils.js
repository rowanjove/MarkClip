(function (root) {
  const BOOTSTRAP_FILES = [
    'page2md-core.js',
    'url-utils.js',
    'code-block-utils.js',
    'message-schema.js',
    'clip-contract.js',
    'template-utils.js',
    'site-rules.js',
    'math-utils.js',
    'image-utils.js',
    'floating-utils.js',
    'pick-selection.js',
    'content-extractor.js',
    'content-pick.js',
    'content-floating.js',
    'content.js',
  ];
  const LIBRARY_FILES = ['lib/turndown.js', 'lib/readability.js'];
  const DYNAMIC_CONTENT_SCRIPT_ID = 'markclip-floating';
  const bootstrapLocks = new Map();
  const libraryLocks = new Map();

  function sendTabMessage(tabId, message, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('页面响应超时，请刷新页面后重试。')), timeoutMs);
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async function isContentScriptReady(tabId) {
    try {
      const response = await sendTabMessage(tabId, { action: 'page2md:ping' });
      return Boolean(response?.success);
    } catch (_err) {
      return false;
    }
  }

  async function ensureContentScripts(tabId) {
    await ensureBootstrap(tabId);

    await ensureLibraries(tabId);
  }

  async function ensureBootstrap(tabId) {
    if (bootstrapLocks.has(tabId)) return bootstrapLocks.get(tabId);
    const promise = (async () => {
      if (await isContentScriptReady(tabId)) return;

      await chrome.scripting.executeScript({
        target: { tabId },
        files: BOOTSTRAP_FILES,
      });
    })();
    bootstrapLocks.set(tabId, promise);
    try {
      await promise;
    } finally {
      bootstrapLocks.delete(tabId);
    }
  }

  async function ensureLibraries(tabId) {
    if (libraryLocks.has(tabId)) return libraryLocks.get(tabId);
    const promise = (async () => {
      try {
        const response = await sendTabMessage(tabId, { action: 'page2md:libsReady' });
        if (response?.success) return;
      } catch (_err) {
        // The bootstrap content script may not exist yet.
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        files: LIBRARY_FILES,
      });
    })();
    libraryLocks.set(tabId, promise);
    try {
      await promise;
    } finally {
      libraryLocks.delete(tabId);
    }
  }

  async function registerFloatingContentScript() {
    if (!chrome.scripting?.registerContentScripts) return;
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [DYNAMIC_CONTENT_SCRIPT_ID] });
    if (existing.length) return;
    await chrome.scripting.registerContentScripts([{
      id: DYNAMIC_CONTENT_SCRIPT_ID,
      matches: ['<all_urls>'],
      js: BOOTSTRAP_FILES,
      runAt: 'document_idle',
      persistAcrossSessions: true,
    }]);
  }

  async function unregisterFloatingContentScript() {
    if (!chrome.scripting?.unregisterContentScripts) return;
    await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_CONTENT_SCRIPT_ID] });
  }

  async function disableFloatingEverywhere() {
    const tabs = chrome.tabs?.query ? await chrome.tabs.query({}) : [];
    await Promise.allSettled(tabs
      .filter((tab) => tab.id !== undefined && tab.id !== null)
      .map((tab) => sendTabMessage(tab.id, { action: 'page2md:hideFloating' }, 1000)));
    await unregisterFloatingContentScript();
    if (chrome.permissions?.remove) await chrome.permissions.remove({ origins: ['<all_urls>'] });
  }

  root.Page2MDExtension = {
    BOOTSTRAP_FILES,
    LIBRARY_FILES,
    DYNAMIC_CONTENT_SCRIPT_ID,
    disableFloatingEverywhere,
    ensureBootstrap,
    ensureContentScripts,
    ensureLibraries,
    registerFloatingContentScript,
    unregisterFloatingContentScript,
    sendTabMessage,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
