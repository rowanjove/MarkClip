(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipCode = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getCodeLanguage(node) {
    const candidates = [
      node?.getAttribute?.('data-language'),
      node?.getAttribute?.('class'),
      node?.getAttribute?.('id'),
      node?.parentElement?.getAttribute?.('class'),
    ].filter(Boolean).join(' ');

    const explicit = candidates.match(/(?:language|lang)[-_]([a-z0-9_+.-]+)/i);
    if (explicit) return explicit[1];

    const token = candidates
      .split(/\s+/)
      .map((value) => value.replace(/^[.]/, ''))
      .find((value) => /^[a-z][a-z0-9_+#.-]{1,20}$/i.test(value) && !/^(code|highlight|hljs|syntax|source)$/i.test(value));
    return token || '';
  }

  function getCodeText(node) {
    if (!node) return '';
    const clone = node.cloneNode ? node.cloneNode(true) : node;
    clone.querySelectorAll?.('br').forEach((br) => br.replaceWith('\n'));
    return String(clone.textContent || '').replace(/\r\n?/g, '\n');
  }

  function getFenceLength(code, fenceChar = '`') {
    const matches = String(code || '').match(new RegExp(`${fenceChar}{3,}`, 'g')) || [];
    return Math.max(3, ...matches.map((match) => match.length + 1));
  }

  function createFencedCodeBlock(code, language = '', fenceChar = '`') {
    const text = String(code || '').replace(/\n$/, '');
    const fence = fenceChar.repeat(getFenceLength(text, fenceChar));
    const safeLanguage = String(language || '').replace(/[^a-z0-9_+#.-]/gi, '');
    return `\n\n${fence}${safeLanguage}\n${text}\n${fence}\n\n`;
  }

  return { createFencedCodeBlock, getCodeLanguage, getCodeText, getFenceLength };
});
