import type { ClipMetadata } from '../../shared/contracts';
import { createEmptyMetadata } from '../../shared/contracts';
import { resolveSafeUrl } from '../standardize/url';

type Source = 'recipe' | 'defuddle' | 'readability' | 'schema.org' | 'og' | 'twitter' | 'meta' | 'document';

export interface MetadataCandidate {
  source: Source;
  values: Partial<ClipMetadata> & { title?: string; canonicalUrl?: string; authors?: string[] };
}

function first<T>(candidates: MetadataCandidate[], key: keyof ClipMetadata): { value?: T; source?: Source } {
  for (const candidate of candidates) {
    const value = candidate.values[key] as T | undefined;
    if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) return { value, source: candidate.source };
  }
  return {};
}

export function collectDocumentMetadata(document: Document, url = document.location?.href || ''): { metadata: ClipMetadata; sources: Record<string, string> } {
  // Keep both the displayed source URL and canonical fallback within the
  // same HTTP(S)-only boundary used by DOM URL normalization. A caller can
  // invoke the pipeline directly (outside the browser message validator), so
  // do not let an unsafe `url` become frontmatter or metadata output.
  const safeBaseUrl = safeHttpUrl(url, '');
  const metadataUrl = safeBaseUrl || '';
  const meta = (name: string): string | undefined => document.querySelector(`meta[name="${name}"],meta[property="${name}"]`)?.getAttribute('content') || undefined;
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || undefined;
  const favicon = document.querySelector('link[rel~="icon"]')?.getAttribute('href') || undefined;
  const jsonLd: unknown[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    try { jsonLd.push(JSON.parse(node.textContent || '')); } catch { /* malformed metadata is ignored */ }
  });
  const schema = jsonLd.flatMap((value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      return Array.isArray(record['@graph']) ? record['@graph'] : [record];
    }
    return [];
  }).filter((value) => value && typeof value === 'object' && !Array.isArray(value)).sort((left, right) => {
    const rank = (item: unknown) => /article|newsarticle|blogposting/i.test(String((item as Record<string, unknown>)?.['@type'] || '')) ? 1 : 0;
    return rank(right) - rank(left);
  })[0] as Record<string, unknown> | undefined;
  const recipe: MetadataCandidate = { source: 'recipe', values: {} };
  const defuddle: MetadataCandidate = { source: 'defuddle', values: {} };
  const schemaCandidate: MetadataCandidate = { source: 'schema.org', values: {
    title: typeof schema?.headline === 'string' ? schema.headline : typeof schema?.name === 'string' ? schema.name : undefined,
    authors: Array.isArray(schema?.author) ? schema.author.map((author) => author && typeof author === 'object' && typeof (author as Record<string, unknown>).name === 'string' ? (author as Record<string, string>).name : typeof author === 'string' ? author : '').filter(Boolean) : typeof schema?.author === 'object' && schema.author && 'name' in schema.author && typeof schema.author.name === 'string' ? [schema.author.name] : typeof schema?.author === 'string' ? [schema.author] : undefined,
    publishedAt: typeof schema?.datePublished === 'string' ? schema.datePublished : undefined,
    modifiedAt: typeof schema?.dateModified === 'string' ? schema.dateModified : undefined,
    description: typeof schema?.description === 'string' ? schema.description : undefined,
    heroImage: typeof schema?.image === 'string' ? schema.image : schema?.image && typeof schema.image === 'object' && typeof (schema.image as Record<string, unknown>).url === 'string' ? String((schema.image as Record<string, unknown>).url) : undefined,
    tags: Array.isArray(schema?.keywords) ? schema.keywords.filter((item): item is string => typeof item === 'string') : typeof schema?.keywords === 'string' ? schema.keywords.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
  } };
  const og: MetadataCandidate = { source: 'og', values: {
    title: meta('og:title'), description: meta('og:description'), siteName: meta('og:site_name'), heroImage: meta('og:image') ? resolveSafeUrl(meta('og:image'), url, 'image') || undefined : undefined,
  } };
  const twitterImage = meta('twitter:image');
  const twitter: MetadataCandidate = { source: 'twitter', values: { title: meta('twitter:title'), description: meta('twitter:description'), heroImage: twitterImage ? resolveSafeUrl(twitterImage, url, 'image') || undefined : undefined } };
  const htmlMeta: MetadataCandidate = { source: 'meta', values: { title: meta('title'), description: meta('description'), authors: meta('author') ? [meta('author') as string] : undefined, tags: meta('keywords')?.split(',').map((item) => item.trim()).filter(Boolean), language: document.documentElement.lang || undefined } };
  let canonicalUrl = safeBaseUrl;
  try {
    const candidate = canonical ? new URL(canonical, url || undefined) : undefined;
    if (candidate && (candidate.protocol === 'http:' || candidate.protocol === 'https:')) canonicalUrl = candidate.href;
  } catch { /* keep current URL */ }
  const documentCandidate: MetadataCandidate = { source: 'document', values: { title: document.title, canonicalUrl: canonicalUrl || undefined, favicon: favicon ? resolveSafeUrl(favicon, url, 'image') || undefined : undefined } };
  const candidates = [recipe, defuddle, schemaCandidate, og, twitter, htmlMeta, documentCandidate];
  const result = createEmptyMetadata(metadataUrl);
  const sources: Record<string, string> = {};
  const assign = <K extends keyof ClipMetadata>(key: K, fallback: ClipMetadata[K]): void => {
    const found = first<ClipMetadata[K]>(candidates, key);
    result[key] = (found.value ?? fallback) as ClipMetadata[K];
    if (found.source) sources[key] = found.source;
  };
  assign('title', 'Untitled');
  assign('canonicalUrl', canonicalUrl || undefined);
  assign('authors', []);
  assign('description', undefined);
  assign('siteName', undefined);
  assign('publishedAt', undefined);
  assign('modifiedAt', undefined);
  assign('language', document.documentElement.lang || undefined);
  assign('heroImage', undefined);
  assign('contentType', document.contentType || 'text/html');
  result.schemaOrg = schema;
  if (schema) sources.schemaOrg = 'schema.org';
  if (result.heroImage) result.heroImage = resolveSafeUrl(result.heroImage, url, 'image') || undefined;
  if (!result.siteName) {
    try { result.siteName = new URL(url || 'https://localhost').hostname; } catch { /* malformed caller URL leaves siteName unset */ }
  }
  result.extra = {};
  return { metadata: result, sources };
}

