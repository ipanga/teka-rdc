import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// vi.mock factories are hoisted — shared mocks must live in vi.hoisted().
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toggle: vi.fn().mockResolvedValue(undefined),
  setPendingWishlistAdd: vi.fn(),
  authState: { user: null as unknown, isLoading: false },
  wishlistIds: new Set<string>(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => '/produit-x',
}));
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));
vi.mock('@/components/ui', () => ({
  cn: (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' '),
}));
vi.mock('@/lib/auth-store', () => ({
  useAuthStore: (sel: (s: typeof mocks.authState) => unknown) => sel(mocks.authState),
}));
vi.mock('@/lib/wishlist-store', () => ({
  useWishlistStore: (sel: (s: { ids: Set<string>; toggle: typeof mocks.toggle }) => unknown) =>
    sel({ ids: mocks.wishlistIds, toggle: mocks.toggle }),
  setPendingWishlistAdd: mocks.setPendingWishlistAdd,
}));

import { WishlistButton } from './wishlist-button';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.toggle.mockResolvedValue(undefined);
  mocks.authState = { user: null, isLoading: false };
  mocks.wishlistIds = new Set();
});

describe('WishlistButton', () => {
  it('guest tap stashes the pending add and routes to /connexion with the current path', async () => {
    mocks.authState = { user: null, isLoading: false };
    render(<WishlistButton productId="p1" />);
    await userEvent.click(screen.getByRole('button'));
    expect(mocks.setPendingWishlistAdd).toHaveBeenCalledWith('p1');
    expect(mocks.push).toHaveBeenCalledWith('/connexion?redirect=%2Fproduit-x');
    expect(mocks.toggle).not.toHaveBeenCalled();
  });

  it('does NOT route to /connexion while auth is still loading (regression: no bounce-to-home)', async () => {
    // user null but auth unresolved — the session cookie may still be valid, so
    // routing to /connexion would let the middleware bounce to home.
    mocks.authState = { user: null, isLoading: true };
    render(<WishlistButton productId="p1" />);
    await userEvent.click(screen.getByRole('button'));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.setPendingWishlistAdd).not.toHaveBeenCalled();
    expect(mocks.toggle).not.toHaveBeenCalled();
  });

  it('authenticated tap toggles the wishlist and never navigates', async () => {
    mocks.authState = { user: { id: 'u1' }, isLoading: false };
    render(<WishlistButton productId="p1" />);
    await userEvent.click(screen.getByRole('button'));
    expect(mocks.toggle).toHaveBeenCalledWith('p1');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.setPendingWishlistAdd).not.toHaveBeenCalled();
  });
});
