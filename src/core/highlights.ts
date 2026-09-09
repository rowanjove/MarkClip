import type { ClipHighlight } from './types-highlights';

export interface HighlightSession { id: string; startedAt: string; items: ClipHighlight[]; }

export function createHighlightSession(): HighlightSession { return { id: crypto.randomUUID(), startedAt: new Date().toISOString(), items: [] }; }

export function captureSelection(session: HighlightSession, document: Document, note = '', rangeOverride?: Range): ClipHighlight | null {
  const selection = document.getSelection();
  const range = rangeOverride || (selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null);
  if (!range) return null;
  const text = range.toString().trim();
  if (!text) return null;
  const item: ClipHighlight = {
    id: crypto.randomUUID(), text, html: range.cloneContents().textContent || undefined,
    note: note.trim() || undefined, sourceUrl: document.location?.href || '', contextBefore: '', contextAfter: '', createdAt: new Date().toISOString(), order: session.items.length,
  };
  session.items.push(item); selection?.removeAllRanges(); return item;
}

export function reorderHighlights(session: HighlightSession, ids: string[]): void {
  const order = new Map(ids.map((id, index) => [id, index]));
  session.items.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)).forEach((item, index) => { item.order = index; });
}

export function removeHighlight(session: HighlightSession, id: string): void { session.items = session.items.filter((item) => item.id !== id).map((item, index) => ({ ...item, order: index })); }

export function renderHighlights(session: HighlightSession, title: string): string {
  const sections = session.items.sort((a, b) => a.order - b.order).map((item, index) => `## 摘录 ${index + 1}\n\n> ${item.text.replace(/\n/g, '\n> ')}${item.note ? `\n\n备注：${item.note}` : ''}`).join('\n\n');
  return `# ${title || '摘录'}\n\n${sections}`.trim();
}
