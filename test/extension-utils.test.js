const test = require('node:test');
const assert = require('node:assert/strict');

let registered = [];
const sent = [];
const executed = [];
let permissionRemoveCount = 0;
let bootstrapReady = true;
let libraryReady = true;
global.chrome = {
  runtime: { lastError: null },
  tabs: {
    async query() { return [{ id: 7 }, { id: 8 }]; },
    sendMessage(_tabId, message, callback) {
      sent.push(message);
      callback({ success: message.action === 'page2md:ping' ? bootstrapReady : message.action === 'page2md:libsReady' ? libraryReady : false });
    },
  },
  permissions: {
    async remove() { permissionRemoveCount += 1; return true; },
  },
  scripting: {
    async executeScript(details) {
      executed.push(details.files);
      if (details.files?.includes('content.js')) bootstrapReady = true;
      if (details.files?.includes('lib/readability.js')) libraryReady = true;
    },
    async getRegisteredContentScripts() { return registered; },
    async registerContentScripts(scripts) { registered = scripts; },
    async unregisterContentScripts() { registered = []; },
  },
};

require('../extension-utils.js');
const extension = global.Page2MDExtension;

test('extension utils exposes dynamic bootstrap assets and avoids duplicate registration', async () => {
  assert.ok(extension.BOOTSTRAP_FILES.includes('url-utils.js'));
  assert.ok(extension.BOOTSTRAP_FILES.includes('clip-contract.js'));
  await extension.registerFloatingContentScript();
  await extension.registerFloatingContentScript();
  assert.equal(registered.length, 1);
  assert.equal(registered[0].id, extension.DYNAMIC_CONTENT_SCRIPT_ID);
  await extension.unregisterFloatingContentScript();
  assert.equal(registered.length, 0);
});

test('extension utils probes an injected content script before loading libraries', async () => {
  sent.length = 0;
  await extension.ensureContentScripts(7);
  assert.deepEqual(sent.map((message) => message.action), ['page2md:ping', 'page2md:libsReady']);
});

test('extension utils serializes concurrent bootstrap and library injection per tab', async () => {
  bootstrapReady = false;
  libraryReady = false;
  executed.length = 0;
  await Promise.all([
    extension.ensureContentScripts(42),
    extension.ensureContentScripts(42),
  ]);
  assert.equal(executed.filter((files) => files.includes('content.js')).length, 1);
  assert.equal(executed.filter((files) => files.includes('lib/readability.js')).length, 1);
  bootstrapReady = true;
  libraryReady = true;
});

test('disabling the floating UI hides existing panels and revokes optional access', async () => {
  registered = [{ id: extension.DYNAMIC_CONTENT_SCRIPT_ID }];
  sent.length = 0;
  permissionRemoveCount = 0;
  await extension.disableFloatingEverywhere();
  assert.deepEqual(sent.map((message) => message.action), ['page2md:hideFloating', 'page2md:hideFloating']);
  assert.equal(registered.length, 0);
  assert.equal(permissionRemoveCount, 1);
});
