import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('./analytics', () => ({ track: vi.fn() }));

import { apiFetch } from './api-client';
import { track } from './analytics';
import { useWishlistStore } from './wishlist-store';

const mockApi = apiFetch as unknown as ReturnType<typeof vi.fn>;
const mockTrack = track as unknown as ReturnType<typeof vi.fn>;

function setState(partial: Partial<ReturnType<typeof useWishlistStore.getState>>) {
  useWishlistStore.setState(partial);
}

beforeEach(() => {
  vi.clearAllMocks();
  useWishlistStore.setState({ ids: new Set(), count: 0, isAuthenticated: true });
});

describe('wishlist-store', () => {
  it('toggle adds optimistically, POSTs, and fires wishlist_added', async () => {
    mockApi.mockResolvedValue({});
    await useWishlistStore.getState().toggle('p1');
    expect(useWishlistStore.getState().ids.has('p1')).toBe(true);
    expect(useWishlistStore.getState().count).toBe(1);
    expect(mockApi).toHaveBeenCalledWith('/v1/wishlist/p1', { method: 'POST' });
    expect(mockTrack).toHaveBeenCalledWith('wishlist_added', { productId: 'p1' });
  });

  it('toggle removes when present, DELETEs, and fires wishlist_removed', async () => {
    setState({ ids: new Set(['p1']), count: 1 });
    mockApi.mockResolvedValue({});
    await useWishlistStore.getState().toggle('p1');
    expect(useWishlistStore.getState().ids.has('p1')).toBe(false);
    expect(useWishlistStore.getState().count).toBe(0);
    expect(mockApi).toHaveBeenCalledWith('/v1/wishlist/p1', { method: 'DELETE' });
    expect(mockTrack).toHaveBeenCalledWith('wishlist_removed', { productId: 'p1' });
  });

  it('toggle rolls back on API failure and does not fire analytics', async () => {
    mockApi.mockRejectedValue(new Error('boom'));
    await expect(useWishlistStore.getState().toggle('p1')).rejects.toThrow();
    expect(useWishlistStore.getState().ids.has('p1')).toBe(false);
    expect(useWishlistStore.getState().count).toBe(0);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('hydrate reconciles only the queried ids', async () => {
    setState({ ids: new Set(['kept']), count: 1 });
    mockApi.mockResolvedValue({ data: ['a'] }); // only 'a' wishlisted among queried
    await useWishlistStore.getState().hydrate(['a', 'b']);
    const ids = useWishlistStore.getState().ids;
    expect(ids.has('a')).toBe(true); // added
    expect(ids.has('b')).toBe(false); // queried but not wishlisted → removed
    expect(ids.has('kept')).toBe(true); // not queried → untouched
  });

  it('hydrate is a no-op when not authenticated (no fetch)', async () => {
    setState({ isAuthenticated: false });
    await useWishlistStore.getState().hydrate(['a']);
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('add is idempotent (no-op when already wishlisted)', async () => {
    setState({ ids: new Set(['p1']), count: 1 });
    await useWishlistStore.getState().add('p1');
    expect(mockApi).not.toHaveBeenCalled();
    expect(useWishlistStore.getState().count).toBe(1);
  });

  it('add POSTs + increments when absent', async () => {
    mockApi.mockResolvedValue({});
    await useWishlistStore.getState().add('p2');
    expect(useWishlistStore.getState().ids.has('p2')).toBe(true);
    expect(useWishlistStore.getState().count).toBe(1);
    expect(mockApi).toHaveBeenCalledWith('/v1/wishlist/p2', { method: 'POST' });
  });

  it('loadCount sets the count from the API', async () => {
    mockApi.mockResolvedValue({ data: { count: 5 } });
    await useWishlistStore.getState().loadCount();
    expect(useWishlistStore.getState().count).toBe(5);
    expect(mockApi).toHaveBeenCalledWith('/v1/wishlist/count');
  });

  it('reset clears ids + count', () => {
    setState({ ids: new Set(['a']), count: 3 });
    useWishlistStore.getState().reset();
    expect(useWishlistStore.getState().ids.size).toBe(0);
    expect(useWishlistStore.getState().count).toBe(0);
  });
});
