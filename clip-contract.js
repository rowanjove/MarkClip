(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipContract = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MODES = new Set(['main', 'full', 'selection', 'pick']);

  function normalizeMode(mode) {
    const value = mode === 'selection' ? 'pick' : (mode || 'main');
    return MODES.has(value) ? value : 'main';
  }

  function createClipRequest(input = {}) {
    return Object.freeze({
      mode: normalizeMode(input.mode),
      removeImages: Boolean(input.removeImages),
      url: String(input.url || ''),
      options: input.options && typeof input.options === 'object' ? { ...input.options } : {},
    });
  }

  function createClipResult(input = {}) {
    return Object.freeze({
      markdown: String(input.markdown || ''),
      title: String(input.title || 'page'),
      source: String(input.source || '未知'),
      charCount: Number.isFinite(input.charCount) ? input.charCount : String(input.markdown || '').length,
      warnings: Array.isArray(input.warnings) ? [...input.warnings] : [],
      timings: input.timings && typeof input.timings === 'object' ? { ...input.timings } : {},
      diagnostics: input.diagnostics && typeof input.diagnostics === 'object' ? { ...input.diagnostics } : {},
    });
  }

  return { MODES, createClipRequest, createClipResult, normalizeMode };
});
