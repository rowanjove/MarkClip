import { loadSettings, saveSettings } from '../../shared/settings';
import { validateRecipe } from '../../core/recipes/schema';
import { renderTemplate } from '../../core/template/engine';
import { createEmptyMetadata } from '../../shared/contracts';
import { validateProfile } from '../../core/profiles';
import { browser } from 'wxt/browser';
import YAML from 'yaml';
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const loadedSettings = await loadSettings();
let settings = loadedSettings.settings;
document.documentElement.dataset.theme = settings.appearance.theme;
function render(): void { ($('theme') as HTMLSelectElement).value = settings.appearance.theme; ($('extractor') as HTMLSelectElement).value = settings.extraction.profile; ($('floating') as HTMLSelectElement).value = settings.capture.floating; ($('siteOrigin') as HTMLInputElement).value = settings.permissions.siteOrigins[0] || ''; ($('recipes') as HTMLTextAreaElement).value = JSON.stringify(settings.recipes.map((item) => item.definition), null, 2); ($('profiles') as HTMLTextAreaElement).value = JSON.stringify(settings.profiles, null, 2); }
function renderTemplateEditor(): void { const first = settings.templates.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined; ($('templateId') as HTMLInputElement).value = typeof first?.id === 'string' ? first.id : ''; ($('templateName') as HTMLInputElement).value = typeof first?.name === 'string' ? first.name : ''; ($('templateBody') as HTMLTextAreaElement).value = typeof first?.body === 'string' ? first.body : ''; }
function renderAi(): void { ($('aiEnabled') as HTMLInputElement).checked = settings.ai.enabled; ($('aiProvider') as HTMLSelectElement).value = settings.ai.provider || 'ollama'; ($('aiEndpoint') as HTMLInputElement).value = settings.ai.endpoint || ''; ($('aiModel') as HTMLInputElement).value = settings.ai.model || ''; ($('rememberAi') as HTMLInputElement).checked = settings.ai.rememberCredentials; }
function parseRecipeDocument(text: string): unknown[] {
  if (text.length > 200_000) throw new Error('配置文件超过 200 KB。');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = YAML.parse(text); }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return [parsed];
  throw new Error('Recipe 文件必须是对象或数组。');
}

