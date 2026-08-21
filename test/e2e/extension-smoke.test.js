const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('extension packaging smoke keeps dynamic bootstrap assets available', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.content_scripts, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ['<all_urls>']);

  const extensionUtils = fs.readFileSync(path.join(root, 'extension-utils.js'), 'utf8');
  const files = [
    'page2md-core.js', 'url-utils.js', 'code-block-utils.js', 'message-schema.js', 'clip-contract.js', 'template-utils.js', 'site-rules.js', 'math-utils.js', 'image-utils.js', 'floating-utils.js',
    'pick-selection.js', 'content-extractor.js', 'content-pick.js',
    'content-floating.js', 'content.js',
  ];
  for (const file of files) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
    assert.match(extensionUtils, new RegExp(`['"]${file.replace(/[.]/g, '\\.') }['"]`));
  }
});
