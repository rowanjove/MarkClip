export type CaptureMode = 'main' | 'selection' | 'pick' | 'full' | 'highlights';
export type ExtractionProfile = 'smart' | 'recipe' | 'defuddle' | 'readability' | 'semantic';
export type RenderProfile = 'commonmark' | 'gfm' | 'obsidian';
export type ImageMode = 'remote' | 'remove' | 'embed' | 'assets';
export type ClipAssetKind = 'image' | 'file' | 'snapshot';
export type ClipAssetStatus = 'ready' | 'failed' | 'skipped';

export interface ClipRequest {
  mode: CaptureMode;
  extractionProfile: ExtractionProfile;
  renderProfile: RenderProfile;
  imageMode: ImageMode;
  includeSnapshot: boolean;
  templateId?: string;
  recipeId?: string;
  exportTargetId?: string;
  postProcessors: string[];
  operationId: string;
  url?: string;
}

export interface ClipMetadata {
  title: string;
  url: string;
  canonicalUrl?: string;
  authors: string[];
  siteName?: string;
  description?: string;
  publishedAt?: string;
  modifiedAt?: string;
  capturedAt: string;
  language?: string;
  tags: string[];
  heroImage?: string;
  favicon?: string;
  contentType?: string;
  wordCount?: number;
  readingTimeMinutes?: number;
  schemaOrg?: unknown;
  extra: Record<string, unknown>;
}

export interface ClipAsset {
  id: string;
  kind: ClipAssetKind;
  sourceUrl?: string;
  fileName: string;
  mimeType?: string;
  size?: number;
  data?: Blob;
  status: ClipAssetStatus;
  warning?: string;
}

export interface DiagnosticRemoval {
  selector?: string;
  reason: string;
  count?: number;
}

export interface ClipDiagnostics {
  extractor: string;
  recipeId?: string;
  recipeMatched: boolean;
  sourceSelector?: string;
  fallbackChain: string[];
  originalNodeCount: number;
  extractedNodeCount: number;
  originalTextLength: number;
  extractedTextLength: number;
  removals: DiagnosticRemoval[];
  metadataSources: Record<string, string>;
  imageStats: { attempted: number; success: number; failed: number; skipped: number };
  timings: {
    captureMs?: number;
    extractMs?: number;
    standardizeMs?: number;
    renderMs?: number;
    postProcessMs?: number;
    exportMs?: number;
    totalMs: number;
  };
  warnings: string[];
}

export interface ClipResult {
  id: string;
  markdown: string;
  metadata: ClipMetadata;
  assets: ClipAsset[];
  snapshot?: ClipAsset;
  warnings: string[];
  diagnostics: ClipDiagnostics;
}

export interface ExportContext {
  signal?: AbortSignal;
  browser: 'chrome' | 'firefox' | 'edge' | 'safari' | 'unknown';
}

export interface ExportOptions {
  overwrite?: 'overwrite' | 'rename' | 'cancel';
  path?: string;
  includeSecrets?: boolean;
}

export interface ExportResult {
  success: boolean;
  targetId: string;
  files: string[];
  warnings: string[];
  error?: { code: string; message: string };
}

export function createClipRequest(input: Partial<ClipRequest> = {}): ClipRequest {
  const modes: CaptureMode[] = ['main', 'selection', 'pick', 'full', 'highlights'];
  const extractionProfiles: ExtractionProfile[] = ['smart', 'recipe', 'defuddle', 'readability', 'semantic'];
  const renderProfiles: RenderProfile[] = ['commonmark', 'gfm', 'obsidian'];
  const imageModes: ImageMode[] = ['remote', 'remove', 'embed', 'assets'];
  return {
    mode: modes.includes(input.mode as CaptureMode) ? input.mode as CaptureMode : 'main',
    extractionProfile: extractionProfiles.includes(input.extractionProfile as ExtractionProfile) ? input.extractionProfile as ExtractionProfile : 'smart',
    renderProfile: renderProfiles.includes(input.renderProfile as RenderProfile) ? input.renderProfile as RenderProfile : 'gfm',
    imageMode: imageModes.includes(input.imageMode as ImageMode) ? input.imageMode as ImageMode : 'remote',
    includeSnapshot: input.includeSnapshot === true,
    templateId: typeof input.templateId === 'string' && input.templateId.length <= 128 ? input.templateId : undefined,
    recipeId: typeof input.recipeId === 'string' && input.recipeId.length <= 128 ? input.recipeId : undefined,
    exportTargetId: typeof input.exportTargetId === 'string' && input.exportTargetId.length <= 128 ? input.exportTargetId : undefined,
    postProcessors: [...(input.postProcessors ?? [])].filter((item): item is string => typeof item === 'string' && item.length <= 80).slice(0, 20),
    operationId: typeof input.operationId === 'string' && input.operationId.length > 0 && input.operationId.length <= 128 ? input.operationId : crypto.randomUUID(),
    url: typeof input.url === 'string' && input.url.length <= 4_000 ? input.url : undefined,
  };
}

export function createEmptyMetadata(url = ''): ClipMetadata {
  return {
    title: 'Untitled',
    url,
    authors: [],
    tags: [],
    capturedAt: new Date().toISOString(),
    extra: {},
  };
}

export function createEmptyDiagnostics(extractor = 'unknown'): ClipDiagnostics {
  return {
    extractor,
    recipeMatched: false,
    fallbackChain: [],
    originalNodeCount: 0,
    extractedNodeCount: 0,
    originalTextLength: 0,
    extractedTextLength: 0,
    removals: [],
    metadataSources: {},
    imageStats: { attempted: 0, success: 0, failed: 0, skipped: 0 },
    timings: { totalMs: 0 },
    warnings: [],
  };
}
