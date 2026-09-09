const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;

export function isSafeUrl(value: string, kind: 'link' | 'image' = 'link'): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (/^data:image\//i.test(raw)) return kind === 'image' && SAFE_DATA_IMAGE.test(raw);
  try {
    const url = new URL(raw);
    return SAFE_SCHEMES.has(url.protocol) && (kind !== 'image' || ['http:', 'https:'].includes(url.protocol));
  } catch {
    return false;
  }
}

export function resolveSafeUrl(value: string | null | undefined, baseUrl: string, kind: 'link' | 'image' = 'link'): string {
  const raw = String(value || '').trim();
  if (!raw || /^javascript:/i.test(raw) || /^vbscript:/i.test(raw)) return '';
  if (/^data:/i.test(raw)) return isSafeUrl(raw, kind) ? raw : '';
  try {
    const resolved = new URL(raw, baseUrl);
    return isSafeUrl(resolved.href, kind) ? resolved.href : '';
  } catch {
    return '';
  }
}

export function normalizeDomUrls(root: ParentNode, baseUrl: string): void {
  root.querySelectorAll?.('[href], [src], [srcset], [data-src], [data-lazy-src]').forEach((element) => {
    const node = element as Element;
    if (node.nodeName === 'IMG' && !node.hasAttribute('src')) {
      const lazy = node.getAttribute('data-src') || node.getAttribute('data-lazy-src');
      if (lazy) node.setAttribute('src', lazy);
    }
    if (node.hasAttribute('href')) {
      const value = resolveSafeUrl(node.getAttribute('href'), baseUrl, 'link');
      value ? node.setAttribute('href', value) : node.removeAttribute('href');
    }
    if (node.hasAttribute('src')) {
      const value = resolveSafeUrl(node.getAttribute('src'), baseUrl, 'image');
      value ? node.setAttribute('src', value) : node.removeAttribute('src');
    }
    for (const attribute of ['data-src', 'data-lazy-src']) {
      if (!node.hasAttribute(attribute)) continue;
      const value = resolveSafeUrl(node.getAttribute(attribute), baseUrl, 'image');
      value ? node.setAttribute(attribute, value) : node.removeAttribute(attribute);
    }
    if (node.hasAttribute('srcset')) {
      const entries = (node.getAttribute('srcset') || '').split(',').map((entry) => {
        const [candidate, descriptor] = entry.trim().split(/\s+/, 2);
        const value = resolveSafeUrl(candidate, baseUrl, 'image');
        return value ? [value, descriptor].filter(Boolean).join(' ') : '';
      }).filter(Boolean);
      entries.length ? node.setAttribute('srcset', entries.join(', ')) : node.removeAttribute('srcset');
    }
  });
}

export function sanitizeHtml(root: HTMLElement, baseUrl: string): HTMLElement {
  // Convert legacy TeX script blocks before the executable-script sweep. The
  // resulting declarative marker is handled by the standardizer and cannot be
  // executed by the page or an archive viewer.
  root.querySelectorAll('script[type="math/tex"], script[type="math/tex; mode=display"]').forEach((node) => {
    const raw = node.textContent?.trim() || '';
    if (!raw) { node.remove(); return; }
    const replacement = root.ownerDocument!.createElement(node.getAttribute('type')?.includes('mode=display') ? 'div' : 'span');
    replacement.setAttribute('data-yezai-math', replacement.nodeName === 'DIV' ? 'display' : 'inline');
    replacement.textContent = raw;
    node.replaceWith(replacement);
  });
  root.querySelectorAll('script,style,noscript,iframe,object,embed,form').forEach((node) => node.remove());
  root.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || attribute.name.toLowerCase() === 'srcdoc') element.removeAttribute(attribute.name);
    }
  });
  normalizeDomUrls(root, baseUrl);
  return root;
}