async function validateAndSaveRecipes(text: string): Promise<void> {
  const checked = parseRecipeDocument(text).map(validateRecipe);
  const errors = checked.flatMap((item) => item.ok ? [] : item.errors);
  if (errors.length) throw new Error(errors.join('\n'));
  settings.recipes = checked.filter((item): item is { ok: true; recipe: any } => item.ok).map((item) => ({ id: item.recipe.id, name: item.recipe.name, enabled: true, priority: item.recipe.priority, definition: item.recipe }));
  await saveSettings(settings);
}
async function saveAppearance(): Promise<void> {
  try {
    const theme = ($('theme') as HTMLSelectElement).value as 'light' | 'dark';
    document.documentElement.dataset.theme = theme;
    const extractionProfile = ($('extractor') as HTMLSelectElement).value as any;
    const nextFloating = ($('floating') as HTMLSelectElement).value as 'page' | 'site' | 'all';
    if (nextFloating === 'all') {
      if (!(await browser.permissions.contains({ origins: ['<all_urls>'] })) && !(await browser.permissions.request({ origins: ['<all_urls>'] }))) throw new Error('全站权限未开启。');
      const response = await browser.runtime.sendMessage({ action: 'setAllSitesFloating', enabled: true });
      if (!response?.success) throw new Error(response?.error?.message || response?.error || '全站权限未开启。');
    } else if (nextFloating === 'site') {
      const origin = ($('siteOrigin') as HTMLInputElement).value.trim();
      if (!/^https?:\/\//i.test(origin)) throw new Error('请输入 HTTP(S) 站点来源。');
      const normalised = new URL(origin).origin;
      const pattern = `${normalised}/*`;
      if (!(await browser.permissions.contains({ origins: [pattern] })) && !(await browser.permissions.request({ origins: [pattern] }))) throw new Error('站点权限未开启。');
      const response = await browser.runtime.sendMessage({ action: 'setSiteFloating', origin: normalised, enabled: true });
      if (!response?.success) throw new Error(response?.error?.message || response?.error || '站点权限未开启。');
    } else if (settings.capture.floating === 'all') {
      await browser.runtime.sendMessage({ action: 'setAllSitesFloating', enabled: false });
    } else if (settings.capture.floating === 'site') {
      for (const origin of settings.permissions.siteOrigins) await browser.runtime.sendMessage({ action: 'setSiteFloating', origin, enabled: false });
    }
    // Permission handlers load/save their own current settings. Never write
    // the stale object that was loaded when the options page opened, or it
    // would erase the freshly updated origin/all-sites state.
    const latest = (await loadSettings()).settings;
    latest.appearance.theme = theme;
    latest.extraction.profile = extractionProfile;
    latest.capture.floating = nextFloating;
    settings = latest;
    await saveSettings(latest);
    render();
    $('message').textContent = '已保存';
  } catch (error) { $('message').textContent = error instanceof Error ? error.message : String(error); }
}
$('save').addEventListener('click', () => void saveAppearance());
async function saveAiSettings(): Promise<void> {
  try {
    const enabled = ($('aiEnabled') as HTMLInputElement).checked;
    const endpoint = ($('aiEndpoint') as HTMLInputElement).value.trim();
    if (endpoint && !/^https?:\/\//i.test(endpoint)) throw new Error('AI Endpoint 只能使用 HTTP(S)。');
    // AI runs from the injected content script. Request only the configured
    // endpoint origin, and only when the user explicitly enables AI.
    if (enabled) {
      const parsed = new URL(endpoint || 'http://127.0.0.1:11434');
      const pattern = `${parsed.origin}/*`;
      if (!(await browser.permissions.contains({ origins: [pattern] })) && !(await browser.permissions.request({ origins: [pattern] }))) throw new Error('AI 服务地址权限未开启。');
    }
    settings.ai.enabled = enabled;
    settings.ai.provider = ($('aiProvider') as HTMLSelectElement).value;
    settings.ai.endpoint = endpoint;
    settings.ai.model = ($('aiModel') as HTMLInputElement).value.trim();
    settings.ai.rememberCredentials = ($('rememberAi') as HTMLInputElement).checked;
    const key = ($('aiKey') as HTMLInputElement).value;
    if (settings.ai.rememberCredentials && key) settings.ai.credentials = { apiKey: key };
    else if (!settings.ai.rememberCredentials) delete settings.ai.credentials;
    await saveSettings(settings);
    ($('aiKey') as HTMLInputElement).value = '';
    $('message').textContent = 'AI 设置已保存';
  } catch (error) { $('message').textContent = error instanceof Error ? error.message : String(error); }
}
$('saveAi').addEventListener('click', () => void saveAiSettings());
$('validate').addEventListener('click', async () => { try { await validateAndSaveRecipes(($('recipes') as HTMLTextAreaElement).value || '[]'); $('message').textContent = 'Recipe 已验证并保存'; } catch (error) { $('message').textContent = error instanceof Error ? error.message : String(error); } }); render(); renderAi();
$('importRecipes').addEventListener('click', async () => { try { const file = ($('recipeFile') as HTMLInputElement).files?.[0]; if (!file) throw new Error('请选择 JSON/YAML Recipe 文件。'); await validateAndSaveRecipes(await file.text()); render(); $('message').textContent = 'Recipe 文件已验证并保存'; } catch (error) { $('message').textContent = error instanceof Error ? error.message : String(error); } });
$('exportRecipes').addEventListener('click', () => { const blob = new Blob([JSON.stringify(settings.recipes.map((item) => item.definition), null, 2)], { type: 'application/json' }); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = 'yezai-recipes.json'; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000); });
$('exportRecipesYaml').addEventListener('click', () => { const blob = new Blob([YAML.stringify(settings.recipes.map((item) => item.definition))], { type: 'text/yaml' }); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = 'yezai-recipes.yaml'; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000); });
$('validateProfiles').addEventListener('click', async () => { try { const checked = parseRecipeDocument(($('profiles') as HTMLTextAreaElement).value || '[]').map(validateProfile); const errors = checked.flatMap((item) => item.ok ? [] : item.errors); if (errors.length) throw new Error(errors.join('\n')); settings.profiles = checked.filter((item): item is { ok: true; profile: any } => item.ok).map((item) => item.profile); await saveSettings(settings); $('message').textContent = 'Profile 已验证并保存'; } catch (error) { $('message').textContent = error instanceof Error ? error.message : String(error); } });
$('saveTemplate').addEventListener('click', async () => { try { const id = ($('templateId') as HTMLInputElement).value.trim(); const name = ($('templateName') as HTMLInputElement).value.trim(); const body = ($('templateBody') as HTMLTextAreaElement).value; if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(id) || !name) throw new Error('模板 ID 或名称无效。'); renderTemplate(body, { ...createEmptyMetadata('https://example.com'), content: '示例正文' }); const next = settings.templates.filter((item) => !item || typeof item !== 'object' || String((item as Record<string, unknown>).id || '') !== id); next.push({ id, name, body }); settings.templates = next.slice(0, 100); await saveSettings(settings); $('message').textContent = '模板已保存'; } catch (error) { $('message').textContent = error instanceof Error ? error.message : String(error); } });
$('previewTemplate').addEventListener('click', () => { try { const body = ($('templateBody') as HTMLTextAreaElement).value; const output = renderTemplate(body, { ...createEmptyMetadata('https://example.com'), content: '示例正文' }); $('message').textContent = `模板预览：\n${output.slice(0, 1000)}`; } catch (error) { $('message').textContent = error instanceof Error ? error.message : String(error); } });
renderTemplateEditor();
if (loadedSettings.warnings.length) ($('message') as HTMLElement).textContent = `迁移提示：${loadedSettings.warnings.join('；')}`;
