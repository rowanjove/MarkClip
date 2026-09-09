const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { createStoredZip } = require('./package-extension.js');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

function filesUnder(directory) {
  const entries = [];
  const walk = (current, prefix = '') => {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      if (fs.statSync(absolute).isDirectory()) walk(absolute, relative);
      else entries.push({ name: relative.replaceAll('\\', '/'), data: fs.readFileSync(absolute) });
    }
  };
  walk(directory);
  return entries;
}

function build(browser) {
  // Invoke the installed CLI through the current Node executable. `npx.cmd`
  // intermittently returns EINVAL when spawned from a Node child process on
  // Windows, while the direct entrypoint works in both CI and local shells.
  const wxtCli = path.join(root, 'node_modules', 'wxt', 'bin', 'wxt.mjs');
  if (!fs.existsSync(wxtCli)) throw new Error(`Missing WXT CLI: ${wxtCli}`);
  childProcess.execFileSync(process.execPath, [wxtCli, 'build', '-b', browser], { cwd: root, stdio: 'inherit' });
  const output = path.join(root, '.output', `${browser}-mv3`);
  if (!fs.existsSync(path.join(output, 'manifest.json'))) throw new Error(`Missing ${browser} manifest`);
  const archive = createStoredZip(filesUnder(output));
  const target = path.join(root, 'dist', `markclip-${version}-${browser}.zip`);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, archive);
  return target;
}

function buildSource() {
  const files = [];
  for (const item of ['src', 'scripts', 'test', '.github', 'manifest.json', 'wxt.config.ts', 'tsconfig.json', 'vitest.config.mts', 'eslint.config.mjs', 'package.json', 'package-lock.json', 'LICENSE', 'PRIVACY.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'README.md', 'README.en.md', 'CHANGELOG.md', 'BROWSER_SUPPORT.md', 'EXPORT_TARGETS.md', 'SITE_RULES.md', 'SITE_RECIPES.md', 'TEMPLATES.md', 'AI.md', 'DIAGNOSTICS.md', 'MIGRATION_V1_5.md', 'DEVELOPMENT.md', 'RELEASE.md', 'releases']) {
    const absolute = path.join(root, item);
    if (fs.statSync(absolute).isDirectory()) files.push(...filesUnder(absolute).map((entry) => ({ ...entry, name: `${item}/${entry.name}` })));
    else files.push({ name: item, data: fs.readFileSync(absolute) });
  }
  const target = path.join(root, 'dist', `markclip-${version}-source.zip`);
  fs.writeFileSync(target, createStoredZip(files.sort((a, b) => a.name.localeCompare(b.name))));
  return target;
}

function main() {
  const outputs = [build('chrome'), build('firefox'), buildSource()];
  const sums = outputs.map((file) => `${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}  ${path.basename(file)}`).join('\n') + '\n';
  fs.writeFileSync(path.join(root, 'dist', 'SHA256SUMS.txt'), sums);
  console.log(sums.trim());
}

if (require.main === module) main();
module.exports = { build, buildSource, filesUnder };
