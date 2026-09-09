import type { ClipAsset } from '../../shared/contracts';
import { YezhaiError } from '../../shared/errors';
import { zipSync, strToU8 } from 'fflate';
import { redactSecrets } from '../../shared/redaction';

export interface AssetPipelineOptions {
  signal?: AbortSignal;
  concurrency?: number;
  maxImageBytes?: number;
  maxTotalBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface AssetPipelineResult {
  assets: ClipAsset[];
  warnings: string[];
  imageStats: { attempted: number; success: number; failed: number; skipped: number };
}

const SAFE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml']);
// SVG is allowed as a downloaded asset, but never embedded as a data URL:
// an arbitrary SVG can contain active content when rendered by a Markdown
// consumer. Keeping it file-backed preserves the archive use case without
// widening the single-file embed surface.
const SAFE_EMBED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function safeFileName(url: string, mime = 'image/webp'): string {
  const extension = (mime.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') || url.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i)?.[1] || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  return `${stableHash(url)}.${extension}`;
}

function safeArchiveName(value: unknown, fallback: string): string {
  let name = String(value || fallback).replace(/[\\/]+/g, '_').replace(/\.\.+/g, '_').replace(/[^a-zA-Z0-9._\u0080-\uffff-]/g, '_').slice(0, 180).trim().replace(/[. ]+$/g, '');
  if (!name || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) name = `_${name || fallback}`;
  return name || fallback;
}

async function fetchBlobWithTimeout(fetchImpl: typeof fetch, source: string, signal: AbortSignal | undefined, timeoutMs: number, maxBytes: number): Promise<{ response: Response; blob: Blob }> {
  const controller = new AbortController();
  let rejectAbort!: (reason?: unknown) => void;
  const abortPromise = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { controller.abort(signal?.reason); rejectAbort(new YezhaiError('CANCELLED', '资源下载已取消。', 'asset')); };
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  let rejectTimeout!: (reason?: unknown) => void;
  const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); rejectTimeout(new YezhaiError('ASSET_TIMEOUT', '图片下载超时。', 'asset', { retryable: true })); }, timeoutMs);
  // Never forward the current page's cookies to a third-party asset host.
  // Same-origin cookies still work for authenticated images on the page's own
  // origin, while cross-origin assets remain explicitly unauthenticated.
  try {
    const response = await fetchImpl(source, { credentials: 'same-origin', signal: controller.signal });
    if (!response.body?.getReader) {
      const blob = await Promise.race([
        response.blob(),
        timeoutPromise,
        abortPromise,
      ]);
      if (blob.size > maxBytes) throw new YezhaiError('ASSET_TOO_LARGE', '图片体积超过限制。', 'asset');
      return { response, blob };
    }
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let total = 0;
    while (true) {
      if (signal?.aborted) throw new YezhaiError('CANCELLED', '资源下载已取消。', 'asset');
      const next = await Promise.race([reader.read(), timeoutPromise, abortPromise]);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) { await reader.cancel().catch(() => undefined); throw new YezhaiError('ASSET_TOO_LARGE', '图片体积超过限制。', 'asset'); }
      chunks.push(next.value.slice().buffer as ArrayBuffer);
    }
    return { response, blob: new Blob(chunks, { type: response.headers.get('content-type') || '' }) };
  } catch (error) {
    if (timedOut) throw new YezhaiError('ASSET_TIMEOUT', '图片下载超时。', 'asset', { retryable: true });
    if (signal?.aborted) throw new YezhaiError('CANCELLED', '资源下载已取消。', 'asset');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

async function digest(blob: Blob): Promise<string> {
  if (!crypto.subtle) return crypto.randomUUID().replaceAll('-', '');
  const bytes = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

export async function downloadAssets(root: ParentNode, options: AssetPipelineOptions = {}): Promise<AssetPipelineResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const images = [...(root.querySelectorAll?.('img[src]') ?? [])] as HTMLImageElement[];
  const maxImageBytes = options.maxImageBytes ?? 8 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? 32 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 4));
  const warnings: string[] = [];
  const assets: ClipAsset[] = [];
  const sourceToAsset = new Map<string, ClipAsset>();
  const hashToAsset = new Map<string, ClipAsset>();
  let totalBytes = 0;
  let next = 0;
  const stats = { attempted: 0, success: 0, failed: 0, skipped: 0 };
  if (!fetchImpl) return { assets, warnings: ['当前环境不支持图片下载，已保留原链接。'], imageStats: stats };

  const worker = async (): Promise<void> => {
    while (next < images.length) {
      if (options.signal?.aborted) throw new YezhaiError('CANCELLED', '资源下载已取消。', 'asset');
      if (totalBytes >= maxTotalBytes) return;
      const image = images[next++];
      const source = image.getAttribute('src') || '';
      if (image.width === 1 || image.height === 1 || image.getAttribute('aria-hidden') === 'true') { stats.skipped += 1; continue; }
      let parsed: URL;
      try { parsed = new URL(source); } catch { stats.skipped += 1; continue; }
      if (!/^https?:$/.test(parsed.protocol)) { stats.skipped += 1; continue; }
      stats.attempted += 1;
      const known = sourceToAsset.get(source);
      if (known) { image.setAttribute('src', `assets/${known.fileName}`); stats.success += 1; continue; }
      try {
        const { response, blob } = await fetchBlobWithTimeout(fetchImpl, source, options.signal, timeoutMs, maxImageBytes);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const type = response.headers.get('content-type')?.split(';')[0].toLowerCase() || '';
        const length = Number(response.headers.get('content-length'));
        if (length > maxImageBytes || (type && !SAFE_IMAGE_TYPES.has(type))) throw new Error('unsupported asset');
        if (blob.size > maxImageBytes) throw new YezhaiError('ASSET_TOO_LARGE', '图片体积超过限制。', 'asset');
        const actualType = (blob.type || type).split(';')[0].toLowerCase();
        if (!SAFE_IMAGE_TYPES.has(actualType)) throw new Error('unsupported asset');
        const hash = await digest(blob);
        const duplicate = hashToAsset.get(hash);
        if (duplicate) {
          sourceToAsset.set(source, duplicate);
          image.setAttribute('src', `assets/${duplicate.fileName}`);
          stats.success += 1;
          continue;
        }
        if (totalBytes + blob.size > maxTotalBytes) throw new YezhaiError('ASSET_TOO_LARGE', '图片总体积超过限制。', 'asset');
        totalBytes += blob.size;
        const baseName = safeFileName(source, actualType);
        const extension = baseName.includes('.') ? `.${baseName.split('.').pop()}` : '';
        const stem = extension ? baseName.slice(0, -extension.length) : baseName;
        let fileName = baseName; let suffix = 2;
        while (assets.some((item) => item.fileName === fileName)) fileName = `${stem}-${suffix++}${extension}`;
        const asset: ClipAsset = { id: crypto.randomUUID(), kind: 'image', sourceUrl: source, fileName, mimeType: blob.type || type, size: blob.size, data: blob, status: 'ready' };
        assets.push(asset); sourceToAsset.set(source, asset); hashToAsset.set(hash, asset);
        image.setAttribute('src', `assets/${asset.fileName}`); image.removeAttribute('srcset');
        stats.success += 1;
      } catch (error) {
        if (options.signal?.aborted) throw new YezhaiError('CANCELLED', '资源下载已取消。', 'asset');
        stats.failed += 1;
        warnings.push(error instanceof YezhaiError ? error.message : '部分图片无法保存，已保留原链接。');
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { assets, warnings: [...new Set(warnings)], imageStats: stats };
}

/** Fetch remote images and replace their references with bounded data URLs. */
export async function embedImages(root: ParentNode, options: AssetPipelineOptions = {}): Promise<{ warnings: string[]; imageStats: AssetPipelineResult['imageStats'] }> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const images = [...(root.querySelectorAll?.('img[src]') ?? [])] as HTMLImageElement[];
  const maxImageBytes = options.maxImageBytes ?? 4 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? 32 * 1024 * 1024;
  const warnings: string[] = [];
  const stats = { attempted: 0, success: 0, failed: 0, skipped: 0 };
  let totalBytes = 0;
  if (!fetchImpl) return { warnings: ['当前环境不支持图片内嵌，已保留原链接。'], imageStats: stats };
  for (const image of images) {
    if (options.signal?.aborted) throw new YezhaiError('CANCELLED', '资源下载已取消。', 'asset');
    const source = image.getAttribute('src') || '';
    if (image.width === 1 || image.height === 1 || image.getAttribute('aria-hidden') === 'true') { stats.skipped += 1; continue; }
    let parsed: URL;
    try { parsed = new URL(source); } catch { stats.skipped += 1; continue; }
    if (!/^https?:$/.test(parsed.protocol)) { stats.skipped += 1; continue; }
    stats.attempted += 1;
    try {
      const { response, blob } = await fetchBlobWithTimeout(fetchImpl, source, options.signal, options.timeoutMs ?? 20_000, maxImageBytes);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type')?.split(';')[0].toLowerCase() || '';
      if (type && !SAFE_EMBED_IMAGE_TYPES.has(type)) throw new Error('unsupported asset');
      if (blob.size > maxImageBytes) throw new YezhaiError('ASSET_TOO_LARGE', '图片体积超过限制。', 'asset');
      const actualType = (blob.type || type).split(';')[0].toLowerCase();
      if (!SAFE_EMBED_IMAGE_TYPES.has(actualType)) throw new Error('unsupported asset');
      if (totalBytes + blob.size > maxTotalBytes) throw new YezhaiError('ASSET_TOO_LARGE', '图片总体积超过限制。', 'asset');
      totalBytes += blob.size;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      image.setAttribute('src', `data:${blob.type || type || 'application/octet-stream'};base64,${btoa(binary)}`);
      image.removeAttribute('srcset'); stats.success += 1;
    } catch (error) {
      if (options.signal?.aborted) throw new YezhaiError('CANCELLED', '资源下载已取消。', 'asset');
      stats.failed += 1; warnings.push(error instanceof YezhaiError ? error.message : '部分图片无法内嵌，已保留原链接。');
    }
  }
  return { warnings: [...new Set(warnings)], imageStats: stats };
}

export async function createArchive(clip: { markdown: string; metadata: unknown; diagnostics: unknown; assets: ClipAsset[]; snapshot?: ClipAsset }): Promise<Blob> {
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: 'article.md', data: strToU8(clip.markdown) },
    { name: 'metadata.json', data: strToU8(JSON.stringify(redactSecrets(clip.metadata), null, 2)) },
    { name: 'diagnostics.json', data: strToU8(JSON.stringify(redactSecrets(clip.diagnostics), null, 2)) },
  ];
  const usedAssetNames = new Set<string>();
  for (const asset of clip.assets) if (asset.data) {
    const safeName = safeArchiveName(asset.fileName, 'asset.bin');
    let name = safeName; let suffix = 2;
    while (usedAssetNames.has(name)) name = `${safeName.replace(/(\.[^.]+)?$/, (_, extension = '') => `-${suffix++}${extension}`)}`;
    usedAssetNames.add(name);
    files.push({ name: `assets/${name}`, data: new Uint8Array(await asset.data.arrayBuffer()) });
  }
  if (clip.snapshot?.data) files.push({ name: 'original.html', data: new Uint8Array(await clip.snapshot.data.arrayBuffer()) });
  files.push({ name: 'manifest.json', data: strToU8(JSON.stringify({ format: 'yezai-archive', version: 1, files: files.map(({ name }) => name) }, null, 2)) });
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) entries[file.name] = file.data;
  return new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' });
}

