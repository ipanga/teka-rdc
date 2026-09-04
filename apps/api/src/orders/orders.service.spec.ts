import { BadRequestException } from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

function makeService(order: Record<string, unknown> | null, flip = true) {
  const tx = {
    orderStatusLog: { create: jest.fn().mockResolvedValue({}) },
    orderItem: { findMany: jest.fn().mockResolvedValue([{ productId: 'p1', quantity: 2 }]) },
    product: { update: jest.fn().mockResolvedValue({}) },
    order: {
      update: jest.fn().mockResolvedValue({
        id: 'o1', buyerId: 'b1', sellerId: 's1', status: OrderStatus.CANCELLED,
        paymentStatus: flip ? PaymentStatus.FAILED : PaymentStatus.PENDING, items: [], statusLogs: [],
      }),
    },
  };
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const notificationService = { notifyOrderCancelled: jest.fn().mockResolvedValue(undefined) };
  const analytics = { capture: jest.fn() };
  const paymentsService = {
    codPaymentWillFail: jest.fn().mockReturnValue(flip),
    codPaymentFailureData: jest.fn().mockReturnValue(flip ? { paymentStatus: PaymentStatus.FAILED } : {}),
    failCodTransactionOnCancellation: jest.fn().mockResolvedValue(1),
  };
  const service = new OrdersService(prisma as never, notificationService as never, analytics as never, paymentsService as never);
  return { service, prisma, tx, analytics, paymentsService };
}

const codPending = (status: OrderStatus = OrderStatus.PENDING) => ({
  id: 'o1', buyerId: 'b1', sellerId: 's1', status, deletedAt: null,
  paymentMethod: PaymentMethod.COD, paymentStatus: PaymentStatus.PENDING,
});

describe('OrdersService.cancelOrder (buyer) — D7', () => {
  it('unpaid COD: payment flipped inside the cancellation transaction, status log + stock restore kept, payment_failed emitted once', async () => {
    const { service, tx, analytics, paymentsService } = makeService(codPending());
    await service.cancelOrder('b1', 'o1', 'Changé d’avis');
    expect(paymentsService.failCodTransactionOnCancellation).toHaveBeenCalledWith('o1', tx);
    expect(tx.orderStatusLog.create).toHaveBeenCalledTimes(1);
    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(tx.order.update.mock.calls[0][0].data).toMatchObject({ status: OrderStatus.CANCELLED, cancellationReason: 'Changé d’avis', cancelledBy: 'b1', paymentStatus: PaymentStatus.FAILED });
    const events = analytics.capture.mock.calls.map((c) => c[1]);
    expect(events).toEqual(['order_cancelled', 'payment_failed']);
    expect(analytics.capture.mock.calls[1][2]).toMatchObject({ orderId: 'o1', method: 'COD', reason: 'order_cancelled', actor: 'buyer' });
  });

  it('no flip (payment not PENDING / not COD) → no payment_failed event', async () => {
    const { service, analytics, tx, paymentsService } = makeService({ ...codPending(), paymentStatus: PaymentStatus.COMPLETED }, false);
    await service.cancelOrder('b1', 'o1');
    expect(analytics.capture.mock.calls.map((c) => c[1])).toEqual(['order_cancelled']);
    expect(paymentsService.failCodTransactionOnCancellation).not.toHaveBeenCalled();
    expect(tx.order.update.mock.calls[0][0].data).not.toHaveProperty('paymentStatus');
  });

  it('a second cancellation is refused before any write (idempotent)', async () => {
    const { service, prisma, paymentsService } = makeService(codPending(OrderStatus.CANCELLED));
    await expect(service.cancelOrder('b1', 'o1')).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(paymentsService.failCodTransactionOnCancellation).not.toHaveBeenCalled();
  });

  it('after handover to Teka the buyer cannot cancel → nothing written', async () => {
    const { service, prisma } = makeService(codPending(OrderStatus.SHIPPED));
    await expect(service.cancelOrder('b1', 'o1')).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
