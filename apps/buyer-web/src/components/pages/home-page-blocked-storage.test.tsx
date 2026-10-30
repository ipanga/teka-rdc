/**
 * Regression (M1 review): with ALL localStorage access blocked before
 * hydration, the homepage fell into its error boundary — HomePage's mount
 * effect calls useCityStore.initFromStorage(), which read localStorage
 * unguarded. This renders the real HomePage client-side (effects run: header,
 * footer included) with storage throwing on access.
 */
import { Component, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { BrowseCategory } from '@/lib/types';
import type { City } from '@/lib/city-store';

const apiFetch = vi.fn((..._a: unknown[]) => new Promise(() => {})); // network never answers
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  ApiError: class extends Error {},
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), trackSearch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import HomePage from './home-page';
import { useCityStore } from '@/lib/city-store';

const cities: City[] = [
  { id: 'c1', name: 'Lubumbashi', slug: 'lubumbashi', province: 'Haut-Katanga', isActive: true, sortOrder: 1 },
];
const tree: BrowseCategory[] = [
  { id: 'cat-elec', name: 'Téléphones & Électronique', emoji: null, slug: 'telephones-et-electronique', parentId: null, productCount: 3, subcategories: [] },
];

class Boundary extends Component<{ onError: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? <p>error-boundary</p> : this.props.children;
  }
}

let restore: () => void = () => {};
beforeEach(() => {
  useCityStore.setState({ cities: [], selectedCity: null, isLoading: false, showSelector: false });
  const own = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('QA blocked', 'SecurityError');
    },
  });
  restore = () => {
    if (own) Object.defineProperty(window, 'localStorage', own);
    else delete (window as unknown as { localStorage?: Storage }).localStorage;
  };
});
afterEach(() => restore());

describe('homepage with localStorage blocked', () => {
  it('mounts and runs its effects without hitting the error boundary', async () => {
    const errors: unknown[] = [];
    await act(async () => {
      render(
        <Boundary onError={(e) => errors.push(e)}>
          <HomePage serverH1="Teka RDC — Supermarché en ligne en RD Congo" initialCategories={tree} initialBanners={[]} initialCities={cities} />
        </Boundary>,
      );
    });
    expect(errors).toEqual([]);
    expect(screen.queryByText('error-boundary')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Teka RDC — Supermarché en ligne en RD Congo' })).toBeInTheDocument();
    // The town selection keeps working in memory.
    act(() => useCityStore.getState().setCity(cities[0]));
    expect(useCityStore.getState().selectedCity?.id).toBe('c1');
  });
});
