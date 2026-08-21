(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipTemplate = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VARIABLE_PATTERN = /{{\s*([a-zA-Z][\w]*)\s*(?:\|\s*([a-zA-Z_]+)\s*)?}}/g;

  function safeName(value) {
    return String(value || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function renderTemplate(template, variables = {}) {
    return String(template || '').replace(VARIABLE_PATTERN, (_match, name, filter) => {
      const value = variables[name] ?? '';
      if (filter === 'safe_name') return safeName(value);
      if (filter === 'lower') return String(value).toLowerCase();
      if (filter === 'upper') return String(value).toUpperCase();
      return String(value);
    });
  }

  function buildVariables(input = {}) {
    return {
      title: input.title || '',
      url: input.url || '',
      source: input.source || '',
      date: input.date || new Date().toISOString().slice(0, 10),
      author: input.author || '',
      site: input.site || '',
      content: input.content || '',
    };
  }

  return { buildVariables, renderTemplate, safeName };
});
