import { BadRequestException } from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { AdminOrdersService } from './admin-orders.service';

// AdminOrdersService transition methods depend on prisma + earnings/payments/
// notification/analytics. Mock them all; $transaction runs the callback inline.
function makeService(order: Record<string, unknown> | null) {
  const tx = {
    orderStatusLog: { create: jest.fn().mockResolvedValue({}) },
    order: {
      update: jest.fn().mockResolvedValue({
        id: 'o1',
        buyerId: 'b1',
        sellerId: 's1',
        orderNumber: 'TK-1',
        totalCDF: 12345600n,
        paymentStatus: PaymentStatus.COMPLETED,
        items: [{ productId: 'p1', quantity: 2 }],
      }),
    },
    product: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const earningsService = { createEarning: jest.fn().mockResolvedValue({}) };
  const paymentsService = {
    completeCodTransaction: jest.fn().mockResolvedValue({}),
  };
  const notificationService = {
    notifyOrderReceivedAtTeka: jest.fn().mockResolvedValue(undefined),
    notifyOrderOutForDelivery: jest.fn().mockResolvedValue(undefined),
    notifyOrderDelivered: jest.fn().mockResolvedValue(undefined),
  };
  const analytics = { capture: jest.fn() };
  const service = new AdminOrdersService(
    prisma as never,
    earningsService as never,
    paymentsService as never,
    notificationService as never,
    analytics as never,
  );
  return { service, prisma, tx, earningsService, paymentsService, notificationService };
}

const orderAt = (status: OrderStatus, paymentMethod = PaymentMethod.COD) => ({
  id: 'o1',
  status,
  paymentMethod,
  deletedAt: null,
});

describe('AdminOrdersService — Teka transitions', () => {
  it('markReceivedAtTeka: READY_FOR_TEKA_PICKUP → RECEIVED_AT_TEKA', async () => {
    const { service, tx, notificationService } = makeService(
      orderAt(OrderStatus.READY_FOR_TEKA_PICKUP),
    );
    await service.markReceivedAtTeka('o1', 'admin1');
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: OrderStatus.RECEIVED_AT_TEKA },
      }),
    );
    expect(notificationService.notifyOrderReceivedAtTeka).toHaveBeenCalled();
  });

  it('markReceivedAtTeka rejects an invalid source status', async () => {
    const { service } = makeService(orderAt(OrderStatus.PENDING));
    await expect(service.markReceivedAtTeka('o1', 'admin1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('markDelivered: stamps deliveredAt, completes COD payment, triggers earning', async () => {
    const { service, tx, earningsService, paymentsService } = makeService(
      orderAt(OrderStatus.OUT_FOR_DELIVERY),
    );
    await service.markDelivered('o1', 'admin1');

    const updateArg = (tx.order.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data.status).toBe(OrderStatus.DELIVERED);
    expect(updateArg.data.deliveredAt).toBeInstanceOf(Date);
    expect(updateArg.data.paymentStatus).toBe(PaymentStatus.COMPLETED);
    // unitsSold bumped for the line item
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unitsSold: { increment: 2 } } }),
    );
    expect(paymentsService.completeCodTransaction).toHaveBeenCalledWith('o1');
    expect(earningsService.createEarning).toHaveBeenCalledWith('o1');
  });

  it('markDelivered rejects when not out for delivery', async () => {
    const { service } = makeService(orderAt(OrderStatus.RECEIVED_AT_TEKA));
    await expect(service.markDelivered('o1', 'admin1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('markOutForDelivery: RECEIVED_AT_TEKA → OUT_FOR_DELIVERY', async () => {
    const { service, tx, notificationService } = makeService(
      orderAt(OrderStatus.RECEIVED_AT_TEKA),
    );
    await service.markOutForDelivery('o1', 'admin1');
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: OrderStatus.OUT_FOR_DELIVERY },
      }),
    );
    expect(notificationService.notifyOrderOutForDelivery).toHaveBeenCalled();
  });
});

// ─── DELIVERED ⇒ deliveredAt invariant ───────────────────────────────────
//
// forceStatusChange() used to write only { status }. Because it is reachable
// from the admin UI (the force-status modal offers "Livrées"), an order could
// become DELIVERED with deliveredAt = NULL — which made it invisible to every
// date-windowed report, to payout eligibility and to the delivered-today count,
// and un-returnable by the buyer (isWithinReturnWindow(null) is false).

