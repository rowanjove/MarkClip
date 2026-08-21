const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

if (process.env.RUN_LIVE_SMOKE !== '1') {
  console.log('Live smoke skipped. Set RUN_LIVE_SMOKE=1 to run public-page checks.');
  process.exit(0);
}

const root = path.resolve(__dirname, '..');
const urls = process.env.LIVE_SMOKE_URLS
  ? process.env.LIVE_SMOKE_URLS.split(',').map((url) => url.trim()).filter(Boolean)
  : ['https://example.com/', 'https://en.wikipedia.org/wiki/Markdown'];
const runtimeFiles = [
  'page2md-core.js', 'url-utils.js', 'code-block-utils.js', 'message-schema.js',
  'clip-contract.js', 'template-utils.js', 'site-rules.js', 'math-utils.js',
  'floating-utils.js', 'lib/turndown.js', 'lib/readability.js', 'content-extractor.js',
];

async function smoke(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const html = await response.text();
  const dom = new JSDOM(html, { url: response.url, runScripts: 'outside-only' });
  dom.window.chrome = { runtime: { sendMessage: async () => ({ success: true }) } };
  for (const file of runtimeFiles) dom.window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  const result = await dom.window.MarkClipExtractor.buildMarkdown({ mode: 'main' });
  if (!result.markdown || result.charCount < 80) throw new Error(`${url} produced an unexpectedly short result.`);
  console.log(`${url} -> ${result.source}, ${result.charCount} chars, ${result.timings.totalMs} ms`);
}

(async () => {
  for (const url of urls) await smoke(url);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
