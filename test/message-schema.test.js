const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidMessage } = require('../message-schema.js');

test('message schema accepts supported requests', () => {
  assert.equal(isValidMessage({ action: 'getMarkdown', mode: 'main', removeImages: false, localizeImages: true }), true);
  assert.equal(isValidMessage({ action: 'page2md:startPick', after: 'download' }), true);
  assert.equal(isValidMessage({ action: 'page2md:copyMarkdown', markdown: '# hi' }), true);
});

test('message schema rejects unknown actions and malformed payloads', () => {
  assert.equal(isValidMessage({ action: 'run arbitrary code' }), false);
  assert.equal(isValidMessage({ action: 'getMarkdown', mode: 'unknown' }), false);
  assert.equal(isValidMessage({ action: 'page2md:copyMarkdown', markdown: 42 }), false);
  assert.equal(isValidMessage({ action: 'page2md:startPick', after: 'upload' }), false);
  assert.equal(isValidMessage({ action: 'getMarkdown', localizeImages: 'yes' }), false);
  assert.equal(isValidMessage({ action: 'page2md:cancel' }), false);
  assert.equal(isValidMessage({ action: 'page2md:cancel', id: 'clip-1' }), true);
});
