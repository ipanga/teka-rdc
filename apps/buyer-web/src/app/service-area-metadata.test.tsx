/**
 * SEO-2 decision 2 — public service-area copy names ONLY active towns and is
 * derived from the active-town API, so an activation shows up on its own.
 * Covers the four metadata strings that hard-coded « Lubumbashi, Kolwezi et
 * Likasi » while Likasi was inactive.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const serverFetch = vi.fn();
vi.mock('@/lib/server-api', () => ({ serverFetch: (...a: unknown[]) => serverFetch(...a) }));
vi.mock('./globals.css', () => ({}));
vi.mock('next/font/google', () => ({ Inter: () => ({ variable: '--font-inter', className: 'inter' }) }));
vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  permanentRedirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));

import { generateMetadata as layoutMetadata } from './layout';
import { generateMetadata as homeMetadata } from './page';
import { generateMetadata as promotionsMetadata } from './promotions/page';
import { generateMetadata as productMetadata } from './[ville]/[product]/page';

const ACTIVE = [
  { id: 'c1', name: 'Lubumbashi', slug: 'lubumbashi', province: 'Haut-Katanga', isActive: true, sortOrder: 1 },
  { id: 'c2', name: 'Kolwezi', slug: 'kolwezi', province: 'Lualaba', isActive: true, sortOrder: 2 },
];
const WITH_LIKASI = [...ACTIVE, { id: 'c3', name: 'Likasi', slug: 'likasi', province: 'Haut-Katanga', isActive: true, sortOrder: 3 }];

async function allDescriptions() {
  const missingProduct = { params: Promise.resolve({ ville: 'lubumbashi', product: 'nope-zz9zz9' }) };
  const metas = await Promise.all([layoutMetadata(), homeMetadata(), promotionsMetadata(), productMetadata(missingProduct)]);
  return metas.map((m) => `${String(m.title ?? '')} ${String(m.description)} ${String((m.openGraph as { description?: string })?.description ?? '')}`);
}

beforeEach(() => {
  serverFetch.mockReset();
});

describe('service-area copy in public metadata (SEO-2 decision 2)', () => {
  it('names the active towns only — Likasi (inactive) appears nowhere', async () => {
    serverFetch.mockImplementation(async (path: string) => (path === '/v1/cities' ? ACTIVE : null));
    const texts = await allDescriptions();
    expect(texts).toHaveLength(4);
    for (const t of texts) {
      expect(t).toContain('Lubumbashi');
      expect(t).toContain('Kolwezi');
      expect(t).not.toContain('Likasi');
    }
    expect(texts[1]).toContain('Livraison Lubumbashi & Kolwezi');
    // COD only since 2026-05-26 — the homepage no longer advertises Mobile Money.
    expect(texts[1]).not.toMatch(/Mobile Money/i);
    expect(texts[1]).toContain('Paiement à la livraison');
  });

  it('shows Likasi automatically once the API reports it active — no code change', async () => {
    serverFetch.mockImplementation(async (path: string) => (path === '/v1/cities' ? WITH_LIKASI : null));
    const texts = await allDescriptions();
    for (const t of texts) expect(t).toContain('Lubumbashi, Kolwezi et Likasi');
  });

  it('degrades to the country when no active town is known (API down at render)', async () => {
    serverFetch.mockImplementation(async () => null);
    const texts = await allDescriptions();
    for (const t of texts) {
      expect(t).toContain('RD Congo');
      expect(t).not.toMatch(/Likasi|Lubumbashi|Kolwezi/);
    }
  });
});
