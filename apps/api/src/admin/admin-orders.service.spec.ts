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
