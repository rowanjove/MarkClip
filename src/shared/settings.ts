import { browser } from 'wxt/browser';

export interface SiteRecipeSettings {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  definition: unknown;
  migrationWarning?: string;
}

export interface YezhaiSettingsV2 {
  version: 2;
  appearance: { theme: 'light' | 'dark' };
  capture: { mode: 'main' | 'selection' | 'pick' | 'full' | 'highlights'; floating: 'page' | 'site' | 'all' };
  extraction: { profile: 'smart' | 'recipe' | 'defuddle' | 'readability' | 'semantic' };
  images: { mode: 'remote' | 'remove' | 'embed' | 'assets'; maxImageBytes: number; maxTotalBytes: number };
  permissions: { siteOrigins: string[]; allSites: boolean };
  profiles: unknown[];
  templates: unknown[];
  recipes: SiteRecipeSettings[];
  exporters: Record<string, unknown>;
  ai: { enabled: boolean; provider?: string; endpoint?: string; model?: string; rememberCredentials: boolean; credentials?: { apiKey?: string } };
}

export const SETTINGS_KEY = 'yezai:settings:v2';
export const MIGRATION_KEY = 'yezai:settings:migration:v2';

function safeRecipeSettings(value: unknown): SiteRecipeSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Partial<SiteRecipeSettings>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.enabled !== 'boolean' || !Number.isFinite(Number(item.priority)) || !item.definition || typeof item.definition !== 'object' || Array.isArray(item.definition)) return null;
  return { id: item.id.slice(0, 128), name: item.name.slice(0, 200), enabled: item.enabled, priority: Number(item.priority), definition: item.definition, migrationWarning: typeof item.migrationWarning === 'string' ? item.migrationWarning.slice(0, 500) : undefined };
}

function safeHttpEndpoint(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.length > 2_000) return fallback;
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href.replace(/\/$/, '') : fallback; } catch { return fallback; }
}

export const DEFAULT_SETTINGS: YezhaiSettingsV2 = {
  version: 2,
  appearance: { theme: 'light' },
  capture: { mode: 'main', floating: 'page' },
  extraction: { profile: 'smart' },
  images: { mode: 'remote', maxImageBytes: 8 * 1024 * 1024, maxTotalBytes: 32 * 1024 * 1024 },
  permissions: { siteOrigins: [], allSites: false },
  profiles: [],
  templates: [],
  recipes: [],
  exporters: {},
  ai: { enabled: false, provider: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'llama3.2', rememberCredentials: false },
};

function cloneDefaults(): YezhaiSettingsV2 {
  return structuredClone(DEFAULT_SETTINGS);
}

function normaliseSettings(value: unknown): YezhaiSettingsV2 {
  const input = value && typeof value === 'object' ? value as Partial<YezhaiSettingsV2> : {};
  const base = cloneDefaults();
  const appearanceInput = (input.appearance && typeof input.appearance === 'object' ? input.appearance : {}) as Partial<YezhaiSettingsV2['appearance']>;
  const captureInput = (input.capture && typeof input.capture === 'object' ? input.capture : {}) as Partial<YezhaiSettingsV2['capture']>;
  const extractionInput = (input.extraction && typeof input.extraction === 'object' ? input.extraction : {}) as Partial<YezhaiSettingsV2['extraction']>;
  const imagesInput = (input.images && typeof input.images === 'object' ? input.images : {}) as Partial<YezhaiSettingsV2['images']>;
  const permissionsInput = (input.permissions && typeof input.permissions === 'object' ? input.permissions : {}) as Partial<YezhaiSettingsV2['permissions']>;
  const aiInput = (input.ai && typeof input.ai === 'object' ? input.ai : {}) as Partial<YezhaiSettingsV2['ai']>;
  const theme = appearanceInput.theme === 'dark' || appearanceInput.theme === 'light' ? appearanceInput.theme : base.appearance.theme;
  const captureMode = ['main', 'selection', 'pick', 'full', 'highlights'].includes(String(captureInput.mode)) ? captureInput.mode as YezhaiSettingsV2['capture']['mode'] : base.capture.mode;
  const floating = captureInput.floating;
  const extraction = extractionInput.profile;
  const imageMode = imagesInput.mode;
  const maxImageBytes = Number(imagesInput.maxImageBytes);
  const maxTotalBytes = Number(imagesInput.maxTotalBytes);
  const allSites = permissionsInput.allSites === true;
  const siteOrigins = Array.isArray(permissionsInput.siteOrigins) ? permissionsInput.siteOrigins.filter((origin): origin is string => {
    if (typeof origin !== 'string') return false;
    try { const parsed = new URL(origin); return ['http:', 'https:'].includes(parsed.protocol) && parsed.pathname === '/' && !parsed.search && !parsed.hash; } catch { return false; }
  }).map((origin) => new URL(origin).origin).filter((origin, index, values) => values.indexOf(origin) === index).sort() : [];
  const rememberCredentials = aiInput.rememberCredentials === true;
  const apiKey = aiInput.credentials && typeof aiInput.credentials === 'object' && typeof aiInput.credentials.apiKey === 'string' ? aiInput.credentials.apiKey.slice(0, 8_000) : undefined;
  return {
    ...base,
    ...input,
    version: 2,
    appearance: { theme },
    capture: { mode: captureMode, floating: floating === 'site' || floating === 'all' || floating === 'page' ? floating : base.capture.floating },
    extraction: { profile: ['smart', 'recipe', 'defuddle', 'readability', 'semantic'].includes(String(extraction)) ? extraction as YezhaiSettingsV2['extraction']['profile'] : base.extraction.profile },
    images: { mode: ['remote', 'remove', 'embed', 'assets'].includes(String(imageMode)) ? imageMode as YezhaiSettingsV2['images']['mode'] : base.images.mode, maxImageBytes: Number.isFinite(maxImageBytes) && maxImageBytes >= 1024 && maxImageBytes <= 64 * 1024 * 1024 ? maxImageBytes : base.images.maxImageBytes, maxTotalBytes: Number.isFinite(maxTotalBytes) && maxTotalBytes >= 1024 && maxTotalBytes <= 256 * 1024 * 1024 ? maxTotalBytes : base.images.maxTotalBytes },
    permissions: { siteOrigins, allSites },
    profiles: Array.isArray(input.profiles) ? input.profiles.slice(0, 100) : [],
    templates: Array.isArray(input.templates) ? input.templates.slice(0, 100) : [],
    recipes: Array.isArray(input.recipes) ? input.recipes.map(safeRecipeSettings).filter((item): item is SiteRecipeSettings => Boolean(item)).slice(0, 200) : [],
    exporters: input.exporters && typeof input.exporters === 'object' && !Array.isArray(input.exporters) ? input.exporters : {},
    ai: { enabled: aiInput.enabled === true, provider: typeof aiInput.provider === 'string' ? aiInput.provider.slice(0, 64) : base.ai.provider, endpoint: safeHttpEndpoint(aiInput.endpoint, base.ai.endpoint || ''), model: typeof aiInput.model === 'string' ? aiInput.model.slice(0, 200) : base.ai.model, rememberCredentials, credentials: rememberCredentials && apiKey ? { apiKey } : undefined },
  };
}

