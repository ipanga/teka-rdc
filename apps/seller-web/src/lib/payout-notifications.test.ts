import { describe, expect, it } from 'vitest';
import {
  PAYOUT_STATUS_LABELS,
  describePayoutLoadError,
  hrefForNotification,
  parseEarningsQuery,
  payoutHref,
} from './payout-notifications';

const PAY = '0f1e2d3c-4b5a-4c6d-8e7f-90a1b2c3d4e5';

describe('hrefForNotification', () => {
  it('routes payout feed items to the earnings page, payouts tab, with the payout opened', () => {
    expect(hrefForNotification({ type: 'PAYOUT', entityType: 'payout', entityId: PAY })).toBe(
      `/dashboard/earnings?tab=payouts&payout=${PAY}`,
    );
  });
  it('a PAYOUT item without a usable id still lands on the payouts tab', () => {
    expect(hrefForNotification({ type: 'PAYOUT', entityType: 'payout', entityId: null })).toBe('/dashboard/earnings?tab=payouts');
    expect(hrefForNotification({ type: 'PAYOUT', entityType: 'payout', entityId: 'not-a-uuid' })).toBe('/dashboard/earnings?tab=payouts');
  });
  it('keeps the existing product / order routes and the fallback', () => {
    expect(hrefForNotification({ type: 'PRODUCT_APPROVED', entityType: 'product', entityId: PAY })).toBe(`/dashboard/products/${PAY}`);
    expect(hrefForNotification({ type: 'ORDER', entityType: 'order', entityId: PAY })).toBe(`/dashboard/orders/${PAY}`);
    expect(hrefForNotification({ type: 'BROADCAST', entityType: null, entityId: null })).toBe('/dashboard/products');
  });
  it('never builds a path from a non-uuid entity id (no injection into the URL)', () => {
    expect(hrefForNotification({ type: 'ORDER', entityType: 'order', entityId: '../admin' })).toBe('/dashboard/products');
  });
});

describe('parseEarningsQuery', () => {
  it('opens the payouts tab with the payout when the link is well-formed', () => {
    expect(parseEarningsQuery(`?tab=payouts&payout=${PAY.toUpperCase()}`)).toEqual({ tab: 'payouts', payoutId: PAY });
    expect(parseEarningsQuery(payoutHref(PAY).split('?')[1])).toEqual({ tab: 'payouts', payoutId: PAY });
  });
  it('a payout id alone implies the payouts tab', () => {
    expect(parseEarningsQuery(`?payout=${PAY}`).tab).toBe('payouts');
  });
  it('malformed / stale links degrade to the default without a payout', () => {
    expect(parseEarningsQuery('')).toEqual({ tab: 'earnings', payoutId: null });
    expect(parseEarningsQuery('?tab=bogus&payout=123')).toEqual({ tab: 'earnings', payoutId: null });
    expect(parseEarningsQuery('?tab=payouts&payout=<script>')).toEqual({ tab: 'payouts', payoutId: null });
  });
});

describe('seller-facing payout vocabulary', () => {
  it('approval is never worded as payment; COMPLETED reads « Payé »', () => {
    expect(PAYOUT_STATUS_LABELS.APPROVED.toLowerCase()).not.toContain('payé');
    expect(PAYOUT_STATUS_LABELS.PROCESSING.toLowerCase()).not.toContain('payé');
    expect(PAYOUT_STATUS_LABELS.COMPLETED).toBe('Payé');
  });
  it('load errors: 404 = not yours or gone (no existence leak), auth → reconnect, else retry', () => {
    expect(describePayoutLoadError({ status: 404 })).toMatch(/introuvable ou ne vous appartient pas/);
    expect(describePayoutLoadError({ status: 401 })).toMatch(/Reconnectez/);
    expect(describePayoutLoadError(new Error('boom'))).toMatch(/Réessayez/);
  });
});
