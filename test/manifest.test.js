const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

test('manifest injects only lightweight floating UI files on all ordinary pages', () => {
  assert.deepEqual(manifest.content_scripts?.[0]?.matches, ['<all_urls>']);
  assert.deepEqual(manifest.content_scripts?.[0]?.js, [
    'page2md-core.js',
    'pick-selection.js',
    'content-extractor.js',
    'content-pick.js',
    'content-floating.js',
    'content.js',
  ]);
  assert.equal(manifest.content_scripts?.[0]?.run_at, 'document_idle');
});

test('manifest grants storage for floating button position and theme preferences', () => {
  assert.ok(manifest.permissions.includes('storage'));
});

test('manifest requests broad host access for on-demand converter injection', () => {
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
});

test('manifest does not expose a context menu entry', () => {
  assert.equal(manifest.permissions.includes('contextMenus'), false);
});

test('manifest uses the MarkClip product name', () => {
  assert.match(manifest.name, /^MarkClip\b/);
  assert.equal(manifest.action.default_title, 'MarkClip');
});
