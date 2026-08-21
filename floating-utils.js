(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipFloatingUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clampPosition(position = {}, viewport = {}, size = {}) {
    const width = Math.max(0, Number(size.width) || 52);
    const height = Math.max(0, Number(size.height) || 52);
    const viewportWidth = Math.max(16, Number(viewport.width) || 16);
    const viewportHeight = Math.max(16, Number(viewport.height) || 16);
    const maxRight = Math.max(8, viewportWidth - Math.min(width, viewportWidth - 16));
    const maxBottom = Math.max(8, viewportHeight - Math.min(height, viewportHeight - 16));
    return {
      right: Math.min(maxRight, Math.max(8, Number(position.right) || 22)),
      bottom: Math.min(maxBottom, Math.max(8, Number(position.bottom) || 82)),
    };
  }

  return { clampPosition };
});