export function migrateLegacy(raw: Record<string, unknown>): YezhaiSettingsV2 {
  const settings = cloneDefaults();
  settings.appearance.theme = raw['page2md:theme'] === 'dark' ? 'dark' : 'light';
  const oldMode = raw['page2md:mode'];
  if (oldMode === 'main' || oldMode === 'selection' || oldMode === 'pick' || oldMode === 'full') settings.capture.mode = oldMode;
  settings.images.mode = raw['page2md:removeImages'] === true ? 'remove' : raw['page2md:localizeImages'] === true ? 'embed' : 'remote';
  const legacyFloatingAll = raw['page2md:floatingHidden'] === false;
  settings.capture.floating = legacyFloatingAll ? 'all' : 'page';
  settings.permissions.allSites = legacyFloatingAll;
  settings.exporters.obsidian = {
    vault: raw.obsidianVault ?? '',
    pathTemplate: raw.obsidianPathTemplate ?? '{{title}}.md',
  };
  if (Array.isArray(raw.siteRules)) {
    settings.recipes = raw.siteRules.map((rule, index) => {
      const value = rule && typeof rule === 'object' ? rule as Record<string, unknown> : {};
      const host = typeof value.host === 'string' ? value.host.trim().toLowerCase() : '';
      const selector = typeof value.selector === 'string' ? value.selector.trim() : '';
      const valid = Boolean(host && /^(?:\*\.)?[a-z0-9.-]+(?::\d+)?$/i.test(host) && selector && !/[<>]|javascript:/i.test(selector));
      const imageMode = value.removeImages === true ? 'remove' : value.localizeImages === true ? 'embed' : 'remote';
      return {
        id: `migrated-${index + 1}`,
        name: `Migrated site rule ${index + 1}`,
        enabled: valid,
        priority: 0,
        migrationWarning: valid ? undefined : '旧 Site Rule 缺少有效 host 或 selector，已禁用。',
        definition: { id: `migrated-${index + 1}`, name: `Migrated site rule ${index + 1}`, version: 1, matches: host ? [{ host }] : [], priority: 0, capture: { selector: selector || undefined, fallback: 'smart' }, exclude: [], metadata: typeof value.titleSelector === 'string' && value.titleSelector.trim() ? { title: { selector: value.titleSelector.trim() } } : {}, transform: { preserveTables: true, preserveCode: true, preserveCallouts: true, imageMode }, template: typeof value.template === 'string' && value.template ? { inline: value.template } : undefined },
      };
    });
  }
  return settings;
}

export async function loadSettings(): Promise<{ settings: YezhaiSettingsV2; migrated: boolean; warnings: string[] }> {
  const raw = await browser.storage.local.get(null) as Record<string, unknown>;
  const current = raw[SETTINGS_KEY];
  if (current && typeof current === 'object') return { settings: normaliseSettings(current), migrated: false, warnings: [] };
  const migrated = migrateLegacy(raw);
  const warnings: string[] = migrated.recipes.map((recipe) => recipe.migrationWarning).filter((warning): warning is string => Boolean(warning));
  try {
    await browser.storage.local.set({ [SETTINGS_KEY]: migrated, [MIGRATION_KEY]: { completedAt: new Date().toISOString(), from: 'legacy' } });
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : '无法保存迁移结果');
  }
  return { settings: migrated, migrated: true, warnings };
}

export async function saveSettings(input: YezhaiSettingsV2): Promise<void> {
  const settings = normaliseSettings(input);
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  // Keep fields that v1.4 understands in sync for one rollback cycle.
  await browser.storage.local.set({
    'page2md:theme': settings.appearance.theme,
    'page2md:mode': settings.capture.mode,
    'page2md:removeImages': settings.images.mode === 'remove',
    'page2md:localizeImages': settings.images.mode === 'embed',
    'page2md:floatingHidden': settings.capture.floating === 'page',
  });
}
