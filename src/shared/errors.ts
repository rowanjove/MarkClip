export type ErrorCategory = 'permission' | 'capture' | 'extract' | 'render' | 'asset' | 'export' | 'network' | 'ai' | 'browser' | 'migration';

export class YezhaiError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, category: ErrorCategory, options: { retryable?: boolean; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'YezhaiError';
    this.code = code;
    this.category = category;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export const ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: '当前页面不允许扩展读取内容，请在普通 HTTP(S) 网页中重试。',
  PAGE_UNSCRIPTABLE: '当前页面不允许脚本注入，请换用普通网页。',
  PAGE_NAVIGATED: '页面已跳转，请在新页面重新提取。',
  EXTRACT_EMPTY: '没有找到可保存的正文，请尝试选择区域模式。',
  EXTRACT_TIMEOUT: '页面转换超时，请缩小范围后重试。',
  DOM_TOO_LARGE: '页面过大，请使用选择区域模式。',
  SNAPSHOT_TOO_LARGE: '原始页面快照过大，已跳过快照。',
  ASSET_TOO_LARGE: '图片超过大小限制，已保留原链接。',
  ASSET_TIMEOUT: '图片下载超时，已保留原链接。',
  ASSET_CORS_FAILED: '部分图片受跨域或权限限制，已保留原链接。',
  EXPORT_AUTH_FAILED: '导出目标认证失败，请检查凭据。',
  EXPORT_CONFLICT: '目标文件已存在，请选择覆盖、改名或取消。',
  EXPORT_FAILED: '导出失败，请重试或改用下载。',
  POSTPROCESS_INVALID: '后处理器配置无效，已停止后处理。',
  AI_SCHEMA_INVALID: 'AI 返回格式无法验证，原始 Markdown 未受影响。',
  AI_TIMEOUT: 'AI 后处理超时，原始 Markdown 未受影响。',
  AI_AUTH_FAILED: 'AI 服务认证失败，请检查配置。',
  AI_UNAVAILABLE: 'AI 服务当前不可用，原始 Markdown 未受影响。',
  AI_FAILED: 'AI 后处理失败，原始 Markdown 未受影响。',
  MIGRATION_FAILED: '旧设置迁移失败，已保留原设置。',
};

export function friendlyError(error: unknown): string {
  if (error instanceof YezhaiError) return ERROR_MESSAGES[error.code] ?? error.message;
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  if (/cannot access.*page|extensions gallery|chrome:\/\/|edge:\/\/|about:/i.test(message)) return ERROR_MESSAGES.PAGE_UNSCRIPTABLE;
  return message;
}
