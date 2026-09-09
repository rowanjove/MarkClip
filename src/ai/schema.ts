import type { ClipResult } from '../shared/contracts';
import { YezhaiError } from '../shared/errors';
import { buildAiPrompt } from './prompts';

export type AiOperation = 'summary' | 'tags' | 'keywords' | 'entities' | 'translation' | 'qa';
export interface AiProvider { id: string; complete(prompt: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<unknown>; }
export interface AiResult { operation: AiOperation; summary?: string; tags?: string[]; keywords?: string[]; entities?: Array<{ name: string; type?: string }>; translation?: string; answer?: string; }

export function validateAiResult(value: unknown, operation: AiOperation): AiResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new YezhaiError('AI_SCHEMA_INVALID', 'AI 返回格式无法验证。', 'ai');
  const input = value as Record<string, unknown>;
  const result: AiResult = { operation };
  if (operation === 'summary' && typeof input.summary === 'string' && input.summary.length <= 20_000) result.summary = input.summary;
  else if (operation === 'tags' || operation === 'keywords') {
    const values = input[operation];
    if (!Array.isArray(values) || values.some((item) => typeof item !== 'string') || values.length > 100) throw new YezhaiError('AI_SCHEMA_INVALID', 'AI 返回格式无法验证。', 'ai');
    result[operation] = values.map((item) => item.trim()).filter(Boolean);
  } else if (operation === 'entities') {
    if (!Array.isArray(input.entities) || input.entities.length > 200) throw new YezhaiError('AI_SCHEMA_INVALID', 'AI 返回格式无法验证。', 'ai');
    result.entities = input.entities.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)).map((item) => ({ name: String(item.name || '').slice(0, 200), type: typeof item.type === 'string' ? item.type.slice(0, 100) : undefined })).filter((item) => item.name);
  } else if (operation === 'translation' && typeof input.translation === 'string' && input.translation.length <= 2_000_000) result.translation = input.translation;
  else if (operation === 'qa' && typeof input.answer === 'string' && input.answer.length <= 20_000) result.answer = input.answer;
  else throw new YezhaiError('AI_SCHEMA_INVALID', 'AI 返回格式无法验证。', 'ai');
  return result;
}

export async function processClipWithAi(clip: ClipResult, operation: AiOperation, provider: AiProvider, options: { signal?: AbortSignal } = {}): Promise<{ clip: ClipResult; result?: AiResult; warning?: string }> {
  try {
    const response = await provider.complete(buildAiPrompt(operation, clip.metadata.title, clip.markdown), options);
    const parsed = typeof response === 'string' ? JSON.parse(response) : response;
    const result = validateAiResult(parsed, operation);
    const next: ClipResult = { ...clip, metadata: { ...clip.metadata, extra: { ...clip.metadata.extra, ai: { ...result } } } };
    if (result.translation) next.markdown = result.translation;
    return { clip: next, result };
  } catch (error) {
    const warning = error instanceof YezhaiError ? error.message : 'AI 后处理失败，原始 Markdown 未受影响。';
    return { clip, warning };
  }
}
