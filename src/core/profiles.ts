import type { ClipRequest, ExtractionProfile, ImageMode, RenderProfile } from '../shared/contracts';

export interface ProfileDefinition {
  id: string;
  name: string;
  request: Partial<Pick<ClipRequest, 'extractionProfile' | 'renderProfile' | 'imageMode' | 'includeSnapshot' | 'templateId' | 'exportTargetId' | 'postProcessors'>>;
}

export const BUILTIN_PROFILES: ProfileDefinition[] = [
  { id: 'smart', name: '智能 Markdown（GFM）', request: { extractionProfile: 'smart', renderProfile: 'gfm', imageMode: 'remote', includeSnapshot: false } },
  { id: 'commonmark', name: 'CommonMark', request: { extractionProfile: 'smart', renderProfile: 'commonmark', imageMode: 'remote', includeSnapshot: false } },
  { id: 'obsidian', name: 'Obsidian', request: { extractionProfile: 'smart', renderProfile: 'obsidian', imageMode: 'assets', includeSnapshot: false, exportTargetId: 'obsidian' } },
  { id: 'archive', name: '完整归档', request: { extractionProfile: 'smart', renderProfile: 'gfm', imageMode: 'assets', includeSnapshot: true, exportTargetId: 'zip' } },
  { id: 'github', name: 'GitHub 笔记', request: { extractionProfile: 'smart', renderProfile: 'gfm', imageMode: 'remote', includeSnapshot: false, exportTargetId: 'github' } },
];

const extractionProfiles = new Set<ExtractionProfile>(['smart', 'recipe', 'defuddle', 'readability', 'semantic']);
const renderProfiles = new Set<RenderProfile>(['commonmark', 'gfm', 'obsidian']);
const imageModes = new Set<ImageMode>(['remote', 'remove', 'embed', 'assets']);

export function validateProfile(value: unknown): { ok: true; profile: ProfileDefinition } | { ok: false; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['Profile 必须是对象。'] };
  const input = value as Record<string, unknown>;
  const errors: string[] = [];
  let serialised = '';
  try { serialised = JSON.stringify(value) || ''; } catch { errors.push('Profile 不能序列化。'); }
  if (/<script|eval\s*\(|function\s*\(|https?:\/\/[^\s"']+\.js/i.test(serialised)) errors.push('Profile 不允许脚本或远程代码。');
  if (typeof input.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(input.id)) errors.push('Profile id 无效。');
  if (typeof input.name !== 'string' || !input.name.trim()) errors.push('Profile name 不能为空。');
  if (!input.request || typeof input.request !== 'object' || Array.isArray(input.request)) errors.push('Profile request 必须是对象。');
  const request = (input.request && typeof input.request === 'object' && !Array.isArray(input.request)) ? input.request as Record<string, unknown> : {};
  if (request.extractionProfile !== undefined && !extractionProfiles.has(request.extractionProfile as ExtractionProfile)) errors.push('Profile extractionProfile 无效。');
  if (request.renderProfile !== undefined && !renderProfiles.has(request.renderProfile as RenderProfile)) errors.push('Profile renderProfile 无效。');
  if (request.imageMode !== undefined && !imageModes.has(request.imageMode as ImageMode)) errors.push('Profile imageMode 无效。');
  if (request.includeSnapshot !== undefined && typeof request.includeSnapshot !== 'boolean') errors.push('Profile includeSnapshot 必须是布尔值。');
  if (request.templateId !== undefined && (typeof request.templateId !== 'string' || request.templateId.length > 128)) errors.push('Profile templateId 无效。');
  if (request.exportTargetId !== undefined && (typeof request.exportTargetId !== 'string' || request.exportTargetId.length > 128)) errors.push('Profile exportTargetId 无效。');
  if (request.postProcessors !== undefined && (!Array.isArray(request.postProcessors) || request.postProcessors.length > 20 || request.postProcessors.some((item) => typeof item !== 'string' || item.length > 80))) errors.push('Profile postProcessors 无效。');
  if (errors.length) return { ok: false, errors };
  return { ok: true, profile: { id: input.id as string, name: (input.name as string).trim().slice(0, 120), request: { ...request } as ProfileDefinition['request'] } };
}

export function loadProfiles(value: unknown): ProfileDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.map(validateProfile).filter((item): item is { ok: true; profile: ProfileDefinition } => item.ok).map((item) => item.profile).slice(0, 100);
}

export function resolveProfile(id: string | undefined, custom: unknown[] = []): ProfileDefinition {
  // User profiles intentionally override a built-in with the same id, while
  // malformed entries are discarded by the validator before resolution.
  const all = [...loadProfiles(custom), ...BUILTIN_PROFILES];
  return all.find((item) => item.id === id) || BUILTIN_PROFILES[0];
}
