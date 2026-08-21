const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { extractMathSource, renderMath } = require('../math-utils.js');

test('math utility extracts TeX annotation from inline and display MathML', () => {
  const dom = new JSDOM('<div><math><semantics><mrow>x</mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math><math display="block">y=mx+b</math></div>');
  const nodes = dom.window.document.querySelectorAll('math');
  assert.equal(extractMathSource(nodes[0]), 'x^2');
  assert.equal(renderMath(nodes[0]), '$x^2$');
  assert.match(renderMath(nodes[1]), /\$\$\ny=mx\+b\n\$\$/);
});
