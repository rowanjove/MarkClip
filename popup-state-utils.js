(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarkClipPopupState = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEYS = Object.freeze({
    theme: 'page2md:theme',
    mode: 'page2md:mode',
    removeImages: 'page2md:removeImages',
    localizeImages: 'page2md:localizeImages',
    hidden: 'page2md:floatingHidden',
  });

  const STORAGE_DEFAULTS = Object.freeze({
    [STORAGE_KEYS.theme]: 'light',
    [STORAGE_KEYS.mode]: 'main',
    [STORAGE_KEYS.removeImages]: false,
    [STORAGE_KEYS.localizeImages]: false,
    [STORAGE_KEYS.hidden]: true,
  });

  async function withOptionalOrigins(permissions, origins, options, operation) {
    const releaseAfter = Boolean(options?.releaseAfter);
    const granted = await permissions.contains({ origins });
    if (!granted) {
      const requested = await permissions.request({ origins });
      if (!requested) throw new Error(options?.deniedMessage || '未授予所需的网页访问权限。');
    }

    try {
      return await operation();
    } finally {
      if (releaseAfter) await permissions.remove({ origins });
    }
  }

  return { STORAGE_DEFAULTS, STORAGE_KEYS, withOptionalOrigins };
});
