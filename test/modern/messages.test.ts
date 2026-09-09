import { describe, expect, it } from 'vitest';
import { isMessage } from '../../src/shared/messages';

describe('message boundary validation', () => {
  it('rejects malformed capture flags and dangerous URLs', () => {
    expect(isMessage({ action: 'capture', includeSnapshot: 'false' })).toBe(false);
    expect(isMessage({ action: 'capture', url: 'javascript:alert(1)' })).toBe(false);
    expect(isMessage({ action: 'capture', postProcessors: ['x'.repeat(81)] })).toBe(false);
  });
});
