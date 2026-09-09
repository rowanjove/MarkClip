import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '页摘 - 网页摘录为 Markdown',
    description: '在浏览器本地摘录网页内容，转换为 Markdown，方便复制或保存。',
    permissions: ['activeTab', 'scripting', 'clipboardWrite', 'storage', 'contextMenus', 'commands', 'downloads'],
    optional_host_permissions: browser === 'firefox' ? undefined : ['<all_urls>'],
    optional_permissions: browser === 'firefox' ? ['<all_urls>'] : undefined,
    // Test-only fixture access is enabled by run-modern-e2e.js and never by
    // normal builds or release packages.
    host_permissions: process.env.WXT_TEST_HOST === '1' ? ['http://127.0.0.1/*'] : [],
    action: {
      default_title: '页摘',
      default_icon: {
        16: 'icons/icon16.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png',
      },
    },
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    side_panel: browser === 'chrome' ? { default_path: 'sidepanel.html' } : undefined,
    sidebar_action: browser === 'firefox' ? {
      default_title: '页摘',
      default_panel: 'sidepanel.html',
      open_at_install: false,
    } : undefined,
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    web_accessible_resources: [{
      resources: ['icons/icon48.png'],
      matches: ['<all_urls>'],
    }],
    commands: {
      'save-main': { suggested_key: { default: 'Alt+Shift+M' }, description: '保存正文' },
      'copy-markdown': { suggested_key: { default: 'Alt+Shift+C' }, description: '复制 Markdown' },
      'start-highlights': { suggested_key: { default: 'Alt+Shift+H' }, description: '开始摘录' },
      'open-sidepanel': { suggested_key: { default: 'Alt+Shift+P' }, description: '打开侧栏' },
    },
    browser_specific_settings: browser === 'firefox' ? {
      gecko: {
        id: 'yezai@rowanjove.app',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
    } : undefined,
  }),
});
