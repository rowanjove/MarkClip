import { describe, expect, it } from 'vitest';
import { resolveProfile, validateProfile } from '../../src/core/profiles';

describe('v1.5 profiles', () => {
  it('validates a composed profile and resolves user overrides', () => {
    const checked = validateProfile({ id: 'smart', name: '我的智能配置', request: { renderProfile: 'obsidian', imageMode: 'assets', includeSnapshot: false } });
    expect(checked.ok).toBe(true);
    expect(resolveProfile('smart', checked.ok ? [checked.profile] : []).request.renderProfile).toBe('obsidian');
  });

  it('rejects executable or malformed profile fields', () => {
    expect(validateProfile({ id: 'bad', name: 'Bad', request: { renderProfile: 'html' }, code: 'eval()' }).ok).toBe(false);
    expect(validateProfile({ id: 'bad', name: 'Bad', request: { postProcessors: ['x'.repeat(81)] } }).ok).toBe(false);
  });

  it('keeps custom profile ids available to resolution', () => {
    const checked = validateProfile({ id: 'my-profile', name: 'My Profile', request: { renderProfile: 'commonmark' } });
    expect(checked.ok && resolveProfile('my-profile', [checked.profile]).name).toBe('My Profile');
  });
});
