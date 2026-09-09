
export type BrowserFamily = 'chrome' | 'edge' | 'firefox' | 'safari' | 'unknown';

export function detectBrowser(userAgent = globalThis.navigator?.userAgent || ''): BrowserFamily {
  if (/Firefox\//i.test(userAgent)) return 'firefox';
  if (/Edg\//i.test(userAgent)) return 'edge';
  if (/Chrome\//i.test(userAgent)) return 'chrome';
  if (/Safari\//i.test(userAgent)) return 'safari';
  return 'unknown';
}

/** Safari Web Extension conversion keeps the same ESM core; only the
 * browser-specific manifest and side-panel/sidebar host need Xcode packaging. */
export function safariCapabilities(): { supported: boolean; notes: string[] } {
  return { supported: true, notes: ['Use the Chrome MV3 output as the source for Safari Web Extension Converter.', 'Map side_panel to Safari Web Extension popover or a Safari app extension window.', 'Keep optional host permissions and storage keys unchanged.'] };
}

export function hasSideSurface(browser: { sidePanel?: unknown; sidebarAction?: unknown }): boolean {
  return Boolean((browser as unknown as { sidePanel?: unknown }).sidePanel || (browser as unknown as { sidebarAction?: unknown }).sidebarAction);
}
