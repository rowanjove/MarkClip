const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMarkdownDocument,
  sanitizeFileName,
} = require('../page2md-core.js');

test('buildMarkdownDocument adds quoted frontmatter and normalizes whitespace', () => {
  const markdown = buildMarkdownDocument({
    title: 'A "quoted" page',
    source: 'https://example.com/article',
    date: '2026-05-22',
    body: '# Heading\n\n\n\nBody text',
  });

  assert.match(markdown, /^---\n/);
  assert.match(markdown, /title: "A \\"quoted\\" page"/);
  assert.match(markdown, /source: "https:\/\/example\.com\/article"/);
  assert.match(markdown, /date: "2026-05-22"/);
  assert.doesNotMatch(markdown, /\n{3,}/);
  assert.match(markdown, /Body text/);
});

test('buildMarkdownDocument quotes YAML scalar values consistently', () => {
  const markdown = buildMarkdownDocument({
    title: 'Title',
    source: 'https://example.com/a: b#hash',
    date: '2026-05-22',
    body: 'Body',
  });

  assert.match(markdown, /source: "https:\/\/example\.com\/a: b#hash"/);
  assert.match(markdown, /date: "2026-05-22"/);
});

test('buildMarkdownDocument escapes backslashes in title', () => {
  const markdown = buildMarkdownDocument({
    title: 'C:\\Users\\test',
    source: 'https://example.com',
    date: '2026-01-01',
    body: 'ok',
  });

  assert.match(markdown, /title: "C:\\\\Users\\\\test"/);
});

test('buildMarkdownDocument preserves markdown images because DOM conversion handles image removal', () => {
  const markdown = buildMarkdownDocument({
    title: 'T',
    source: '',
    date: '',
    body: '![img](https://example.com/a.png)\n\nText',
  });

  assert.match(markdown, /!\[img\]\(https:\/\/example\.com\/a\.png\)/);
});

test('buildMarkdownDocument uses defaults for missing fields', () => {
  const markdown = buildMarkdownDocument({ body: 'content' });

  assert.match(markdown, /title: "Untitled"/);
  assert.match(markdown, /source: ""/);
  assert.match(markdown, /date: "\d{4}-\d{2}-\d{2}"/);
  assert.match(markdown, /content/);
});

test('sanitizeFileName removes characters Chrome cannot save on Windows', () => {
  assert.equal(sanitizeFileName('A/B:C*D?"E<>|F'), 'A_B_C_D__E___F');
  assert.equal(sanitizeFileName('   '), 'page');
});

test('sanitizeFileName handles leading dots and Windows reserved names', () => {
  assert.equal(sanitizeFileName('...secret'), 'secret');
  assert.equal(sanitizeFileName('CON'), 'CON_');
  assert.equal(sanitizeFileName('nul.txt'), 'nul_.txt');
});

test('sanitizeFileName handles all Windows reserved names', () => {
  assert.equal(sanitizeFileName('CON'), 'CON_');
  assert.equal(sanitizeFileName('PRN'), 'PRN_');
  assert.equal(sanitizeFileName('AUX'), 'AUX_');
  assert.equal(sanitizeFileName('NUL'), 'NUL_');
  assert.equal(sanitizeFileName('COM1'), 'COM1_');
  assert.equal(sanitizeFileName('COM9'), 'COM9_');
  assert.equal(sanitizeFileName('LPT1'), 'LPT1_');
  assert.equal(sanitizeFileName('LPT9'), 'LPT9_');
});

test('sanitizeFileName preserves non-reserved names starting with reserved prefixes', () => {
  assert.equal(sanitizeFileName('CONNECT'), 'CONNECT');
  assert.equal(sanitizeFileName('COMPUTE'), 'COMPUTE');
  assert.equal(sanitizeFileName('LPTopic'), 'LPTopic');
});

test('sanitizeFileName truncates to 80 characters', () => {
  const longName = 'A'.repeat(200);
  assert.equal(sanitizeFileName(longName).length, 80);
});

test('sanitizeFileName handles empty and whitespace-only input', () => {
  assert.equal(sanitizeFileName(''), 'page');
  assert.equal(sanitizeFileName(null), 'page');
  assert.equal(sanitizeFileName(undefined), 'page');
  assert.equal(sanitizeFileName('   \t  '), 'page');
});

test('sanitizeFileName collapses multiple spaces', () => {
  assert.equal(sanitizeFileName('a    b    c'), 'a b c');
});

test('sanitizeFileName handles reserved name with extension', () => {
  assert.equal(sanitizeFileName('COM3.txt'), 'COM3_.txt');
  assert.equal(sanitizeFileName('LPT2.log'), 'LPT2_.log');
});