export function mergeMetadata(base: ClipMetadata, ...candidates: MetadataCandidate[]): { metadata: ClipMetadata; sources: Record<string, string> } {
  const result = { ...base, authors: [...base.authors], tags: [...base.tags], extra: { ...base.extra } };
  const sources: Record<string, string> = {};
  for (const candidate of candidates) {
    for (const [key, value] of Object.entries(candidate.values)) {
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
      if (key === 'extra' && typeof value === 'object') result.extra = { ...result.extra, ...(value as Record<string, unknown>) };
      else if (key === 'canonicalUrl' && typeof value === 'string') {
        const safe = safeHttpUrl(value, result.url);
        if (!safe) continue;
        result.canonicalUrl = safe;
      } else if ((key === 'heroImage' || key === 'favicon') && typeof value === 'string') {
        const safe = resolveSafeUrl(value, result.url, 'image');
        if (!safe) continue;
        (result as Record<string, unknown>)[key] = safe;
      } else (result as Record<string, unknown>)[key] = Array.isArray(value) ? [...value] : value;
      sources[key] = candidate.source;
    }
  }
  return { metadata: result, sources };
}

function safeHttpUrl(value: string, baseUrl: string): string {
  try {
    const parsed = new URL(value, baseUrl || undefined);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch { return ''; }
}
