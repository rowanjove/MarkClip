(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipImages = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_IMAGE_TIMEOUT_MS = 8000;
  const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const DEFAULT_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
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

  async function withTimeout(task, timeoutMs, controller) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return task();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller?.abort();
        reject(new Error('图片读取超时。'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([task(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  function createRequestController(signal) {
    if (typeof AbortController !== 'function') return { controller: null, cleanup: () => {} };
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    return {
      controller,
      cleanup: () => signal?.removeEventListener('abort', abort),
    };
  }

  async function inlineImages(root, options = {}) {
    const warnings = [];
    const stats = { attempted: 0, inlined: 0, failed: 0 };
    if (!root?.querySelectorAll || typeof options.fetchImpl !== 'function') return { warnings, stats };

    const cache = new Map();
    const images = [...root.querySelectorAll('img[src]')];
    let totalBytes = 0;
    const maxImageBytes = Number(options.maxImageBytes) || DEFAULT_MAX_IMAGE_BYTES;
    const maxTotalBytes = Number(options.maxTotalBytes) || DEFAULT_MAX_TOTAL_BYTES;
    const imageTimeoutMs = Number(options.imageTimeoutMs) || DEFAULT_IMAGE_TIMEOUT_MS;
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
          const request = createRequestController(options.signal);
          try {
            const remaining = options.deadline === undefined ? imageTimeoutMs : Math.min(imageTimeoutMs, options.deadline - Date.now());
            if (remaining <= 0) {
              warnings.push('图片内嵌达到时间限制，剩余图片保留原链接。');
              break;
            }
            const response = await withTimeout(
              () => options.fetchImpl(source, { credentials: 'include', signal: request.controller?.signal || options.signal }),
              remaining,
              request.controller,
            );
            if (!response?.ok) throw new Error(`HTTP ${response?.status || 'error'}`);
            const contentLength = Number(response.headers?.get?.('content-length'));
            if (contentLength > maxImageBytes || totalBytes + contentLength > maxTotalBytes) throw new Error('图片体积超过限制。');
            const bodyRemaining = options.deadline === undefined ? imageTimeoutMs : Math.min(imageTimeoutMs, options.deadline - Date.now());
            if (bodyRemaining <= 0) throw new Error('图片读取超时。');
            const blob = await withTimeout(() => response.blob(), bodyRemaining, request.controller);
            if (blob.size > maxImageBytes || totalBytes + blob.size > maxTotalBytes) throw new Error('图片体积超过限制。');
            totalBytes += blob.size;
            dataUrl = await blobToDataUrl(blob, root.ownerDocument?.defaultView);
            if (!isSafeImageDataUrl(dataUrl)) throw new Error('Response is not a supported raster image.');
            cache.set(source, dataUrl);
          } finally {
            request.cleanup();
          }
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
