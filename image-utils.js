(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipImages = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function isEmbeddableUrl(value) {
    return /^(https?:|data:)/i.test(String(value || '').trim());
  }

  function isSafeImageDataUrl(value) {
    return /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp)(?:;|,)/i.test(String(value || '').trim());
  }

  function blobToDataUrl(blob, view) {
    const FileReaderCtor = view?.FileReader || globalThis.FileReader;
    if (!FileReaderCtor) return Promise.reject(new Error('FileReader is unavailable.'));
    return new Promise((resolve, reject) => {
      const reader = new FileReaderCtor();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Unable to read image data.'));
      reader.readAsDataURL(blob);
    });
  }

  async function inlineImages(root, options = {}) {
    const warnings = [];
    const stats = { attempted: 0, inlined: 0, failed: 0 };
    if (!root?.querySelectorAll || typeof options.fetchImpl !== 'function') return { warnings, stats };

    const cache = new Map();
    const images = [...root.querySelectorAll('img[src]')];
    for (const image of images) {
      if (options.signal?.aborted) throw new Error('转换已取消。');
      const source = image.getAttribute('src') || '';
      if (!isEmbeddableUrl(source) || /^data:/i.test(source)) continue;
      stats.attempted += 1;
      if (options.deadline !== undefined && Date.now() > options.deadline) {
        warnings.push('图片内嵌达到时间限制，剩余图片保留原链接。');
        break;
      }

      try {
        let dataUrl = cache.get(source);
        if (!dataUrl) {
          const response = await options.fetchImpl(source, { credentials: 'include', signal: options.signal });
          if (!response?.ok) throw new Error(`HTTP ${response?.status || 'error'}`);
          const blob = await response.blob();
          dataUrl = await blobToDataUrl(blob, root.ownerDocument?.defaultView);
          if (!isSafeImageDataUrl(dataUrl)) throw new Error('Response is not a supported raster image.');
          cache.set(source, dataUrl);
        }
        image.setAttribute('src', dataUrl);
        image.removeAttribute('srcset');
        image.removeAttribute('data-src');
        image.removeAttribute('data-lazy-src');
        stats.inlined += 1;
      } catch (_err) {
        if (options.signal?.aborted) throw new Error('转换已取消。');
        stats.failed += 1;
        if (warnings.length === 0) warnings.push('部分图片无法内嵌，已保留原链接。');
      }
    }

    return { warnings, stats };
  }

  return { inlineImages, isEmbeddableUrl, isSafeImageDataUrl };
});
