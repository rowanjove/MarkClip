(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipObsidian = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeFilePath(value, fallback = 'page.md') {
    const cleaned = String(value || fallback)
      .replace(/^[/\\]+/, '')
      .split(/[\\/]+/)
      .map((part) => part.replace(/[:*?"<>|]/g, '_'))
      .filter((part) => part && part !== '.' && part !== '..')
      .join('/');
    return cleaned || fallback;
  }

  function renderFilePath(template, variables = {}) {
    const safeSegment = (value, fallback) => String(value || fallback).replace(/[\\/:*?"<>|]/g, '_');
    const raw = String(template || '{{title}}.md')
      .replace(/\{\{\s*title\s*\}\}/gi, safeSegment(variables.title, 'page'))
      .replace(/\{\{\s*date\s*\}\}/gi, safeSegment(variables.date, new Date().toISOString().slice(0, 10)))
      .replace(/\{\{\s*site\s*\}\}/gi, safeSegment(variables.site, ''));
    return normalizeFilePath(raw, 'page.md');
  }

  function buildUri({ vault = '', file = 'page.md', content = '' } = {}) {
    const params = new URLSearchParams();
    if (vault) params.set('vault', String(vault));
    params.set('file', normalizeFilePath(file));
    params.set('content', String(content));
    return `obsidian://new?${params.toString()}`;
  }

  return { buildUri, normalizeFilePath, renderFilePath };
});
