import { canBuyerCancelOrder, canSellerRejectOrder } from '@teka/shared';

// The order detail offers « Annuler la commande » from canBuyerCancelOrder —
// it used to be PENDING-only while the API accepts PENDING/CONFIRMED/PROCESSING.
describe('canBuyerCancelOrder (buyer order detail)', () => {
  it.each(['PENDING', 'CONFIRMED', 'PROCESSING'])('offers cancellation while %s and unpaid', (status) => {
    expect(canBuyerCancelOrder({ status, paymentStatus: 'PENDING' })).toBe(true);
  });

  it.each([
    'READY_FOR_TEKA_PICKUP',
    'RECEIVED_AT_TEKA',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
    'RETURNED',
  ])('never once the order is %s', (status) => {
    expect(canBuyerCancelOrder({ status, paymentStatus: 'PENDING' })).toBe(false);
  });

  it.each(['COMPLETED', 'REFUNDED'])('never when the payment is %s', (paymentStatus) => {
    expect(canBuyerCancelOrder({ status: 'PENDING', paymentStatus })).toBe(false);
  });

  it('an older payload without paymentStatus still follows the status rule', () => {
    expect(canBuyerCancelOrder({ status: 'CONFIRMED' })).toBe(true);
  });
});

describe('canSellerRejectOrder', () => {
  it('only a new, unpaid order', () => {
    expect(canSellerRejectOrder({ status: 'PENDING', paymentStatus: 'PENDING' })).toBe(true);
    expect(canSellerRejectOrder({ status: 'CONFIRMED', paymentStatus: 'PENDING' })).toBe(false);
    expect(canSellerRejectOrder({ status: 'PENDING', paymentStatus: 'COMPLETED' })).toBe(false);
  });
});
