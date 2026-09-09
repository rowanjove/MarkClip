import { describe, expect, it, vi } from 'vitest';
import { ObsidianExporter, createRemoteExporter, safeExportFileName } from '../../src/core/exporters';
import { createEmptyMetadata, createEmptyDiagnostics, type ClipResult } from '../../src/shared/contracts';
import { browser } from 'wxt/browser';
import { reconcileFloatingScripts } from '../../src/browser/permissions';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../src/shared/settings';

vi.mock('wxt/browser', () => {
  const fakeBrowser = {
    tabs: { create: vi.fn() },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
    permissions: {
      contains: vi.fn().mockResolvedValue(false),
      remove: vi.fn().mockResolvedValue(true),
      request: vi.fn().mockResolvedValue(true),
    },
    scripting: {
      getRegisteredContentScripts: vi.fn().mockResolvedValue([]),
      registerContentScripts: vi.fn().mockResolvedValue(undefined),
      unregisterContentScripts: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { browser: fakeBrowser };
});

describe('security and runtime robustness fixes', () => {
  it('sanitizes Windows reserved export names', () => {
    expect(safeExportFileName('CON')).toBe('_CON');
    expect(safeExportFileName(' report. ')).toBe('report');
  });

  it('ObsidianExporter opens via browser.tabs.create when window is undefined', async () => {
    const originalWindow = globalThis.window;
    try {
      // Simulate Service Worker environment where window is undefined
      delete (globalThis as any).window;
      let createdUrl = '';
      browser.tabs.create = vi.fn().mockImplementation(async ({ url }: { url: string }) => {
        createdUrl = url;
        return { id: 1 };
      }) as any;

      const clip: ClipResult = {
        id: 'test-1',
        markdown: '# Hello Obsidian\nTesting service worker exporter.',
        metadata: { ...createEmptyMetadata('https://example.com'), title: 'Test Obsidian' },
        assets: [],
        warnings: [],
        diagnostics: createEmptyDiagnostics(),
      };

      const result = await ObsidianExporter.export(clip, { path: 'MyVault' }, { browser: 'chrome' });
      expect(result.success).toBe(true);
      expect(browser.tabs.create).toHaveBeenCalled();
      expect(createdUrl).toContain('obsidian://new?');
      expect(createdUrl).toContain('vault=MyVault');
      expect(createdUrl).toContain('file=Test+Obsidian.md');
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('createRemoteExporter correctly encodes UTF-8 characters without deprecated unescape', async () => {
    let capturedBody = '';
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return new Response(JSON.stringify({ content: { sha: '123' } }), { status: 201 });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const exporter = createRemoteExporter('github', {
        repo: 'owner/repo',
        token: 'ghp_test123',
      });

      const chineseText = '# 中文测试\n包含 Emoji 🎉 与特殊符号 & < > " \'';
      const clip: ClipResult = {
        id: 'test-2',
        markdown: chineseText,
        metadata: { ...createEmptyMetadata('https://example.com'), title: '中文标题' },
        assets: [],
        warnings: [],
        diagnostics: createEmptyDiagnostics(),
      };

      const result = await exporter.export(clip, { path: 'notes' }, { browser: 'chrome' });
      expect(result.success).toBe(true);
      const parsedBody = JSON.parse(capturedBody);
      // Verify base64 decode matches original UTF-8 string exactly
      const decoded = Buffer.from(parsedBody.content, 'base64').toString('utf8');
      expect(decoded).toBe(chineseText);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses split GitHub repo segments and sends the existing SHA for overwrite', async () => {
    const urls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      urls.push(url);
      return init?.method === 'PUT' ? new Response('{}', { status: 200 }) : new Response(JSON.stringify({ sha: 'old-sha' }), { status: 200 });
    }) as typeof fetch;
    try {
      const exporter = createRemoteExporter('github', { repo: 'owner/repo', token: 'token' });
      const result = await exporter.export({ id: 'x', markdown: '# x', metadata: { ...createEmptyMetadata('https://example.com'), title: 'x' }, assets: [], warnings: [], diagnostics: createEmptyDiagnostics() }, { path: 'notes/x.md', overwrite: 'overwrite' }, { browser: 'chrome' });
      expect(result.success).toBe(true);
      expect(urls[0]).toContain('/repos/owner/repo/contents/notes/x.md');
      expect(urls[1]).toContain('/repos/owner/repo/contents/notes/x.md');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('honors WebDAV cancel semantics before issuing a PUT', async () => {
    const calls: Array<{ method?: string; url: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method, url });
      return new Response('', { status: init?.method === 'HEAD' ? 200 : 201 });
    }) as typeof fetch;
    try {
      const exporter = createRemoteExporter('webdav', { endpoint: 'https://dav.example.test/files', username: 'user', password: 'secret' });
      const result = await exporter.export({ id: 'x', markdown: '# x', metadata: { ...createEmptyMetadata('https://example.com'), title: 'x' }, assets: [], warnings: [], diagnostics: createEmptyDiagnostics() }, { path: 'notes/x.md', overwrite: 'cancel' }, { browser: 'chrome' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXPORT_CONFLICT');
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('HEAD');
      expect(calls[0].url).toContain('/files/notes/x.md');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('reconcileFloatingScripts automatically revokes orphaned <all_urls> permission', async () => {
    // Mock storage returning settings with allSites = false
    const currentSettings = {
      ...DEFAULT_SETTINGS,
      permissions: { allSites: false, siteOrigins: [] },
    };
    browser.storage.local.get = vi.fn().mockResolvedValue({ [SETTINGS_KEY]: currentSettings }) as any;
    browser.storage.local.set = vi.fn().mockResolvedValue(undefined) as any;

    let removedOrigins: string[] = [];
    browser.permissions.contains = vi.fn().mockImplementation(async ({ origins }: { origins: string[] }) => {
      return origins.includes('<all_urls>');
    }) as any;
    browser.permissions.remove = vi.fn().mockImplementation(async ({ origins }: { origins: string[] }) => {
      removedOrigins.push(...origins);
      return true;
    }) as any;

    browser.scripting.getRegisteredContentScripts = vi.fn().mockResolvedValue([]) as any;
    browser.scripting.unregisterContentScripts = vi.fn().mockResolvedValue(undefined) as any;
    browser.scripting.registerContentScripts = vi.fn().mockResolvedValue(undefined) as any;

    await reconcileFloatingScripts();

    expect(removedOrigins).toContain('<all_urls>');
  });
});
