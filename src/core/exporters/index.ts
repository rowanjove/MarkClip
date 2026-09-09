import { browser } from 'wxt/browser';
import type { ClipResult, ExportContext, ExportOptions, ExportResult } from '../../shared/contracts';
import { YezhaiError } from '../../shared/errors';

export interface ExportTarget {
  id: string;
  name: string;
  isAvailable(context: ExportContext): Promise<boolean>;
  export(clip: ClipResult, options: ExportOptions, context: ExportContext): Promise<ExportResult>;
}

function success(id: string, files: string[] = [], warnings: string[] = []): ExportResult { return { success: true, targetId: id, files, warnings }; }
function failure(id: string, error: unknown): ExportResult { const value = error instanceof YezhaiError ? error : new YezhaiError('EXPORT_FAILED', error instanceof Error ? error.message : String(error), 'export'); return { success: false, targetId: id, files: [], warnings: [], error: { code: value.code, message: value.message } }; }

export function safeExportFileName(value: unknown, fallback = 'page'): string {
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  let name = String(value || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 80);
  if (!name || name === '.' || name === '..' || reserved.test(name)) name = `_${name || fallback}`;
  return name || fallback;
}

function fileName(clip: ClipResult): string { return safeExportFileName(clip.metadata.title); }

function safeRelativePath(value: string | undefined, fallback: string): string {
  const segments = String(value || fallback).split(/[\\/]+/)
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => segment.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim())
    .filter(Boolean);
  return segments.join('/') || fallback;
}

export const ClipboardExporter: ExportTarget = {
  id: 'clipboard', name: '剪贴板', async isAvailable() { return Boolean(navigator.clipboard?.writeText); },
  async export(clip) { try { await navigator.clipboard.writeText(clip.markdown); return success('clipboard'); } catch (error) { return failure('clipboard', error); } },
};

export const MarkdownExporter: ExportTarget = {
  id: 'markdown', name: 'Markdown 文件', async isAvailable() { return true; },
  async export(clip) { try { const url = URL.createObjectURL(new Blob([clip.markdown], { type: 'text/markdown;charset=utf-8' })); await browser.downloads.download({ url, filename: `${fileName(clip)}.md`, saveAs: true }); setTimeout(() => URL.revokeObjectURL(url), 10_000); return success('markdown', [`${fileName(clip)}.md`]); } catch (error) { return failure('markdown', error); } },
};

export const BundleExporter: ExportTarget = {
  id: 'bundle', name: 'Markdown + Assets', async isAvailable() { return true; },
  async export(clip) { try {
    // A browser download cannot atomically create a directory. Use the same
    // deterministic archive format as the ZIP exporter so assets and the
    // Markdown always travel together.
    const { createArchive } = await import('../assets/pipeline');
    const archive = await createArchive(clip);
    const url = URL.createObjectURL(archive);
    await browser.downloads.download({ url, filename: `${fileName(clip)}-bundle.zip`, saveAs: true });
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return success('bundle', [`${fileName(clip)}-bundle.zip`]);
  } catch (error) { return failure('bundle', error); } },
};

export const ZipExporter: ExportTarget = {
  id: 'zip', name: '完整资料包 ZIP', async isAvailable() { return true; },
  async export(clip) { try { const { createArchive } = await import('../assets/pipeline'); const archive = await createArchive(clip); const url = URL.createObjectURL(archive); await browser.downloads.download({ url, filename: `${fileName(clip)}.zip`, saveAs: true }); setTimeout(() => URL.revokeObjectURL(url), 10_000); return success('zip', [`${fileName(clip)}.zip`]); } catch (error) { return failure('zip', error); } },
};

export const ObsidianExporter: ExportTarget = {
  id: 'obsidian', name: 'Obsidian', async isAvailable() { return true; },
  async export(clip, options) {
    try {
      const params = new URLSearchParams({ vault: String(options.path || ''), file: `${fileName(clip)}.md`, content: clip.markdown });
      const targetUri = `obsidian://new?${params.toString()}`;
      if (typeof window !== 'undefined' && window.open) {
        window.open(targetUri, '_blank', 'noopener');
      } else if (typeof browser !== 'undefined' && browser.tabs?.create) {
        await browser.tabs.create({ url: targetUri });
      }
      return success('obsidian');
    } catch (error) { return failure('obsidian', error); }
  },
};

