import type { AiOperation } from './schema';

/** Prompt construction is kept out of UI/transport code so providers remain
 * interchangeable and future prompt revisions are testable in isolation. */
export function buildAiPrompt(operation: AiOperation, title: string, markdown: string): string {
  return JSON.stringify({ operation, title: title.slice(0, 1_000), content: markdown.slice(0, 500_000) });
}
