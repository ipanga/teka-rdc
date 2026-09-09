import { describe, expect, it } from 'vitest';
import { deliveryPhrase, deliveryTitle, joinTownNames } from './service-area';

const L = { name: 'Lubumbashi', isActive: true };
const K = { name: 'Kolwezi', isActive: true };
const LIKASI_INACTIVE = { name: 'Likasi', isActive: false };
const LIKASI_ACTIVE = { name: 'Likasi', isActive: true };

describe('service-area copy (SEO-2 decision 2)', () => {
  it('names exactly the active towns, in API order', () => {
    expect(deliveryPhrase([L, K])).toBe('Livraison à Lubumbashi et Kolwezi.');
    expect(deliveryTitle([L, K])).toBe('Livraison Lubumbashi & Kolwezi');
  });

  it('never advertises an inactive town', () => {
    expect(deliveryPhrase([L, K, LIKASI_INACTIVE])).not.toContain('Likasi');
    expect(joinTownNames([LIKASI_INACTIVE])).toBe('');
  });

  it('shows a town automatically once it is active — no code change needed', () => {
    expect(deliveryPhrase([L, K, LIKASI_ACTIVE])).toBe('Livraison à Lubumbashi, Kolwezi et Likasi.');
    expect(deliveryPhrase([L])).toBe('Livraison à Lubumbashi.');
  });

  it('degrades to the country, never to a stale town, when no active town is known', () => {
    expect(deliveryPhrase([])).toBe('Livraison en RD Congo.');
    expect(deliveryPhrase([], 'Livraison rapide')).toBe('Livraison rapide en RD Congo.');
    expect(deliveryTitle([])).toBe('Livraison en RD Congo');
  });
});
