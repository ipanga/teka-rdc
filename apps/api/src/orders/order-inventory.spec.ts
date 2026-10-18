import {
  ADMIN_CANCELLABLE_ORDER_STATUSES,
  BUYER_CANCELLABLE_ORDER_STATUSES,
  CANCELLATION_BLOCKING_PAYMENT_STATUSES as SHARED_BLOCKING,
  STOCK_RELEASED_ORDER_STATUSES,
} from '@teka/shared';
import {
  ADMIN_CANCELLABLE_STATUSES,
  CANCELLATION_BLOCKING_PAYMENT_STATUSES,
  STOCK_RELEASED_STATUSES,
} from './order-inventory';
import { BUYER_CANCELLABLE_STATUSES } from './order-workflow.constants';

// The clients decide which buttons to show from @teka/shared; the API decides
// what is allowed. If these drift, a client offers an action that always fails
// (or hides one that works) — so pin them together.
describe('order eligibility — @teka/shared mirrors the API', () => {
  const sorted = (xs: readonly string[]) => [...xs].sort();

  it('buyer-cancellable statuses', () => {
    expect(sorted(BUYER_CANCELLABLE_ORDER_STATUSES)).toEqual(sorted(BUYER_CANCELLABLE_STATUSES));
  });

  it('admin-cancellable statuses', () => {
    expect(sorted(ADMIN_CANCELLABLE_ORDER_STATUSES)).toEqual(sorted(ADMIN_CANCELLABLE_STATUSES));
  });

  it('final (stock-released) statuses', () => {
    expect(sorted(STOCK_RELEASED_ORDER_STATUSES)).toEqual(sorted(STOCK_RELEASED_STATUSES));
  });

  it('payment statuses that block a cancellation', () => {
    expect(sorted(SHARED_BLOCKING)).toEqual(sorted(CANCELLATION_BLOCKING_PAYMENT_STATUSES));
  });
});
