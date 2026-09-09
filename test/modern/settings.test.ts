import { describe, expect, it } from 'vitest';
import { migrateLegacy } from '../../src/shared/settings';

describe('v1.5 settings migration', () => {
  it('preserves legacy preferences and converts valid/invalid site rules safely', () => {
    const settings = migrateLegacy({ 'page2md:theme': 'dark', 'page2md:mode': 'full', 'page2md:localizeImages': true, obsidianVault: 'Notes', siteRules: [{ host: 'Example.com', selector: 'article', titleSelector: 'h1' }, { host: '', selector: '' }] });
    expect(settings.appearance.theme).toBe('dark');
    expect(settings.capture.mode).toBe('full');
    expect(settings.images.mode).toBe('embed');
    expect(settings.permissions.allSites).toBe(false);
    expect(settings.recipes[0].enabled).toBe(true);
    expect(settings.recipes[0].definition.matches[0].host).toBe('example.com');
    expect(settings.recipes[1].enabled).toBe(false);
    expect(settings.recipes[1].migrationWarning).toBeTruthy();
  });

  it('retains the legacy visible-floating preference until permission reconciliation', () => {
    const settings = migrateLegacy({ 'page2md:floatingHidden': false });
    expect(settings.capture.floating).toBe('all');
    expect(settings.permissions.allSites).toBe(true);
  });
});
