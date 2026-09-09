import type { CaptureMode, ClipRequest, ClipResult, ExportOptions } from './contracts';

export type Message =
  | { action: 'ping' }
  | ({ action: 'capture'; after?: 'copy' | 'download' | 'preview' | 'archive' } & Partial<ClipRequest>)
  | { action: 'aiProcess'; operation: 'summary' | 'tags' | 'keywords' | 'entities' | 'translation' | 'qa'; operationId: string }
  | { action: 'cancel'; operationId: string }
  | { action: 'startHighlights' }
  | { action: 'getHighlights' }
  | { action: 'addHighlight'; note?: string }
  | { action: 'removeHighlight'; id: string }
  | { action: 'reorderHighlights'; ids: string[] }
  | { action: 'finishHighlights' }
  | { action: 'setSiteFloating'; origin: string; enabled: boolean }
  | { action: 'setAllSitesFloating'; enabled: boolean }
  | { action: 'requestSiteAccess'; origin: string }
  | { action: 'openSidePanel'; tabId?: number }
  | { action: 'batchStart'; tabIds: number[]; request: Partial<ClipRequest> }
  | { action: 'batchControl'; operationId: string; command: 'pause' | 'resume' | 'cancel' | 'retry' }
  | { action: 'exportClip'; targetId: string; clip: ClipResult; options?: ExportOptions };

export interface MessageResponse {
  success: boolean;
  error?: { code: string; message: string };
  result?: ClipResult;
  operationId?: string;
  payload?: unknown;
}

const ACTIONS = new Set<Message['action']>(['ping', 'capture', 'aiProcess', 'cancel', 'startHighlights', 'getHighlights', 'addHighlight', 'removeHighlight', 'reorderHighlights', 'finishHighlights', 'setSiteFloating', 'setAllSitesFloating', 'requestSiteAccess', 'openSidePanel', 'batchStart', 'batchControl', 'exportClip']);

