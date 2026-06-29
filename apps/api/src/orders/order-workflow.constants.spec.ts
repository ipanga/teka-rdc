import { OrderStatus } from '@prisma/client';
import {
  ORDER_STATUS_TRANSITIONS,
  canTransition,
  BUYER_CANCELLABLE_STATUSES,
  isWithinReturnWindow,
  RETURN_WINDOW_DAYS,
} from './order-workflow.constants';

describe('order workflow state machine', () => {
  it('drives the managed happy path PENDING → … → DELIVERED', () => {
    const happyPath: [OrderStatus, OrderStatus][] = [
      [OrderStatus.PENDING, OrderStatus.CONFIRMED],
      [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
      [OrderStatus.PROCESSING, OrderStatus.READY_FOR_TEKA_PICKUP],
      [OrderStatus.READY_FOR_TEKA_PICKUP, OrderStatus.RECEIVED_AT_TEKA],
      [OrderStatus.RECEIVED_AT_TEKA, OrderStatus.OUT_FOR_DELIVERY],
      [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED, OrderStatus.RETURNED],
    ];
    for (const [from, to] of happyPath) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('forbids skipping the Teka collection stages', () => {
    // Can't jump straight from PROCESSING to delivery — must go through Teka.
    expect(canTransition(OrderStatus.PROCESSING, OrderStatus.OUT_FOR_DELIVERY)).toBe(false);
    expect(canTransition(OrderStatus.PROCESSING, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransition(OrderStatus.READY_FOR_TEKA_PICKUP, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransition(OrderStatus.RECEIVED_AT_TEKA, OrderStatus.DELIVERED)).toBe(false);
  });

  it('keeps CANCELLED and RETURNED terminal', () => {
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.CANCELLED]).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.RETURNED]).toEqual([]);
  });

  it('still lets a legacy SHIPPED order be completed by admin', () => {
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY)).toBe(true);
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(true);
  });

  it('allows cancel from every pre-custody state', () => {
    for (const s of [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_TEKA_PICKUP,
      OrderStatus.RECEIVED_AT_TEKA,
    ]) {
      expect(canTransition(s, OrderStatus.CANCELLED)).toBe(true);
    }
  });

  it('buyer self-cancel only before the parcel leaves for Teka', () => {
    expect(BUYER_CANCELLABLE_STATUSES).toEqual([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
    ]);
    expect(BUYER_CANCELLABLE_STATUSES).not.toContain(OrderStatus.READY_FOR_TEKA_PICKUP);
    expect(BUYER_CANCELLABLE_STATUSES).not.toContain(OrderStatus.OUT_FOR_DELIVERY);
  });
});

describe('isWithinReturnWindow', () => {
  it('is false when the order was never delivered', () => {
    expect(isWithinReturnWindow(null)).toBe(false);
    expect(isWithinReturnWindow(undefined)).toBe(false);
  });

  it('is true within the window and false after it', () => {
    const delivered = new Date('2026-06-20T10:00:00Z');
    const justInside = new Date('2026-06-22T09:59:00Z'); // < +2d
    const justOutside = new Date('2026-06-22T10:01:00Z'); // > +2d
    expect(RETURN_WINDOW_DAYS).toBe(2);
    expect(isWithinReturnWindow(delivered, justInside)).toBe(true);
    expect(isWithinReturnWindow(delivered, justOutside)).toBe(false);
  });
});
