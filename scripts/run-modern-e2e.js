const childProcess = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'node_modules', 'wxt', 'bin', 'wxt.mjs');
if (!fs.existsSync(cli)) throw new Error('WXT CLI is not installed');
childProcess.execFileSync(process.execPath, [cli, 'build', '-b', 'chrome'], { cwd: root, env: { ...process.env, WXT_TEST_HOST: '1' }, stdio: 'inherit' });
const result = childProcess.spawnSync(process.execPath, ['--test', path.join(root, 'test', 'e2e', 'modern-extension.test.js')], { cwd: root, env: { ...process.env, RUN_MODERN_E2E: '1' }, stdio: 'inherit' });
process.exit(result.status ?? 1);
