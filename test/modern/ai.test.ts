import { describe, expect, it } from 'vitest';
import { processClipWithAi, validateAiResult } from '../../src/ai/schema';
import type { ClipResult } from '../../src/shared/contracts';
import { createOllamaProvider, createOpenAICompatibleProvider } from '../../src/ai/providers';

const clip: ClipResult = { id: '1', markdown: '# demo', metadata: { title: 'Demo', url: 'https://example.com', authors: [], tags: [], capturedAt: new Date(0).toISOString(), extra: {} }, assets: [], warnings: [], diagnostics: { extractor: 'test', recipeMatched: false, fallbackChain: [], originalNodeCount: 1, extractedNodeCount: 1, originalTextLength: 4, extractedTextLength: 4, removals: [], metadataSources: {}, imageStats: { attempted: 0, success: 0, failed: 0, skipped: 0 }, timings: { totalMs: 1 }, warnings: [] } };

describe('optional AI post processor', () => {
  it('validates operation-specific JSON and preserves original on failure', async () => {
    expect(validateAiResult({ tags: ['one', 'two'] }, 'tags').tags).toEqual(['one', 'two']);
    expect(() => validateAiResult({ tags: 'bad' }, 'tags')).toThrow();
    const result = await processClipWithAi(clip, 'summary', { id: 'mock', complete: async () => 'not-json' });
    expect(result.clip.markdown).toBe(clip.markdown);
    expect(result.warning).toBeTruthy();
  });

  it('uses local provider endpoints and keeps credentials out of prompts', async () => {
    let openAiBody = ''; let openAiAuth = '';
    const openAi = createOpenAICompatibleProvider({ endpoint: 'https://api.test/v1', model: 'test-model', apiKey: 'sk-test-123', fetchImpl: (async (_input, init) => { openAiBody = String(init?.body || ''); openAiAuth = String(new Headers(init?.headers).get('authorization') || ''); return new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"ok"}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch });
    expect(await openAi.complete('{"operation":"summary"}')).toBe('{"summary":"ok"}');
    expect(openAiBody).toContain('summary');
    expect(openAiBody).not.toContain('sk-test-123');
    expect(openAiAuth).toBe('Bearer sk-test-123');
    const ollama = createOllamaProvider({ endpoint: 'http://127.0.0.1:11434', model: 'llama', fetchImpl: (async () => new Response(JSON.stringify({ response: '{"tags":["local"]}' }), { status: 200 })) as typeof fetch });
    expect(await ollama.complete('prompt')).toBe('{"tags":["local"]}');
  });

  it('times out a response body that never completes', async () => {
    const provider = createOllamaProvider({ endpoint: 'http://127.0.0.1:11434', model: 'llama', fetchImpl: (async () => new Response(new ReadableStream({ start() { /* intentionally never close */ } }), { status: 200 })) as typeof fetch });
    await expect(provider.complete('prompt', { timeoutMs: 10 })).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  });
});
