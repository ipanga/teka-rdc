import { describe, expect, it } from 'vitest';
import { communeHint, communeRequired, retainedCommuneId } from './commune-rules';

describe('communeRequired — mirrors the API rule', () => {
  it('is required only once a non-empty library has loaded', () => {
    expect(communeRequired({ loaded: true, communeCount: 6 })).toBe(true);
    // A city without communes (e.g. Likasi today) accepts the city alone.
    expect(communeRequired({ loaded: true, communeCount: 0 })).toBe(false);
    // Never claim optional while loading — the API decides.
    expect(communeRequired({ loaded: false, communeCount: 0 })).toBe(false);
  });
});

describe('retainedCommuneId — a city change clears an invalid commune', () => {
  const lubumbashi = ['c-kampemba', 'c-kenya', 'c-katuba'];
  it('keeps a commune of the new list, clears a foreign or empty one', () => {
    expect(retainedCommuneId('c-kenya', lubumbashi)).toBe('c-kenya');
    expect(retainedCommuneId('c-dilala', lubumbashi)).toBe('');
    expect(retainedCommuneId('', lubumbashi)).toBe('');
    expect(retainedCommuneId('c-kenya', [])).toBe('');
  });
});

describe('communeHint', () => {
  it('walks the states in order', () => {
    expect(communeHint(false, { loaded: false, loading: false, communeCount: 0 })).toBe('Sélectionnez d’abord une ville');
    expect(communeHint(true, { loaded: false, loading: true, communeCount: 0 })).toBe('Chargement des communes…');
    expect(communeHint(true, { loaded: true, loading: false, communeCount: 0 })).toBe(
      'Aucune commune enregistrée pour cette ville pour le moment',
    );
    expect(communeHint(true, { loaded: true, loading: false, communeCount: 3 })).toBe('Sélectionnez votre commune');
  });
});
