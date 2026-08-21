const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) throw new Error('Manifest V3 is required.');
if (!manifest.name || !manifest.version) throw new Error('Manifest name and version are required.');
if (manifest.host_permissions?.length) throw new Error('Permanent host_permissions are not allowed.');
if (manifest.content_scripts?.length) throw new Error('Static content scripts are not allowed; use on-demand or optional registration.');
if (!manifest.optional_host_permissions?.includes('<all_urls>')) {
  throw new Error('Optional <all_urls> permission is required for the opt-in floating UI.');
}

for (const file of [
  ...(manifest.action?.default_popup ? [manifest.action.default_popup] : []),
  ...(manifest.background?.service_worker ? [manifest.background.service_worker] : []),
  ...Object.values(manifest.icons || {}),
]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Manifest file does not exist: ${file}`);
}

console.log('Manifest check passed.');
