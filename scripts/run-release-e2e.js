const childProcess = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const env = { ...process.env, RUN_BROWSER_E2E: '1', RUN_CHROME_CDP_E2E: '1' };
for (const file of ['test/e2e/browser-extension.test.js', 'test/e2e/chrome-cdp-extension.test.js']) {
  const result = childProcess.spawnSync(process.execPath, ['--test', path.join(root, file)], { cwd: root, env, stdio: 'inherit' });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}
const modern = childProcess.spawnSync(process.execPath, [path.join(root, 'scripts', 'run-modern-e2e.js')], { cwd: root, env, stdio: 'inherit' });
process.exit(modern.status ?? 1);
