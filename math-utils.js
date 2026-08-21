(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipMath = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function extractMathSource(node) {
    if (!node) return '';
    const annotation = node.querySelector?.('annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"]');
    return String(annotation?.textContent || node.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function renderMath(node) {
    const source = extractMathSource(node);
    if (!source) return '';
    const display = String(node.getAttribute?.('display') || '').toLowerCase() === 'block' || node.nodeName === 'MARKCLIP-MATH-BLOCK';
    return display ? `\n\n$$\n${source}\n$$\n\n` : `$${source}$`;
  }

  return { extractMathSource, renderMath };
});
