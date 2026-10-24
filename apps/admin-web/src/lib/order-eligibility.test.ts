import { adminForceStatusTargets, canAdminCancelOrder } from '@teka/shared';

// The admin order detail builds its force-status options and its cancel
// button from these. The API refuses the same transitions; offering them only
// produced « Erreur ».
const ALL = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_TEKA_PICKUP',
  'RECEIVED_AT_TEKA',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
];

describe('adminForceStatusTargets', () => {
  it('offers nothing for a cancelled or returned order (no revival)', () => {
    expect(adminForceStatusTargets({ status: 'CANCELLED', paymentStatus: 'FAILED' }, ALL)).toEqual([]);
    expect(adminForceStatusTargets({ status: 'RETURNED', paymentStatus: 'COMPLETED' }, ALL)).toEqual([]);
  });

  it('never offers the current status, nor RETURNED for an undelivered order', () => {
    const targets = adminForceStatusTargets({ status: 'PROCESSING', paymentStatus: 'PENDING' }, ALL);
    expect(targets).not.toContain('PROCESSING');
    expect(targets).not.toContain('RETURNED');
    expect(targets).toContain('CANCELLED');
    expect(targets).toContain('DELIVERED');
  });

  it('a delivered order may be forced to RETURNED but not CANCELLED', () => {
    const targets = adminForceStatusTargets({ status: 'DELIVERED', paymentStatus: 'COMPLETED' }, ALL);
    expect(targets).toContain('RETURNED');
    expect(targets).not.toContain('CANCELLED');
  });

  it('a paid pre-delivery order (legacy rewind) cannot be forced to CANCELLED', () => {
    const targets = adminForceStatusTargets({ status: 'OUT_FOR_DELIVERY', paymentStatus: 'COMPLETED' }, ALL);
    expect(targets).not.toContain('CANCELLED');
  });
});

describe('canAdminCancelOrder', () => {
  it.each(['PENDING', 'READY_FOR_TEKA_PICKUP', 'OUT_FOR_DELIVERY', 'SHIPPED'])(
    'allows %s while unpaid (incl. a parcel refused at the door)',
    (status) => expect(canAdminCancelOrder({ status, paymentStatus: 'PENDING' })).toBe(true),
  );

  it.each(['DELIVERED', 'CANCELLED', 'RETURNED'])('refuses %s', (status) =>
    expect(canAdminCancelOrder({ status, paymentStatus: 'PENDING' })).toBe(false),
  );

  it('refuses a paid or refunded order', () => {
    expect(canAdminCancelOrder({ status: 'PENDING', paymentStatus: 'COMPLETED' })).toBe(false);
    expect(canAdminCancelOrder({ status: 'PENDING', paymentStatus: 'REFUNDED' })).toBe(false);
  });
});
