(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipUrl = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
  const IMAGE_PROTOCOLS = new Set(['http:', 'https:', 'data:']);
  const LAZY_SOURCE_ATTRIBUTES = [
    'data-src', 'data-original', 'data-lazy-src', 'data-url',
  ];

  function isSafeRasterDataUrl(value) {
    return /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp)(?:;|,)/i.test(String(value || '').trim());
  }

  function isSafeUrl(value, kind = 'link') {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (raw.startsWith('#')) return kind === 'link';

    try {
      const protocol = new URL(raw).protocol.toLowerCase();
      if (kind === 'image' && protocol === 'data:') return isSafeRasterDataUrl(raw);
      return (kind === 'image' ? IMAGE_PROTOCOLS : LINK_PROTOCOLS).has(protocol);
    } catch (_err) {
      return false;
    }
  }

  function resolveUrl(value, baseUrl, kind = 'link') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('#')) return raw;

    let resolved;
    try {
      resolved = new URL(raw, baseUrl || undefined).href;
    } catch (_err) {
      return '';
    }

    return isSafeUrl(resolved, kind) ? resolved : '';
  }

  function chooseLazySource(element) {
    if (!element || element.getAttribute('src')?.trim()) return;
    for (const name of LAZY_SOURCE_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value?.trim()) {
        element.setAttribute('src', value.trim());
        return;
      }
    }
  }

  function normalizeSrcset(value, baseUrl) {
    return String(value || '')
      .split(',')
      .map((candidate) => {
        const parts = candidate.trim().split(/\s+/);
        const url = resolveUrl(parts.shift(), baseUrl, 'image');
        return url ? [url, ...parts].join(' ') : '';
      })
      .filter(Boolean)
      .join(', ');
  }

  function normalizeDomUrls(root, baseUrl) {
    if (!root?.querySelectorAll) return root;

    const elements = [root, ...root.querySelectorAll('*')];
    for (const element of elements) {
      if (element.nodeType !== 1) continue;
      const tagName = element.nodeName.toLowerCase();

      if (tagName === 'img' || tagName === 'source') chooseLazySource(element);

      if (element.hasAttribute('href')) {
        const href = resolveUrl(element.getAttribute('href'), baseUrl, 'link');
        if (href) element.setAttribute('href', href);
        else element.removeAttribute('href');
      }

      if (element.hasAttribute('src')) {
        const src = resolveUrl(element.getAttribute('src'), baseUrl, tagName === 'img' || tagName === 'source' ? 'image' : 'link');
        if (src) element.setAttribute('src', src);
        else element.removeAttribute('src');
      }

      if (element.hasAttribute('srcset')) {
        const srcset = normalizeSrcset(element.getAttribute('srcset'), baseUrl);
        if (srcset) element.setAttribute('srcset', srcset);
        else element.removeAttribute('srcset');
      }
    }

    return root;
  }

  return { isSafeUrl, isSafeRasterDataUrl, normalizeDomUrls, normalizeSrcset, resolveUrl };
});
