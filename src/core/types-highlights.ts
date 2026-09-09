export interface ClipHighlight {
  id: string;
  text: string;
  html?: string;
  note?: string;
  sourceUrl: string;
  contextBefore?: string;
  contextAfter?: string;
  createdAt: string;
  order: number;
}
