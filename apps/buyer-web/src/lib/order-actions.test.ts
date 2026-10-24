import { vi } from 'vitest';
import { mergeOrderMutation } from '@teka/shared';
import { ApiError } from './api-client';
import { cancelBuyerOrder } from './order-actions';
import type { Order } from './types';

const pending = (): Order =>
  ({
    id: 'o1',
    orderNumber: 'TK-20261017-AB12',
    status: 'PENDING',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    subtotalCDF: '2500000',
    deliveryFeeCDF: '300000',
    totalCDF: '2800000',
    seller: { id: 's', firstName: 'A', lastName: 'B', sellerProfile: null },
    items: [
      { id: 'i1', productId: 'p1', quantity: 1, unitPriceCDF: '2500000', totalCDF: '2500000', productTitle: 'Pagne wax', productImage: null, product: { id: 'p1', slug: 'pagne', shortCode: 'X1', status: 'ACTIVE', city: { slug: 'lubumbashi' } } },
    ],
    deliveryAddress: { id: 'a', recipientName: 'Ilunga', town: 'Lubumbashi', neighborhood: 'Kampemba' },
    statusLogs: [
      { id: 'l1', fromStatus: null, toStatus: 'PENDING', createdAt: '2026-10-17T08:00:00.000Z' },
    ],
    createdAt: '2026-10-17T08:00:00.000Z',
    updatedAt: '2026-10-17T08:00:00.000Z',
  }) as unknown as Order;

// The cancel endpoint's real (partial) response: status, payment, 5 latest
// logs, trimmed items without the live product link.
const cancelResponse = {
  id: 'o1',
  status: 'CANCELLED',
  paymentStatus: 'FAILED',
  cancellationReason: "Changé d'avis",
  updatedAt: '2026-10-17T09:00:00.000Z',
  items: [{ id: 'i1', productTitle: 'Pagne wax', quantity: 1, unitPriceCDF: '2500000', totalCDF: '2500000' }],
  statusLogs: [
    { id: 'l2', fromStatus: 'PENDING', toStatus: 'CANCELLED', createdAt: '2026-10-17T09:00:00.000Z' },
    { id: 'l1', fromStatus: null, toStatus: 'PENDING', createdAt: '2026-10-17T08:00:00.000Z' },
  ],
};

describe('cancelBuyerOrder — successful POST, failed re-read (I2 regression)', () => {
  it('shows the server-returned CANCELLED/FAILED state, not a stale PENDING badge', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: cancelResponse })
      .mockRejectedValueOnce(new TypeError('Failed to fetch')); // 2G drop on the GET

    const out = await cancelBuyerOrder('o1', "Changé d'avis", pending(), fetcher as never);

    expect(out.cancelled).toBe(true);
    expect(out.error).toBeNull();
    expect(out.order.status).toBe('CANCELLED');
    expect(out.order.paymentStatus).toBe('FAILED');
    expect(out.order.statusLogs.map((l) => l.id)).toEqual(['l2', 'l1']);
    // Fields absent from / trimmed in the partial response are preserved.
    expect(out.order.items[0].product?.shortCode).toBe('X1');
    expect(out.order.deliveryAddress.town).toBe('Lubumbashi');
    expect(out.order.totalCDF).toBe('2800000');
  });

  it('the full re-read wins when it succeeds', async () => {
    const full = { ...pending(), status: 'CANCELLED', paymentStatus: 'FAILED' };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: cancelResponse })
      .mockResolvedValueOnce({ success: true, data: full });
    const out = await cancelBuyerOrder('o1', undefined, pending(), fetcher as never);
    expect(out.order).toBe(full);
  });

  it('a refused POST never invents a cancellation; the re-read shows the truth', async () => {
    const handedOver = { ...pending(), status: 'READY_FOR_TEKA_PICKUP' };
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new ApiError({ error: { status: 400, message: 'Cette commande ne peut plus être annulée.' } }))
      .mockResolvedValueOnce({ success: true, data: handedOver });
    const out = await cancelBuyerOrder('o1', undefined, pending(), fetcher as never);
    expect(out.cancelled).toBe(false);
    expect(out.error).toBe('Cette commande ne peut plus être annulée.');
    expect(out.order.status).toBe('READY_FOR_TEKA_PICKUP');
  });

  it('an unknown outcome (network error, then no re-read) keeps the previous view', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const out = await cancelBuyerOrder('o1', undefined, pending(), fetcher as never);
    expect(out.cancelled).toBe(false);
    expect(out.order.status).toBe('PENDING');
    expect(out.error).toContain('Vérifiez votre connexion');
  });
});

describe('mergeOrderMutation', () => {
  it('ignores non-order payloads and responses for another order', () => {
    const current = pending();
    expect(mergeOrderMutation(current, null)).toBe(current);
    expect(mergeOrderMutation(current, { foo: 1 })).toBe(current);
    expect(mergeOrderMutation(current, { id: 'other', status: 'CANCELLED' })).toBe(current);
  });

  it('copies only authoritative fields — never totals or stock', () => {
    const merged = mergeOrderMutation(pending(), { id: 'o1', status: 'CONFIRMED', totalCDF: '1', quantity: 99 });
    expect(merged.status).toBe('CONFIRMED');
    expect(merged.totalCDF).toBe('2800000');
    expect((merged as unknown as Record<string, unknown>).quantity).toBeUndefined();
  });
});
