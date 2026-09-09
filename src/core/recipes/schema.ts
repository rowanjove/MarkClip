export interface RecipeMatch {
  host?: string;
  hostPattern?: string;
  path?: string;
  pathRegex?: string;
  query?: Record<string, string>;
  selectorPresent?: string;
  metaPresent?: string;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  version: 1;
  matches: RecipeMatch[];
  priority: number;
  capture: { selector?: string; fallback: 'smart' | 'defuddle' | 'readability' | 'semantic' | 'body' };
  exclude: string[];
  metadata: Record<string, unknown>;
  transform: { preserveTables: boolean; preserveCode: boolean; preserveCallouts: boolean; imageMode: 'remote' | 'remove' | 'embed' | 'assets' };
  template?: { id?: string; inline?: string };
}

export function validateRecipe(value: unknown): { ok: true; recipe: RecipeDefinition } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['Recipe 必须是对象。'] };
  const input = value as Partial<RecipeDefinition>;
  if (!input.id || !/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(input.id)) errors.push('id 只能包含字母、数字、点、下划线和短横线。');
  if (!input.name || typeof input.name !== 'string') errors.push('name 必须是非空字符串。');
  if (input.version !== 1) errors.push('仅支持 Recipe schema version 1。');
  if (!Array.isArray(input.matches) || input.matches.length === 0) errors.push('至少需要一个 matches 条件。');
  else input.matches.forEach((match, index) => {
    if (!match || typeof match !== 'object' || Array.isArray(match)) { errors.push(`matches[${index}] 必须是对象。`); return; }
    const condition = match as Record<string, unknown>;
    for (const key of ['host', 'hostPattern', 'path', 'pathRegex', 'selectorPresent', 'metaPresent']) if (condition[key] !== undefined && typeof condition[key] !== 'string') errors.push(`matches[${index}].${key} 必须是字符串。`);
    for (const key of ['host', 'hostPattern']) if (typeof condition[key] === 'string' && !/^(?:\*\.)?[a-z0-9.-]+(?::\d+)?$/i.test(condition[key] as string)) errors.push(`matches[${index}].${key} 不是有效站点。`);
    if (condition.query !== undefined && (!condition.query || typeof condition.query !== 'object' || Array.isArray(condition.query) || Object.values(condition.query as Record<string, unknown>).some((item) => typeof item !== 'string'))) errors.push(`matches[${index}].query 必须是字符串映射。`);
    if (typeof condition.pathRegex === 'string') { try { new RegExp(condition.pathRegex); } catch { errors.push(`matches[${index}].pathRegex 无效。`); } }
  });
  if (input.capture?.selector && /[<>]|javascript:/i.test(input.capture.selector)) errors.push('selector 包含非法内容。');
  if (input.capture?.selector !== undefined && typeof input.capture.selector !== 'string') errors.push('capture.selector 必须是字符串。');
  if (typeof input.capture?.selector === 'string' && typeof document !== 'undefined') { try { document.querySelector(input.capture.selector); } catch { errors.push('capture.selector 不是有效 CSS selector。'); } }
  if (input.capture?.fallback !== undefined && !['smart', 'defuddle', 'readability', 'semantic', 'body'].includes(String(input.capture.fallback))) errors.push('capture.fallback 无效。');
  if (input.exclude !== undefined && (!Array.isArray(input.exclude) || input.exclude.some((item) => typeof item !== 'string' || /[<>]|javascript:/i.test(item)))) errors.push('exclude 必须是安全 CSS selector 数组。');
  if (input.metadata !== undefined && (!input.metadata || typeof input.metadata !== 'object' || Array.isArray(input.metadata))) errors.push('metadata 必须是对象。');
  if (input.priority !== undefined && (!Number.isFinite(Number(input.priority)) || Number(input.priority) < -100_000 || Number(input.priority) > 100_000)) errors.push('priority 超出范围。');
  if (input.transform !== undefined && (!input.transform || typeof input.transform !== 'object' || Array.isArray(input.transform))) errors.push('transform 必须是对象。');
  if (input.transform?.imageMode !== undefined && !['remote', 'remove', 'embed', 'assets'].includes(String(input.transform.imageMode))) errors.push('transform.imageMode 无效。');
  if (input.template !== undefined && (!input.template || typeof input.template !== 'object' || Array.isArray(input.template) || (input.template.id !== undefined && typeof input.template.id !== 'string') || (input.template.inline !== undefined && typeof input.template.inline !== 'string'))) errors.push('template 格式无效。');
  const serialised = JSON.stringify(value);
  if (/<script|eval\s*\(|function\s*\(|https?:\/\/[^\s"']+\.js/i.test(serialised)) errors.push('Recipe 不允许脚本或远程代码。');
  if (errors.length) return { ok: false, errors };
  const recipe: RecipeDefinition = {
    id: input.id!, name: input.name!, version: 1, matches: input.matches as RecipeDefinition['matches'], priority: Number(input.priority ?? 0),
    capture: { selector: input.capture?.selector, fallback: input.capture?.fallback ?? 'smart' },
    exclude: [...(input.exclude ?? [])], metadata: input.metadata ?? {},
    transform: { preserveTables: input.transform?.preserveTables ?? true, preserveCode: input.transform?.preserveCode ?? true, preserveCallouts: input.transform?.preserveCallouts ?? true, imageMode: input.transform?.imageMode ?? 'remote' },
    template: input.template,
  };
  return { ok: true, recipe };
}
