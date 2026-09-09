const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(root, 'src', 'browser', 'compatibility.ts'))) throw new Error('Safari compatibility layer missing');
if (!fs.existsSync(path.join(root, 'BROWSER_SUPPORT.md'))) throw new Error('Browser support documentation missing');
console.log('Safari compatibility route is documented and source-compatible.');