export function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (typeof message.action !== 'string' || !ACTIONS.has(message.action as Message['action'])) return false;
  if (message.action === 'cancel' && (typeof message.operationId !== 'string' || message.operationId.length === 0 || message.operationId.length > 128)) return false;
  if (message.action === 'aiProcess' && (!['summary', 'tags', 'keywords', 'entities', 'translation', 'qa'].includes(String(message.operation)) || typeof message.operationId !== 'string' || message.operationId.length === 0 || message.operationId.length > 128)) return false;
  if (message.action === 'capture' && message.mode !== undefined && !['main', 'selection', 'pick', 'full', 'highlights'].includes(String(message.mode))) return false;
  if (message.action === 'capture' && message.extractionProfile !== undefined && !['smart', 'recipe', 'defuddle', 'readability', 'semantic'].includes(String(message.extractionProfile))) return false;
  if (message.action === 'capture' && message.renderProfile !== undefined && !['commonmark', 'gfm', 'obsidian'].includes(String(message.renderProfile))) return false;
  if (message.action === 'capture' && message.imageMode !== undefined && !['remote', 'remove', 'embed', 'assets'].includes(String(message.imageMode))) return false;
  if (message.action === 'capture' && message.includeSnapshot !== undefined && typeof message.includeSnapshot !== 'boolean') return false;
  for (const key of ['templateId', 'recipeId', 'exportTargetId'] as const) {
    if (message.action === 'capture' && message[key] !== undefined && (typeof message[key] !== 'string' || message[key].length > 128)) return false;
  }
  if (message.action === 'capture' && message.postProcessors !== undefined && (!Array.isArray(message.postProcessors) || message.postProcessors.length > 20 || message.postProcessors.some((item) => typeof item !== 'string' || item.length > 80))) return false;
  if (message.action === 'capture' && message.url !== undefined && (typeof message.url !== 'string' || message.url.length > 4_000 || !isSafeMessageUrl(message.url))) return false;
  if (message.action === 'capture' && message.operationId !== undefined && (typeof message.operationId !== 'string' || message.operationId.length === 0 || message.operationId.length > 128)) return false;
  if (message.action === 'capture' && message.after !== undefined && !['copy', 'download', 'preview', 'archive'].includes(String(message.after))) return false;
  if (message.action === 'setSiteFloating' && (typeof message.origin !== 'string' || typeof message.enabled !== 'boolean')) return false;
  if (message.action === 'setSiteFloating' && typeof message.origin === 'string' && message.origin.length > 2_000) return false;
  if (message.action === 'setAllSitesFloating' && typeof message.enabled !== 'boolean') return false;
  if (message.action === 'openSidePanel' && message.tabId !== undefined && !Number.isInteger(message.tabId)) return false;
  if (message.action === 'addHighlight' && message.note !== undefined && (typeof message.note !== 'string' || message.note.length > 20_000)) return false;
  if (message.action === 'removeHighlight' && (typeof message.id !== 'string' || message.id.length === 0 || message.id.length > 128)) return false;
  if (message.action === 'reorderHighlights' && (!Array.isArray(message.ids) || message.ids.length > 200 || message.ids.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 128))) return false;
  if (message.action === 'batchStart' && (!Array.isArray(message.tabIds) || message.tabIds.length > 20 || message.tabIds.some((id) => !Number.isInteger(id) || id < 0) || !message.request || typeof message.request !== 'object' || Array.isArray(message.request) || !validCaptureFields(message.request as Record<string, unknown>))) return false;
  if (message.action === 'batchControl' && (typeof message.operationId !== 'string' || message.operationId.length === 0 || message.operationId.length > 128 || !['pause', 'resume', 'cancel', 'retry'].includes(String(message.command)))) return false;
  if (message.action === 'exportClip' && (typeof message.targetId !== 'string' || message.targetId.length === 0 || message.targetId.length > 128 || !message.clip || typeof message.clip !== 'object' || Array.isArray(message.clip))) return false;
  if (message.action === 'exportClip') {
    const clip = message.clip as Record<string, unknown>;
    if (typeof clip.markdown !== 'string' || clip.markdown.length > 10_000_000 || !Array.isArray(clip.assets) || clip.assets.length > 200) return false;
  }
  return true;
}

function isSafeMessageUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return !['javascript:', 'vbscript:', 'data:', 'file:'].includes(parsed.protocol);
  } catch { return false; }
}

function validCaptureFields(message: Record<string, unknown>): boolean {
  if (message.mode !== undefined && !['main', 'selection', 'pick', 'full', 'highlights'].includes(String(message.mode))) return false;
  if (message.extractionProfile !== undefined && !['smart', 'recipe', 'defuddle', 'readability', 'semantic'].includes(String(message.extractionProfile))) return false;
  if (message.renderProfile !== undefined && !['commonmark', 'gfm', 'obsidian'].includes(String(message.renderProfile))) return false;
  if (message.imageMode !== undefined && !['remote', 'remove', 'embed', 'assets'].includes(String(message.imageMode))) return false;
  if (message.includeSnapshot !== undefined && typeof message.includeSnapshot !== 'boolean') return false;
  for (const key of ['templateId', 'recipeId', 'exportTargetId'] as const) if (message[key] !== undefined && (typeof message[key] !== 'string' || message[key].length > 128)) return false;
  if (message.postProcessors !== undefined && (!Array.isArray(message.postProcessors) || message.postProcessors.length > 20 || message.postProcessors.some((item) => typeof item !== 'string' || item.length > 80))) return false;
  if (message.url !== undefined && (typeof message.url !== 'string' || message.url.length > 4_000 || !isSafeMessageUrl(message.url))) return false;
  return true;
}

export function normaliseMessage(value: unknown): Message | null { return isMessage(value) ? value : null; }

export function responseOk(result?: ClipResult, payload?: unknown): MessageResponse { return { success: true, result, payload }; }
export function responseError(code: string, message: string, operationId?: string): MessageResponse { return { success: false, error: { code, message }, operationId }; }
