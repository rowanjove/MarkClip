const test = require('node:test');
const assert = require('node:assert/strict');
const { createClipRequest, createClipResult, normalizeMode } = require('../clip-contract.js');

test('clip contract normalizes request modes and immutable result data', () => {
  assert.equal(normalizeMode('selection'), 'pick');
  assert.equal(normalizeMode('invalid'), 'main');
  const request = createClipRequest({ mode: 'full', removeImages: 1, url: 'https://example.com' });
  assert.deepEqual(request, { mode: 'full', removeImages: true, url: 'https://example.com', options: {} });

  const result = createClipResult({ markdown: '# hi', title: 'Title', source: 'main', warnings: ['fallback'], diagnostics: { mode: 'main' } });
  assert.equal(result.charCount, 4);
  assert.deepEqual(result.warnings, ['fallback']);
  assert.deepEqual(result.diagnostics, { mode: 'main' });
  result.title = 'changed';
  assert.equal(result.title, 'Title');
});
