const test = require('node:test');
const assert = require('node:assert/strict');
const { STORAGE_DEFAULTS, STORAGE_KEYS, withOptionalOrigins } = require('../popup-state-utils.js');

test('popup preferences include the persisted floating visibility state', () => {
  assert.equal(STORAGE_DEFAULTS[STORAGE_KEYS.hidden], true);
  assert.equal(STORAGE_DEFAULTS[STORAGE_KEYS.localizeImages], false);
});

test('batch permission is released after a temporary operation', async () => {
  const calls = [];
  const permissions = {
    async contains() { calls.push('contains'); return false; },
    async request() { calls.push('request'); return true; },
    async remove() { calls.push('remove'); return true; },
  };
  const result = await withOptionalOrigins(
    permissions,
    ['<all_urls>'],
    { releaseAfter: true },
    async () => { calls.push('operation'); return 42; },
  );
  assert.equal(result, 42);
  assert.deepEqual(calls, ['contains', 'request', 'operation', 'remove']);
});

test('batch permission is released after failure but retained for the floating UI', async () => {
  let removeCount = 0;
  const permissions = {
    async contains() { return true; },
    async request() { throw new Error('not expected'); },
    async remove() { removeCount += 1; return true; },
  };
  await assert.rejects(
    withOptionalOrigins(permissions, ['<all_urls>'], { releaseAfter: true }, async () => {
      throw new Error('conversion failed');
    }),
    /conversion failed/,
  );
  assert.equal(removeCount, 1);
  await withOptionalOrigins(permissions, ['<all_urls>'], { releaseAfter: false }, async () => 'ok');
  assert.equal(removeCount, 1);
});
