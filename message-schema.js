(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipMessages = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ACTIONS = new Set([
    'getMarkdown',
    'page2md:ensureLibraries',
    'page2md:ping',
    'page2md:libsReady',
    'page2md:showFloating',
    'page2md:hideFloating',
    'page2md:disableFloating',
    'page2md:startPick',
    'page2md:downloadMarkdown',
    'page2md:copyMarkdown',
    'page2md:cancel',
  ]);
  const MODES = new Set(['main', 'full', 'selection', 'pick']);

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isKnownAction(action) {
    return typeof action === 'string' && ACTIONS.has(action);
  }

  function isValidMessage(message) {
    if (!isRecord(message) || !isKnownAction(message.action)) return false;
    if (message.mode !== undefined && !MODES.has(message.mode)) return false;
    if (message.after !== undefined && !['copy', 'download'].includes(message.after)) return false;
    if (message.id !== undefined && (typeof message.id !== 'string' || message.id.length > 120)) return false;
    if (message.action === 'page2md:cancel' && typeof message.id !== 'string') return false;
    if (message.removeImages !== undefined && typeof message.removeImages !== 'boolean') return false;
    if (message.localizeImages !== undefined && typeof message.localizeImages !== 'boolean') return false;
    if (['page2md:downloadMarkdown', 'page2md:copyMarkdown'].includes(message.action) && typeof message.markdown !== 'string') return false;
    return true;
  }

  return { ACTIONS, MODES, isKnownAction, isValidMessage };
});
