import type { AiProvider } from './schema';
import { YezhaiError } from '../shared/errors';

interface ProviderOptions { endpoint: string; apiKey?: string; model: string; fetchImpl?: typeof fetch; }

async function withTimeout<T>(fetchImpl: typeof fetch, input: RequestInfo | URL, init: RequestInit, timeoutMs: number, signal: AbortSignal | undefined, consume: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  let rejectAbort!: (reason?: unknown) => void;
  const abortPromise = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { controller.abort(signal?.reason); rejectAbort(new YezhaiError('CANCELLED', 'AI 后处理已取消。', 'ai')); };
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  let rejectTimeout!: (reason?: unknown) => void;
  const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); rejectTimeout(new YezhaiError('AI_TIMEOUT', 'AI 后处理超时。', 'ai', { retryable: true })); }, timeoutMs);
  try {
    const response = await Promise.race([fetchImpl(input, { ...init, signal: controller.signal }), timeoutPromise, abortPromise]);
    return await Promise.race([consume(response), timeoutPromise, abortPromise]);
  } catch (error) {
    if (timedOut) throw new YezhaiError('AI_TIMEOUT', 'AI 后处理超时。', 'ai', { retryable: true });
    if (signal?.aborted) throw new YezhaiError('CANCELLED', 'AI 后处理已取消。', 'ai');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function createOpenAICompatibleProvider(options: ProviderOptions): AiProvider {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  return { id: 'openai-compatible', async complete(prompt, request = {}) {
    if (!fetchImpl) throw new YezhaiError('AI_UNAVAILABLE', '当前环境不支持 AI 请求。', 'ai');
    const base = options.endpoint.replace(/\/$/, '');
    const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
    const payload = await withTimeout(fetchImpl, endpoint, { method: 'POST', headers: { Authorization: options.apiKey ? `Bearer ${options.apiKey}` : '', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: options.model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Return JSON only. Never include secrets.' }, { role: 'user', content: prompt }] }) }, request.timeoutMs ?? 30_000, request.signal, async (response) => {
      if (response.status === 401 || response.status === 403) throw new YezhaiError('AI_AUTH_FAILED', 'AI 服务认证失败。', 'ai');
      if (!response.ok) throw new YezhaiError('AI_FAILED', `AI HTTP ${response.status}`, 'ai', { retryable: response.status === 429 || response.status >= 500 });
      return await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    });
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new YezhaiError('AI_SCHEMA_INVALID', 'AI 返回格式无法验证。', 'ai');
    return content;
  } };
}

export function createOllamaProvider(options: Omit<ProviderOptions, 'apiKey'>): AiProvider {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  return { id: 'ollama', async complete(prompt, request = {}) {
    if (!fetchImpl) throw new YezhaiError('AI_UNAVAILABLE', '当前环境不支持 AI 请求。', 'ai');
    const base = options.endpoint.replace(/\/$/, '');
    const endpoint = base.endsWith('/api/generate') ? base : `${base}/api/generate`;
    const payload = await withTimeout(fetchImpl, endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: options.model, prompt, stream: false, format: 'json', options: { temperature: 0 } }) }, request.timeoutMs ?? 30_000, request.signal, async (response) => {
      if (!response.ok) throw new YezhaiError('AI_FAILED', `Ollama HTTP ${response.status}`, 'ai', { retryable: response.status >= 500 });
      return await response.json() as { response?: unknown };
    });
    if (typeof payload.response !== 'string') throw new YezhaiError('AI_SCHEMA_INVALID', 'AI 返回格式无法验证。', 'ai');
    return payload.response;
  } };
}
