const test = require('node:test');
const assert = require('node:assert/strict');
const { FILES, createStoredZip } = require('../scripts/package-extension.js');

test('release package uses an explicit runtime allowlist', () => {
  assert.ok(FILES.includes('manifest.json'));
  assert.ok(FILES.includes('popup-state-utils.js'));
  assert.ok(FILES.includes('lib/readability.js'));
  assert.equal(FILES.some((name) => /^(?:node_modules|test|scripts|\.tmp-)(?:\/|$)/.test(name)), false);
});

test('release zip is deterministic and keeps manifest at the archive root', () => {
  const entries = [
    { name: 'manifest.json', data: Buffer.from('{}') },
    { name: 'icons/icon16.png', data: Buffer.from([1, 2, 3]) },
  ];
  const first = createStoredZip(entries);
  const second = createStoredZip(entries);
  assert.deepEqual(first, second);
  assert.match(first.toString('utf8'), /manifest\.json/);
  assert.equal(first.readUInt32LE(0), 0x04034b50);
  assert.equal(first.readUInt32LE(first.length - 22), 0x06054b50);
});
