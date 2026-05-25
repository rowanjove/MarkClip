(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Page2MDCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeYamlString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function buildMarkdownDocument({ title, source, date, body }) {
    const cleanBody = String(body || '').trim();
    const frontmatter = [
      '---',
      `title: "${escapeYamlString(title || 'Untitled')}"`,
      `source: "${escapeYamlString(source || '')}"`,
      `date: "${escapeYamlString(date || new Date().toISOString().slice(0, 10))}"`,
      '---',
      '',
    ].join('\n');

    return `${frontmatter}\n${cleanBody.replace(/\n{3,}/g, '\n\n').trim()}`;
  }

  function sanitizeFileName(name) {
    const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
    const cleaned = String(name || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^\.+/, '')
      .trim();

    if (!cleaned) return 'page';
    return cleaned
      .replace(reservedNames, (_match, base, ext = '') => `${base}_${ext}`)
      .slice(0, 80);
  }

  return {
    buildMarkdownDocument,
    sanitizeFileName,
  };
});
