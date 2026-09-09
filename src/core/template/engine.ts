import type { ClipMetadata } from '../../shared/contracts';
import { YezhaiError } from '../../shared/errors';

export interface TemplateContext extends ClipMetadata { content: string; }

const TOKEN = /{{\s*([^{}]+?)\s*}}/g;

function lookup(context: TemplateContext, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (Array.isArray(value) && (key === 'size' || key === 'length')) return value.length;
    if (typeof value === 'string' && key === 'length') return value.length;
    return value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key) ? (value as Record<string, unknown>)[key] : undefined;
  }, context);
}

function condition(context: TemplateContext, expression: string): boolean {
  const match = expression.trim().match(/^([a-zA-Z][\w.]*)(?:\s*(===|!==|==|!=|>=|<=|>|<)\s*(?:"([^"]*)"|'([^']*)'|(\d+(?:\.\d+)?|true|false)))?$/);
  if (!match) return false;
  const value = lookup(context, match[1]);
  if (!match[2]) return Array.isArray(value) ? value.length > 0 : Boolean(value);
  const raw = match[3] ?? match[4] ?? match[5];
  const right = raw === 'true' ? true : raw === 'false' ? false : raw !== undefined && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
  switch (match[2]) {
    case '===': case '==': return value === right;
    case '!==': case '!=': return value !== right;
    case '>': return Number(value) > Number(right);
    case '>=': return Number(value) >= Number(right);
    case '<': return Number(value) < Number(right);
    case '<=': return Number(value) <= Number(right);
    default: return false;
  }
}

function filter(value: unknown, name?: string, argument?: string): string {
  const text = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  switch (name) {
    case 'lower': return text.toLowerCase();
    case 'upper': return text.toUpperCase();
    case 'trim': return text.trim();
    case 'safe_name': return text.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'page';
    case 'slug': return text.normalize('NFKD').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/g, '') || 'page';
    case 'join': return Array.isArray(value) ? value.join(argument || ', ') : text;
    case 'replace': { const [from, to = ''] = (argument || '').split(',', 2); return text.split(from || '').join(to); }
    case 'default': return text || argument || '';
    case 'yaml': return JSON.stringify(text);
    case 'json': return JSON.stringify(value ?? null);
    case 'date': {
      if (!text) return '';
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
    }
    default: return text;
  }
}

function assertTemplateSafety(template: string): void {
  if (template.length > 200_000 || /(?:eval|Function|constructor|__proto__|prototype|fetch\s*\()/i.test(template)) throw new YezhaiError('TEMPLATE_INVALID', '模板包含不允许的表达式。', 'render');
}

export function renderTemplate(template: string, context: TemplateContext): string {
  assertTemplateSafety(template);
  let interpolationCount = 0;
  const blockToken = /{%\s*(if\s+[^%]+|for\s+\w+\s+in\s+[\w.]+|endif|endfor)\s*%}/g;

  function interpolate(text: string, localContext: TemplateContext): string {
    return text.replace(TOKEN, (_match, expression: string) => {
      interpolationCount += 1;
      if (interpolationCount > 20_000) throw new YezhaiError('TEMPLATE_LIMIT', '模板输出超过限制。', 'render');
      const parts = expression.split('|').map((part) => part.trim());
      const path = parts.shift() || '';
      if (!/^[a-zA-Z][\w.]*$/.test(path)) throw new YezhaiError('TEMPLATE_INVALID', '模板变量表达式无效。', 'render');
      let value: unknown = lookup(localContext, path);
      for (const part of parts) {
        const match = part.match(/^([a-zA-Z_]+)(?:\s*:\s*(.*))?$/);
        if (!match) throw new YezhaiError('TEMPLATE_INVALID', '模板 filter 表达式无效。', 'render');
        const name = match[1];
        if (!['lower', 'upper', 'trim', 'safe_name', 'slug', 'join', 'replace', 'default', 'yaml', 'json', 'date'].includes(name)) throw new YezhaiError('TEMPLATE_INVALID', `未知模板 filter：${name}`, 'render');
        const argument = match[2]?.trim();
        // `default: url` is a context lookup in the documented syntax; other
        // filter arguments remain literal strings (e.g. `join: , `).
        const resolvedArgument = name === 'default' && argument && /^[a-zA-Z][\w.]*$/.test(argument)
          ? String(lookup(localContext, argument) ?? '')
          : argument;
        value = filter(value, name, resolvedArgument);
      }
      return String(value ?? '');
    });
  }

  function takeBlock(source: string, start: number, endToken: 'endif' | 'endfor'): { body: string; next: number } {
    blockToken.lastIndex = start;
    const stack: Array<'endif' | 'endfor'> = [endToken];
    let match: RegExpExecArray | null;
    while ((match = blockToken.exec(source))) {
      const token = match[1].trim();
      if (token.startsWith('if ')) stack.push('endif');
      else if (token.startsWith('for ')) stack.push('endfor');
      else if (token === 'endif' || token === 'endfor') {
        if (stack[stack.length - 1] !== token) throw new YezhaiError('TEMPLATE_INVALID', '模板块结束标签不匹配。', 'render');
        stack.pop();
        if (!stack.length) return { body: source.slice(start, match.index), next: blockToken.lastIndex };
      }
    }
    throw new YezhaiError('TEMPLATE_INVALID', '模板缺少结束标签。', 'render');
  }

  function renderBlocks(source: string, localContext: TemplateContext): string {
    blockToken.lastIndex = 0;
    let cursor = 0;
    let output = '';
    let match: RegExpExecArray | null;
    while ((match = blockToken.exec(source))) {
      output += interpolate(source.slice(cursor, match.index), localContext);
      const token = match[1].trim();
      if (token === 'endif' || token === 'endfor') throw new YezhaiError('TEMPLATE_INVALID', '模板包含未配对的结束标签。', 'render');
      if (token.startsWith('if ')) {
        const block = takeBlock(source, blockToken.lastIndex, 'endif');
        if (condition(localContext, token.slice(3))) output += renderBlocks(block.body, localContext);
        cursor = block.next; blockToken.lastIndex = cursor;
      } else {
        const forMatch = token.match(/^for\s+(\w+)\s+in\s+([\w.]+)$/);
        if (!forMatch) throw new YezhaiError('TEMPLATE_INVALID', '模板循环表达式无效。', 'render');
        const block = takeBlock(source, blockToken.lastIndex, 'endfor');
        const values = lookup(localContext, forMatch[2]);
        if (Array.isArray(values)) for (const value of values.slice(0, 100)) output += renderBlocks(block.body, { ...localContext, [forMatch[1]]: value });
        cursor = block.next; blockToken.lastIndex = cursor;
      }
    }
    output += interpolate(source.slice(cursor), localContext);
    if (output.length > 1_000_000) throw new YezhaiError('TEMPLATE_LIMIT', '模板输出超过限制。', 'render');
    return output;
  }

  return renderBlocks(String(template || ''), context);
}
