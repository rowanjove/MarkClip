(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipSiteRules = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeRules(rules) {
    if (!Array.isArray(rules)) return [];
    return rules.filter((rule) => (
      rule && typeof rule === 'object' &&
      typeof rule.host === 'string' && rule.host.trim() &&
      typeof rule.selector === 'string' && rule.selector.trim()
    )).map((rule) => ({
      host: rule.host.trim().toLowerCase(),
      selector: rule.selector.trim(),
      titleSelector: typeof rule.titleSelector === 'string' ? rule.titleSelector.trim() : '',
      removeImages: rule.removeImages === true,
      localizeImages: rule.localizeImages === true,
      template: typeof rule.template === 'string' ? rule.template : '',
    }));
  }

  function hostMatches(hostname, pattern) {
    const normalized = String(hostname || '').toLowerCase();
    const rule = String(pattern || '').toLowerCase().replace(/^\*\./, '');
    return normalized === rule || normalized.endsWith(`.${rule}`);
  }

  function findSiteRule(url, rules) {
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch (_err) { return null; }
    return normalizeRules(rules).find((rule) => hostMatches(hostname, rule.host)) || null;
  }

  return { findSiteRule, hostMatches, normalizeRules };
});
