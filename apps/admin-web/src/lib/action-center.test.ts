import { describe, expect, it } from 'vitest';
import {
  buildActionQueues,
  QUEUE_HREFS,
  readStatusParam,
  totalPendingActions,
  withStatusParam,
  type ActionCenterStats,
} from './action-center';

const stats: ActionCenterStats = {
  sellerApplicationsPending: 3,
  productsPendingReview: 5,
  returnsPending: 1,
  ordersReadyForPickup: 2,
  ordersReceivedAtTeka: 0,
  payoutsAwaitingReview: { count: 4, amountCDF: '90000000' },
  payoutsAwaitingPayment: { count: 2, processingCount: 1, amountCDF: '12000000' },
};

describe('buildActionQueues', () => {
  it('maps every action-center counter to exactly one tile', () => {
    const queues = buildActionQueues(stats);
    expect(queues.map((q) => q.key).sort()).toEqual(Object.keys(stats).sort());
  });

  it('each tile deep-links to the queue its count was computed from', () => {
    for (const q of buildActionQueues(stats)) {
      expect(q.href).toBe(QUEUE_HREFS[q.key]);
      // The href carries the status filter the destination page honours.
      expect(q.href).toMatch(/\?status=[A-Z_]+$/);
    }
    expect(QUEUE_HREFS.payoutsAwaitingReview).toBe('/dashboard/payouts?status=REQUESTED');
    expect(QUEUE_HREFS.sellerApplicationsPending).toBe('/dashboard/sellers?status=PENDING');
  });

  it('carries counts and money through unchanged (strings of centimes, never Number math)', () => {
    const q = buildActionQueues(stats);
    const review = q.find((x) => x.key === 'payoutsAwaitingReview')!;
    expect(review.count).toBe(4);
    expect(review.amountCDF).toBe('90000000');
    const pay = q.find((x) => x.key === 'payoutsAwaitingPayment')!;
    expect(pay.count).toBe(2);
    expect(pay.detail).toContain('dont 1 en traitement');
  });

  it('puts finance first and never invents a queue with no count', () => {
    const q = buildActionQueues(stats);
    expect(q[0].tone).toBe('finance');
    expect(q.every((x) => Number.isInteger(x.count) && x.count >= 0)).toBe(true);
  });

  it('totalPendingActions sums the counts (0 → "Rien à traiter")', () => {
    expect(totalPendingActions(buildActionQueues(stats))).toBe(17);
    const empty: ActionCenterStats = {
      ...stats,
      sellerApplicationsPending: 0,
      productsPendingReview: 0,
      returnsPending: 0,
      ordersReadyForPickup: 0,
      payoutsAwaitingReview: { count: 0, amountCDF: '0' },
      payoutsAwaitingPayment: { count: 0, processingCount: 0, amountCDF: '0' },
    };
    expect(totalPendingActions(buildActionQueues(empty))).toBe(0);
  });
});

describe('readStatusParam / withStatusParam', () => {
  const allowed = ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED'] as const;

  it('accepts only allow-listed values', () => {
    expect(readStatusParam('?status=REQUESTED', allowed)).toBe('REQUESTED');
    expect(readStatusParam('?status=DROP%20TABLE', allowed)).toBe('');
    expect(readStatusParam('?status=', allowed)).toBe('');
    expect(readStatusParam('', allowed)).toBe('');
  });

  it('round-trips through the dashboard hrefs', () => {
    for (const href of Object.values(QUEUE_HREFS)) {
      const search = href.slice(href.indexOf('?'));
      const status = new URLSearchParams(search).get('status')!;
      expect(readStatusParam(search, [status])).toBe(status);
    }
  });

  it('sets, replaces and removes status while keeping other params', () => {
    expect(withStatusParam('/dashboard/payouts?page=2', 'APPROVED')).toBe('/dashboard/payouts?page=2&status=APPROVED');
    expect(withStatusParam('/dashboard/payouts?status=REQUESTED&page=2', 'APPROVED')).toBe('/dashboard/payouts?status=APPROVED&page=2');
    expect(withStatusParam('/dashboard/payouts?status=REQUESTED', '')).toBe('/dashboard/payouts');
  });
});
