const fs = require('node:fs');
const path = require('node:path');
const { createIcon } = require('./generate-icons.js');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'store-assets');
const green = [36, 98, 61, 255];

fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'icon-mono-128.png'), createIcon(128, {
  tile: green,
  page: [0, 0, 0, 0],
  excerpt: [0, 0, 0, 0],
}));
fs.writeFileSync(path.join(output, 'icon-on-light-128.png'), createIcon(128, {
  background: [226, 237, 228, 255],
}));
fs.writeFileSync(path.join(output, 'icon-on-dark-128.png'), createIcon(128, {
  background: [32, 37, 34, 255],
}));
fs.writeFileSync(path.join(output, 'icon-preview-256.png'), createIcon(256));

console.log('Generated store icon variants in store-assets/.');
