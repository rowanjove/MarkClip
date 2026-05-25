(function (root) {
  const BOOTSTRAP_FILES = [
    'page2md-core.js',
    'pick-selection.js',
    'content-extractor.js',
    'content-pick.js',
    'content-floating.js',
    'content.js',
  ];
  const LIBRARY_FILES = ['lib/turndown.js', 'lib/readability.js'];

  function sendTabMessage(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
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
    if (await isContentScriptReady(tabId)) return;

    await chrome.scripting.executeScript({
      target: { tabId },
      files: BOOTSTRAP_FILES,
    });
  }

  async function ensureLibraries(tabId) {
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
  }

  root.Page2MDExtension = {
    BOOTSTRAP_FILES,
    LIBRARY_FILES,
    ensureBootstrap,
    ensureContentScripts,
    ensureLibraries,
    sendTabMessage,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
