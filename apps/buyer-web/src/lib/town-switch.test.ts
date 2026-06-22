import { describe, it, expect } from 'vitest';
import { resolveTownSwitchUrl } from './town-switch';

describe('resolveTownSwitchUrl (Town Switcher UX)', () => {
  it('preserves the category in the new town (taxonomy is town-agnostic)', () => {
    expect(resolveTownSwitchUrl('/kolwezi/categorie/telephones', 'lubumbashi')).toBe(
      '/lubumbashi/categorie/telephones',
    );
    // Nested category slug segments are preserved.
    expect(
      resolveTownSwitchUrl('/kolwezi/categorie/telephones-et-accessoires', 'lubumbashi'),
    ).toBe('/lubumbashi/categorie/telephones-et-accessoires');
  });

  it('sends a product page to the new town landing (product may not exist there)', () => {
    expect(resolveTownSwitchUrl('/kolwezi/iphone-15-pro-x12ab', 'lubumbashi')).toBe(
      '/lubumbashi',
    );
  });

  it('sends the homepage, search and town landing to the new town landing', () => {
    expect(resolveTownSwitchUrl('/', 'lubumbashi')).toBe('/lubumbashi');
    expect(resolveTownSwitchUrl('/recherche', 'lubumbashi')).toBe('/lubumbashi');
    expect(resolveTownSwitchUrl('/kolwezi', 'lubumbashi')).toBe('/lubumbashi');
  });
});
