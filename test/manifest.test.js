const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

test('manifest does not inject scripts on every page by default', () => {
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ['<all_urls>']);
});

test('manifest grants storage for floating button position and theme preferences', () => {
  assert.ok(manifest.permissions.includes('storage'));
});

test('manifest keeps broad host access optional for the floating UI', () => {
  assert.deepEqual(manifest.optional_host_permissions, ['<all_urls>']);
});

test('manifest does not expose a context menu entry', () => {
  assert.equal(manifest.permissions.includes('contextMenus'), false);
});

test('manifest uses the MarkClip product name', () => {
  assert.match(manifest.name, /^MarkClip\b/);
  assert.equal(manifest.action.default_title, 'MarkClip');
});
