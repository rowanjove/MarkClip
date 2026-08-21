const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTemplate, buildVariables } = require('../template-utils.js');
const { findSiteRule, normalizeRules } = require('../site-rules.js');

test('template utilities render safe variables and supported filters', () => {
  const vars = buildVariables({ title: 'A/B', url: 'https://example.com', content: '# Body' });
  assert.equal(renderTemplate('{{title|safe_name}}\n{{url}}\n{{content}}', vars), 'A_B\nhttps://example.com\n# Body');
  assert.equal(renderTemplate('{{missing}}', vars), '');
});

test('site rules match exact and subdomain hosts without executing arbitrary patterns', () => {
  const rules = normalizeRules([
    { host: 'example.com', selector: 'article', localizeImages: true },
    { host: 'ignored.example', selector: '' },
  ]);
  assert.equal(rules.length, 1);
  assert.equal(findSiteRule('https://www.example.com/page', rules).selector, 'article');
  assert.equal(findSiteRule('https://www.example.com/page', rules).localizeImages, true);
  assert.equal(findSiteRule('https://other.test/page', rules), null);
});
