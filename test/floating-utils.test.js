const test = require('node:test');
const assert = require('node:assert/strict');
const { clampPosition } = require('../floating-utils.js');

test('floating position remains inside the viewport', () => {
  assert.deepEqual(clampPosition({ right: 9999, bottom: -50 }, { width: 800, height: 600 }, { width: 52, height: 52 }), { right: 748, bottom: 8 });
  assert.deepEqual(clampPosition({ right: 22, bottom: 82 }, { width: 800, height: 600 }, { width: 52, height: 52 }), { right: 22, bottom: 82 });
});
