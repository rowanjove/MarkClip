const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  createFencedCodeBlock,
  getCodeLanguage,
  getCodeText,
} = require('../code-block-utils.js');

test('code block helper preserves br line breaks and chooses a safe fence', () => {
  const dom = new JSDOM('<pre><code class="language-js">  const x = 1;<br>``` inside\n</code></pre>');
  const code = dom.window.document.querySelector('code');
  assert.equal(getCodeLanguage(code), 'js');
  assert.equal(getCodeText(code), '  const x = 1;\n``` inside\n');
  const result = createFencedCodeBlock(getCodeText(code), getCodeLanguage(code));
  assert.match(result, /````js/);
  assert.match(result, /  const x = 1;\n``` inside/);
});

test('code block helper supports plain pre nodes', () => {
  const dom = new JSDOM('<pre class="python">\nprint(1)\n</pre>');
  const pre = dom.window.document.querySelector('pre');
  assert.equal(getCodeLanguage(pre), 'python');
  assert.match(createFencedCodeBlock(getCodeText(pre), getCodeLanguage(pre)), /```python/);
});
