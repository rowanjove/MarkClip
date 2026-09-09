const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const allowedPermissions = new Set(['activeTab', 'scripting', 'clipboardWrite', 'storage', 'contextMenus', 'commands', 'downloads', 'sidePanel']);
for (const browser of ['chrome', 'firefox']) {
  const dir = path.join(root, '.output', `${browser}-mv3`);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing modern ${browser} build; run npm run build:${browser}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.manifest_version !== 3) throw new Error(`${browser}: MV3 required`);
  if (manifest.host_permissions?.length) throw new Error(`${browser}: permanent host permissions are forbidden`);
  if (manifest.permissions?.some((permission) => !allowedPermissions.has(permission))) throw new Error(`${browser}: unexpected permission`);
  if (browser === 'chrome' && !manifest.optional_host_permissions?.includes('<all_urls>')) throw new Error('Chrome: all_urls must remain optional');
  if (browser === 'firefox' && !manifest.optional_permissions?.includes('<all_urls>')) throw new Error('Firefox: all_urls must remain optional');
  if (browser === 'chrome' && !manifest.side_panel?.default_path) throw new Error('Chrome side panel missing');
  if (browser === 'firefox' && !manifest.sidebar_action?.default_panel) throw new Error('Firefox sidebar missing');
  for (const size of ['16', '48', '128']) if (!fs.existsSync(path.join(dir, 'icons', `icon${size}.png`))) throw new Error(`${browser}: icon${size}.png missing`);
  const scripts = [];
  const walk = (current) => {
    for (const name of fs.readdirSync(current)) {
      const absolute = path.join(current, name);
      if (fs.statSync(absolute).isDirectory()) walk(absolute);
      else if (name.endsWith('.js')) scripts.push(absolute);
    }
  };
  walk(dir);
  for (const script of scripts) {
    const source = fs.readFileSync(script, 'utf8');
    if (/\bimportScripts\s*\(|\bnew\s+Function\s*\(|\beval\s*\(/.test(source)) throw new Error(`${browser}: forbidden legacy/dynamic code in ${path.relative(dir, script)}`);
  }
}
console.log('Modern Chrome/Firefox manifests and permissions are valid.');
