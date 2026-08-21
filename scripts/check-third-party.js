const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const expected = {
  'lib/readability.js': '34dcab3d0832d0019f02990eed6b6124e029e8c32b9f0c6f2550544ff8dff174',
  'lib/turndown.js': 'c97187f436d41638bf7acf346a39d9d42f2f2c02af18245a297c09e796f8e46f',
};

for (const [file, hash] of Object.entries(expected)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  if (actual !== hash) throw new Error(`${file} hash changed; update THIRD_PARTY_NOTICES.md after auditing the upstream source.`);
}

const popup = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
for (const src of [...popup.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1])) {
  if (/^(https?:)?\/\//i.test(src)) throw new Error(`Remote script is forbidden: ${src}`);
  if (!fs.existsSync(path.join(root, src))) throw new Error(`Popup script does not exist: ${src}`);
}

console.log('Third-party and extension asset checks passed.');
