const SECRET_KEYS = /(?:token|password|passwd|secret|api[_-]?key|authorization|credential)/i;

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[redacted-depth]';
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEYS.test(key) ? '[redacted]' : redactSecrets(item, depth + 1);
  }
  return output;
}