export async function createBatchArchive(clips: Array<{ id: string; markdown: string; metadata: unknown; diagnostics: unknown; assets?: ClipAsset[]; snapshot?: ClipAsset }>): Promise<Blob> {
  const files: Array<{ name: string; data: Uint8Array }> = [];
  const used = new Set<string>();
  for (const clip of clips) {
    const base = safeArchiveName(String((clip.metadata as { title?: unknown })?.title || clip.id || 'page').replace(/[\/:*?"<>|]/g, '_').replace(/\s+/g, ' '), 'page').slice(0, 80) || 'page';
    let name = base; let suffix = 2;
    while (used.has(name)) name = `${base}-${suffix++}`;
    used.add(name);
    files.push({ name: `${name}/article.md`, data: strToU8(clip.markdown) });
    files.push({ name: `${name}/metadata.json`, data: strToU8(JSON.stringify(redactSecrets(clip.metadata), null, 2)) });
    files.push({ name: `${name}/diagnostics.json`, data: strToU8(JSON.stringify(redactSecrets(clip.diagnostics), null, 2)) });
    const usedAssetNames = new Set<string>();
    for (const asset of clip.assets || []) if (asset.data) {
      const safeName = safeArchiveName(asset.fileName, 'asset.bin');
      let assetName = safeName; let assetSuffix = 2;
      while (usedAssetNames.has(assetName)) assetName = `${safeName.replace(/(\.[^.]+)?$/, (_, extension = '') => `-${assetSuffix++}${extension}`)}`;
      usedAssetNames.add(assetName);
      files.push({ name: `${name}/assets/${assetName}`, data: new Uint8Array(await asset.data.arrayBuffer()) });
    }
    if (clip.snapshot?.data) files.push({ name: `${name}/original.html`, data: new Uint8Array(await clip.snapshot.data.arrayBuffer()) });
  }
  files.push({ name: 'manifest.json', data: strToU8(JSON.stringify({ format: 'yezai-batch-archive', version: 1, files: files.map(({ name }) => name) }, null, 2)) });
  const entries: Record<string, Uint8Array> = {}; for (const file of files) entries[file.name] = file.data;
  return new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' });
}
