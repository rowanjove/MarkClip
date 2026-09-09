const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const names = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
const notices = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const allowed = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0', '0BSD']);
const failures = [];
for (const name of names) {
  const manifest = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
  if (!fs.existsSync(manifest)) continue;
  const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const license = typeof metadata.license === 'string' ? metadata.license : metadata.license?.type;
  if (!license || !allowed.has(license)) failures.push(`${name}: ${license || 'unknown license'}`);
  if (!notices.toLowerCase().includes(name.toLowerCase())) failures.push(`${name}: missing THIRD_PARTY_NOTICES entry`);
}
if (failures.length) throw new Error(`License check failed:\n${failures.join('\n')}`);
console.log(`License check passed for ${names.length} direct dependencies.`);
