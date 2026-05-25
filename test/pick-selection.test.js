const test = require('node:test');
const assert = require('node:assert/strict');

const { mergePickSelection } = require('../pick-selection.js');

function node(name, children = []) {
  const item = {
    name,
    children,
    contains(other) {
      return this === other || this.children.some((child) => child.contains(other));
    },
  };
  return item;
}

test('mergePickSelection ignores a child when its parent is already selected', () => {
  const child = node('child');
  const parent = node('parent', [child]);

  assert.deepEqual(mergePickSelection([parent], child), [parent]);
});

test('mergePickSelection replaces selected children with the later selected parent', () => {
  const childA = node('child-a');
  const childB = node('child-b');
  const parent = node('parent', [childA, childB]);

  assert.deepEqual(mergePickSelection([childA, childB], parent), [parent]);
});

test('mergePickSelection appends unrelated regions', () => {
  const first = node('first');
  const second = node('second');

  assert.deepEqual(mergePickSelection([first], second), [first, second]);
});
