const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUri, normalizeFilePath, renderFilePath } = require('../obsidian-utils.js');

test('Obsidian helper renders safe templated paths and encoded content', () => {
  assert.equal(normalizeFilePath('../Notes\\A:B.md'), 'Notes/A_B.md');
  assert.equal(renderFilePath('Clips/{{date}}/{{title}}.md', { date: '2026-08-22', title: 'A/B' }), 'Clips/2026-08-22/A_B.md');
  const uri = buildUri({ vault: 'Work', file: 'Notes/Test.md', content: '# Hello 世界' });
  assert.match(uri, /^obsidian:\/\/new\?/);
  assert.match(uri, /vault=Work/);
  const params = new URL(uri.replace('obsidian://', 'https://')).searchParams;
  assert.equal(params.get('content'), '# Hello 世界');
});