describe('AdminOrdersService.forceStatusChange — deliveredAt invariant', () => {
  it('stamps deliveredAt when forcing an order to DELIVERED', async () => {
    const { service, tx } = makeService({
      ...orderAt(OrderStatus.PROCESSING),
      deliveredAt: null,
    });

    await service.forceStatusChange('o1', OrderStatus.DELIVERED, 'admin1');

    const data = (tx.order.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe(OrderStatus.DELIVERED);
    expect(data.deliveredAt).toBeInstanceOf(Date);
  });

  // A DELIVERED → X → DELIVERED round trip must not reset the clock: the
  // original timestamp is the accurate one, and overwriting it would silently
  // restart the buyer's 2-day return window and shift payout eligibility.
  it('preserves an existing deliveredAt instead of overwriting it', async () => {
    const original = new Date('2026-06-15T09:00:00Z');
    const { service, tx } = makeService({
      ...orderAt(OrderStatus.RETURNED),
      deliveredAt: original,
    });

    await service.forceStatusChange('o1', OrderStatus.DELIVERED, 'admin1');

    const data = (tx.order.update as jest.Mock).mock.calls[0][0].data;
    expect(data.deliveredAt).toBeUndefined();
  });

  it('does not touch deliveredAt for any other target status', async () => {
    for (const status of [
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.CANCELLED,
      OrderStatus.RETURNED,
    ]) {
      const { service, tx } = makeService({
        ...orderAt(OrderStatus.PENDING),
        deliveredAt: null,
      });
      await service.forceStatusChange('o1', status, 'admin1');
      const data = (tx.order.update as jest.Mock).mock.calls[0][0].data;
      expect(data).toEqual({ status });
    }
  });

  // The whole point of the escape hatch: it repairs a status WITHOUT replaying
  // delivery. Stamping the date must not have quietly turned it into a second
  // markDelivered() that double-books money and stock.
  it('runs NO delivery side effects — no earning, stock, payment or notification', async () => {
    const { service, tx, earningsService, paymentsService, notificationService } =
      makeService({ ...orderAt(OrderStatus.PROCESSING), deliveredAt: null });

    await service.forceStatusChange('o1', OrderStatus.DELIVERED, 'admin1');

    expect(earningsService.createEarning).not.toHaveBeenCalled();
    expect(paymentsService.completeCodTransaction).not.toHaveBeenCalled();
    expect(notificationService.notifyOrderDelivered).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    // paymentStatus is deliberately NOT flipped: no cash was collected here.
    expect(
      (tx.order.update as jest.Mock).mock.calls[0][0].data.paymentStatus,
    ).toBeUndefined();
  });

  it('still writes the audit log for a forced delivery', async () => {
    const { service, tx } = makeService({
      ...orderAt(OrderStatus.PENDING),
      deliveredAt: null,
    });
    await service.forceStatusChange('o1', OrderStatus.DELIVERED, 'admin1', 'note');
    expect(tx.orderStatusLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: OrderStatus.PENDING,
        toStatus: OrderStatus.DELIVERED,
        changedBy: 'admin1',
        note: 'note',
      }),
    });
  });

  it('still refuses a no-op transition', async () => {
    const { service } = makeService({
      ...orderAt(OrderStatus.DELIVERED),
      deliveredAt: null,
    });
    await expect(
      service.forceStatusChange('o1', OrderStatus.DELIVERED, 'admin1'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('AdminOrdersService.markDelivered — the normal path is unchanged', () => {
  it('stamps deliveredAt and runs the full delivery side effects', async () => {
    const { service, tx, earningsService, paymentsService, notificationService } =
      makeService(orderAt(OrderStatus.OUT_FOR_DELIVERY));

    await service.markDelivered('o1', 'admin1');

    const data = (tx.order.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe(OrderStatus.DELIVERED);
    expect(data.deliveredAt).toBeInstanceOf(Date);
    // COD cash is collected at the door, so payment completes here.
    expect(data.paymentStatus).toBe(PaymentStatus.COMPLETED);
    expect(tx.product.update).toHaveBeenCalled();
    expect(earningsService.createEarning).toHaveBeenCalled();
    expect(paymentsService.completeCodTransaction).toHaveBeenCalled();
    expect(notificationService.notifyOrderDelivered).toHaveBeenCalled();
  });
});
