import { browser } from 'wxt/browser';
import { loadSettings, saveSettings } from '../shared/settings';
import { YezhaiError } from '../shared/errors';

export type PermissionLevel = 'page' | 'site' | 'all';
export const FLOATING_SCRIPT_PREFIX = 'yezai-floating-';

function originPattern(origin: string): string {
  const parsed = new URL(origin);
  return `${parsed.origin}/*`;
}

function scriptId(origin: string): string {
  let hash = 2166136261;
  let secondary = 0x9e3779b9;
  for (const char of origin) { hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); secondary = Math.imul(secondary ^ char.charCodeAt(0), 2246822519); }
  return `${FLOATING_SCRIPT_PREFIX}${(hash >>> 0).toString(16)}-${(secondary >>> 0).toString(16)}`;
}

export function normaliseOrigin(value: string): string {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new YezhaiError('PERMISSION_INVALID', '只能授权不带凭据的 HTTP(S) 站点。', 'permission');
  return parsed.origin;
}

export async function requestSiteAccess(origin: string): Promise<boolean> {
  const normalised = normaliseOrigin(origin);
  return browser.permissions.request({ origins: [originPattern(normalised)] });
}

export async function hasSiteAccess(origin: string): Promise<boolean> {
  const normalised = normaliseOrigin(origin);
  return browser.permissions.contains({ origins: [originPattern(normalised)] });
}

export async function setSiteFloating(origin: string, enabled: boolean): Promise<void> {
  const normalised = normaliseOrigin(origin);
  const pattern = originPattern(normalised);
  if (enabled && !(await hasSiteAccess(normalised)) && !(await requestSiteAccess(normalised))) throw new YezhaiError('PERMISSION_DENIED', '未授予当前站点访问权限。', 'permission');
  const settings = (await loadSettings()).settings;
  if (enabled && settings.permissions.allSites) {
    settings.permissions.allSites = false;
    await browser.permissions.remove({ origins: ['<all_urls>'] }).catch(() => undefined);
    const registered = await browser.scripting.getRegisteredContentScripts({}).catch(() => []);
    const allScript = registered.find((item) => item.id === `${FLOATING_SCRIPT_PREFIX}all`);
    if (allScript) await browser.scripting.unregisterContentScripts({ ids: [allScript.id] }).catch(() => undefined);
  }
  const siteOrigins = new Set(settings.permissions.siteOrigins);
  if (enabled) siteOrigins.add(normalised); else siteOrigins.delete(normalised);
  settings.permissions.siteOrigins = [...siteOrigins].sort();
  if (enabled) settings.capture.floating = 'site';
  else if (!settings.permissions.siteOrigins.length && settings.capture.floating === 'site') settings.capture.floating = 'page';
  await saveSettings(settings);
  if (enabled) {
    await browser.scripting.registerContentScripts([{ id: scriptId(normalised), matches: [pattern], js: ['bootstrap.js', 'floating.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
  } else {
    await browser.scripting.unregisterContentScripts({ ids: [scriptId(normalised)] }).catch(() => undefined);
    await browser.permissions.remove({ origins: [pattern] }).catch(() => undefined);
  }
}

export async function setAllSitesFloating(enabled: boolean): Promise<void> {
  const settings = (await loadSettings()).settings;
  if (enabled && !(await browser.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false)) && !(await browser.permissions.request({ origins: ['<all_urls>'] }))) throw new YezhaiError('PERMISSION_DENIED', '未授予所有网站访问权限。', 'permission');
  settings.permissions.allSites = enabled;
  settings.capture.floating = enabled ? 'all' : 'page';
  await saveSettings(settings);
  const registered = await browser.scripting.getRegisteredContentScripts({}).catch(() => []);
  const ids = registered.filter((item) => item.id.startsWith(FLOATING_SCRIPT_PREFIX)).map((item) => item.id);
  if (!enabled && ids.length) await browser.scripting.unregisterContentScripts({ ids });
  if (!enabled) await browser.permissions.remove({ origins: ['<all_urls>'] }).catch(() => undefined);
  if (enabled) {
    const siteIds = registered.filter((item) => item.id.startsWith(FLOATING_SCRIPT_PREFIX) && item.id !== `${FLOATING_SCRIPT_PREFIX}all`).map((item) => item.id);
    if (siteIds.length) await browser.scripting.unregisterContentScripts({ ids: siteIds });
    if (!registered.some((item) => item.id === `${FLOATING_SCRIPT_PREFIX}all`)) await browser.scripting.registerContentScripts([{ id: `${FLOATING_SCRIPT_PREFIX}all`, matches: ['<all_urls>'], js: ['bootstrap.js', 'floating.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
  }
}

export async function reconcileFloatingScripts(): Promise<void> {
  const { settings } = await loadSettings();
  const grantedOrigins: string[] = [];
  for (const origin of settings.permissions.siteOrigins) {
    if (await hasSiteAccess(origin).catch(() => false)) grantedOrigins.push(origin);
  }
  if (grantedOrigins.length !== settings.permissions.siteOrigins.length) {
    settings.permissions.siteOrigins = grantedOrigins;
    await saveSettings(settings);
  }
  if (settings.permissions.allSites && !(await browser.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false))) {
    settings.permissions.allSites = false;
    settings.capture.floating = 'page';
    await saveSettings(settings);
  }
  if (!settings.permissions.allSites && (await browser.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false))) {
    await browser.permissions.remove({ origins: ['<all_urls>'] }).catch(() => undefined);
  }
  const registered = await browser.scripting.getRegisteredContentScripts({}).catch(() => []);
  const expected = new Set<string>();
  if (settings.permissions.allSites) expected.add(`${FLOATING_SCRIPT_PREFIX}all`);
  else for (const origin of settings.permissions.siteOrigins) expected.add(scriptId(origin));
  const existing = registered.filter((item) => item.id.startsWith(FLOATING_SCRIPT_PREFIX));
  const remove = existing.filter((item) => !expected.has(item.id)).map((item) => item.id);
  if (remove.length) await browser.scripting.unregisterContentScripts({ ids: remove });
  for (const origin of settings.permissions.siteOrigins) {
    if (!settings.permissions.allSites && !existing.some((item) => item.id === scriptId(origin))) await browser.scripting.registerContentScripts([{ id: scriptId(origin), matches: [originPattern(origin)], js: ['bootstrap.js', 'floating.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
  }
  if (settings.permissions.allSites && !existing.some((item) => item.id === `${FLOATING_SCRIPT_PREFIX}all`)) await browser.scripting.registerContentScripts([{ id: `${FLOATING_SCRIPT_PREFIX}all`, matches: ['<all_urls>'], js: ['bootstrap.js', 'floating.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
}
