const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function assertPngSize(file, width, height) {
  const png = fs.readFileSync(file);
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), width);
  assert.equal(png.readUInt32BE(20), height);
}

test('store icon variants have the expected release dimensions', () => {
  for (const file of ['store-assets/icon-mono-128.png', 'store-assets/icon-on-light-128.png', 'store-assets/icon-on-dark-128.png']) {
    assertPngSize(file, 128, 128);
  }
});

test('visual regression screenshots keep their review viewport sizes', () => {
  assertPngSize('visual-regression/popup-light.png', 360, 600);
  assertPngSize('visual-regression/popup-dark.png', 360, 600);
  assertPngSize('visual-regression/floating-light.png', 1200, 760);
  assertPngSize('visual-regression/floating-dark.png', 1200, 760);
});
