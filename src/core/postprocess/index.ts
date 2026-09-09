import type { ClipResult } from '../../shared/contracts';
import { YezhaiError } from '../../shared/errors';

export type DeterministicProcessor = 'trim' | 'collapse-blank-lines' | 'strip-trailing-space';

export function applyPostProcessors(clip: ClipResult, processors: string[]): ClipResult {
  let markdown = clip.markdown;
  for (const processor of processors.slice(0, 20)) {
    if (processor === 'trim') markdown = markdown.trim();
    else if (processor === 'collapse-blank-lines') markdown = markdown.replace(/\n{4,}/g, '\n\n\n');
    else if (processor === 'strip-trailing-space') markdown = markdown.split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n');
    else if (processor) throw new YezhaiError('POSTPROCESS_INVALID', `未知后处理器：${processor}`, 'render');
  }
  return markdown === clip.markdown ? clip : { ...clip, markdown };
}
