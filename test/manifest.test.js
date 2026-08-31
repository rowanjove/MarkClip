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

test('manifest uses the current Chinese product name', () => {
  assert.match(manifest.name, /^页摘(?:\s|$|-)/);
  assert.equal(manifest.action.default_title, '页摘');
});

test('web pages can access only the floating icon, not extension scripts or settings', () => {
  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: ['icons/icon48.png'],
    matches: ['<all_urls>'],
  }]);
});

test('manifest exposes the same icon assets for the extension surface', () => {
  assert.deepEqual(manifest.icons, {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  });
});

test('icon assets use the sizes declared by the manifest', () => {
  for (const [size, file] of [[16, 'icons/icon16.png'], [48, 'icons/icon48.png'], [128, 'icons/icon128.png']]) {
    const png = fs.readFileSync(file);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