export function createRemoteExporter(id: 'github' | 'webdav' | 'joplin', config: Record<string, string>): ExportTarget {
  const endpointFor = (kind: 'github' | 'webdav' | 'joplin'): string => {
    const raw = String(config.endpoint || config.server || (kind === 'github' ? 'https://api.github.com' : ''));
    let parsed: URL;
    try { parsed = new URL(raw); } catch { throw new YezhaiError('EXPORT_FAILED', '导出 Endpoint 无效。', 'export'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || (kind === 'github' && parsed.protocol !== 'https:') || (parsed.protocol === 'http:' && !local)) throw new YezhaiError('EXPORT_FAILED', '导出 Endpoint 必须使用安全的 HTTP(S) 地址。', 'export');
    return parsed.href.replace(/\/$/, '');
  };
  return {
    id, name: id === 'github' ? 'GitHub' : id === 'webdav' ? 'WebDAV' : 'Joplin', async isAvailable() {
      if (id === 'github') return Boolean(config.repo && config.token);
      if (id === 'webdav') return Boolean(config.endpoint && (config.password || config.token));
      return Boolean(config.server && config.token);
    },
    async export(clip, options, context) {
      try {
        if (context.signal?.aborted) throw new YezhaiError('CANCELLED', '导出已取消。', 'export');
        if (id === 'github') {
          const endpoint = endpointFor('github');
          const repoParts = String(config.repo || '').split('/').filter(Boolean);
          if (repoParts.length !== 2 || repoParts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))) throw new YezhaiError('EXPORT_FAILED', 'GitHub 仓库必须是 owner/repo。', 'export');
          const path = safeRelativePath(options.path, `${fileName(clip)}.md`);
          let targetPath = path;
          const repoPath = repoParts.map(encodeURIComponent).join('/');
          const apiUrl = (candidate: string) => `${endpoint}/repos/${repoPath}/contents/${candidate.split('/').map(encodeURIComponent).join('/')}`;
          const authHeaders = { Authorization: `Bearer ${config.token || ''}`, Accept: 'application/vnd.github+json' };
          let existingSha: string | undefined;
          if (options.overwrite === 'overwrite' || options.overwrite === 'cancel') {
            const existing = await fetch(apiUrl(targetPath), { headers: authHeaders, signal: context.signal });
            if (existing.ok) existingSha = String(((await existing.json()) as { sha?: unknown }).sha || '') || undefined;
            else if (existing.status !== 404) throw new YezhaiError('EXPORT_FAILED', `GitHub HTTP ${existing.status}`, 'export');
            if (existingSha && options.overwrite === 'cancel') throw new YezhaiError('EXPORT_CONFLICT', '目标文件已存在，请选择覆盖、改名或取消。', 'export');
          } else if (options.overwrite === 'rename') {
            const dot = targetPath.lastIndexOf('.'); const stem = dot > 0 ? targetPath.slice(0, dot) : targetPath; const extension = dot > 0 ? targetPath.slice(dot) : '.md';
            targetPath = `${stem}-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${extension}`;
          }
          const bytes = new TextEncoder().encode(clip.markdown);
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          const base64Content = btoa(binary);
          const response = await fetch(apiUrl(targetPath), { method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: config.commitMessage || `Save ${clip.metadata.title}`, content: base64Content, branch: config.branch || 'main', ...(existingSha ? { sha: existingSha } : {}) }), signal: context.signal });
          if (response.status === 409 || response.status === 422) throw new YezhaiError('EXPORT_CONFLICT', '目标文件已存在或路径无效。', 'export');
          if (response.status === 401 || response.status === 403) throw new YezhaiError('EXPORT_AUTH_FAILED', 'GitHub 认证失败。', 'export');
          if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
          return success(id, [targetPath]);
        }
        if (id === 'webdav') {
          let path = safeRelativePath(options.path, `${fileName(clip)}.md`);
          const baseEndpoint = endpointFor('webdav');
          const pathUrl = (candidate: string) => `${baseEndpoint}/${candidate.split('/').map(encodeURIComponent).join('/')}`;
          if (options.overwrite === 'cancel') {
            const existing = await fetch(pathUrl(path), { method: 'HEAD', signal: context.signal });
            if (existing.ok) throw new YezhaiError('EXPORT_CONFLICT', '目标文件已存在，请选择覆盖、改名或取消。', 'export');
            if (existing.status !== 404 && existing.status !== 405) throw new YezhaiError('EXPORT_FAILED', `WebDAV HTTP ${existing.status}`, 'export');
          } else if (options.overwrite === 'rename') {
            const dot = path.lastIndexOf('.'); const stem = dot > 0 ? path.slice(0, dot) : path; const extension = dot > 0 ? path.slice(dot) : '.md';
            path = `${stem}-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${extension}`;
          }
          const endpoint = pathUrl(path);
          const auth = btoa(`${config.username || ''}:${config.password || config.token || ''}`);
          const response = await fetch(endpoint, { method: 'PUT', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'text/markdown;charset=utf-8' }, body: clip.markdown, signal: context.signal });
          if (response.status === 401 || response.status === 403) throw new YezhaiError('EXPORT_AUTH_FAILED', 'WebDAV 认证失败。', 'export');
          if (!response.ok) throw new Error(`WebDAV HTTP ${response.status}`);
          return success(id, [endpoint]);
        }
        const endpoint = `${endpointFor('joplin')}/notes`;
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Token': config.token || '' }, body: JSON.stringify({ title: clip.metadata.title, body: clip.markdown, tags: clip.metadata.tags }), signal: context.signal });
        if (response.status === 401 || response.status === 403) throw new YezhaiError('EXPORT_AUTH_FAILED', 'Joplin 认证失败。', 'export');
        if (!response.ok) throw new Error(`Joplin HTTP ${response.status}`);
        return success(id);
      } catch (error) { return failure(id, error); }
    },
  };
}

export const DEFAULT_EXPORTERS = [ClipboardExporter, MarkdownExporter, BundleExporter, ZipExporter, ObsidianExporter];

export function resolveExporter(targetId: string, config: Record<string, unknown> = {}): ExportTarget | undefined {
  const builtIn = DEFAULT_EXPORTERS.find((item) => item.id === targetId);
  if (builtIn) return builtIn;
  if (targetId === 'github' || targetId === 'webdav' || targetId === 'joplin') {
    const values = config[targetId];
    return values && typeof values === 'object' && !Array.isArray(values) ? createRemoteExporter(targetId, Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === 'string').map(([key, value]) => [key, value as string]))) : undefined;
  }
  return undefined;
}
