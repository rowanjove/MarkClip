const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const FIXED_DOS_DATE = 0x0021;
const FIXED_DOS_TIME = 0;
const FILES = [
  'LICENSE',
  'PRIVACY.md',
  'THIRD_PARTY_NOTICES.md',
  'background.js',
  'clip-contract.js',
  'code-block-utils.js',
  'content-extractor.js',
  'content-floating.js',
  'content-pick.js',
  'content.js',
  'extension-utils.js',
  'floating-utils.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'image-utils.js',
  'lib/readability.js',
  'lib/turndown.js',
  'manifest.json',
  'math-utils.js',
  'message-schema.js',
  'obsidian-utils.js',
  'page2md-core.js',
  'pick-selection.js',
  'popup-state-utils.js',
  'popup.html',
  'popup.js',
  'site-rules.js',
  'template-utils.js',
  'url-utils.js',
].sort();

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    return value >>> 0;
  });
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const data = entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(FIXED_DOS_TIME, 10);
    local.writeUInt16LE(FIXED_DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(FIXED_DOS_TIME, 12);
    central.writeUInt16LE(FIXED_DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, name, data);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildPackage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const entries = FILES.map((name) => {
    const absolute = path.join(root, name);
    if (!fs.existsSync(absolute)) throw new Error(`Release file is missing: ${name}`);
    return { name, data: fs.readFileSync(absolute) };
  });
  const outputDirectory = path.join(root, 'dist');
  const output = path.join(outputDirectory, `markclip-${manifest.version}.zip`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(output, createStoredZip(entries));
  console.log(`Created ${path.relative(root, output)} with ${entries.length} allowlisted files.`);
  return output;
}

if (require.main === module) buildPackage();

module.exports = { FILES, buildPackage, createStoredZip, crc32 };
