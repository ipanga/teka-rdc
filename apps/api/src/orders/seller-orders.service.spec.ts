import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { SellerOrdersService } from './seller-orders.service';

function makeService(order: Record<string, unknown> | null, flip = true) {
  const tx = {
    orderStatusLog: { create: jest.fn().mockResolvedValue({}) },
    orderItem: { findMany: jest.fn().mockResolvedValue([{ productId: 'p1', quantity: 1 }]) },
    product: { update: jest.fn().mockResolvedValue({}) },
    order: {
      update: jest.fn().mockResolvedValue({
        id: 'o1', buyerId: 'b1', sellerId: 's1', orderNumber: 'TK-1', status: OrderStatus.CANCELLED,
        paymentStatus: flip ? PaymentStatus.FAILED : PaymentStatus.PENDING, items: [], statusLogs: [],
      }),
    },
  };
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order), findFirst: jest.fn().mockResolvedValue(order) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const notificationService = { notifyOrderCancelled: jest.fn().mockResolvedValue(undefined) };
  const analytics = { capture: jest.fn() };
  const paymentsService = { failCodPaymentOnCancellation: jest.fn().mockResolvedValue(flip) };
  const service = new SellerOrdersService(prisma as never, notificationService as never, {} as never, analytics as never, paymentsService as never);
  return { service, tx, analytics, paymentsService };
}

const pendingCod = (paymentMethod: PaymentMethod = PaymentMethod.COD) => ({
  id: 'o1', buyerId: 'b1', sellerId: 's1', orderNumber: 'TK-1', status: OrderStatus.PENDING, deletedAt: null,
  paymentMethod, paymentStatus: PaymentStatus.PENDING,
});

describe('SellerOrdersService.rejectOrder — D7', () => {
  it('rejecting an unpaid COD order flips the payment in the same transaction and emits payment_failed once (actor seller)', async () => {
    const { service, tx, analytics, paymentsService } = makeService(pendingCod());
    await service.rejectOrder('s1', 'o1', 'Rupture de stock');
    expect(paymentsService.failCodPaymentOnCancellation).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), tx);
    expect(tx.orderStatusLog.create).toHaveBeenCalledTimes(1);
    expect(tx.order.update.mock.calls[0][0].data).toMatchObject({ status: OrderStatus.CANCELLED, cancellationReason: 'Rupture de stock' });
    const events = analytics.capture.mock.calls.map((c) => c[1]);
    expect(events.filter((e) => e === 'payment_failed')).toHaveLength(1);
    const pf = analytics.capture.mock.calls.find((c) => c[1] === 'payment_failed')!;
    expect(pf[0]).toBe('b1'); // distinctId = the buyer whose payment will never occur
    expect(pf[2]).toMatchObject({ method: 'COD', reason: 'order_cancelled', actor: 'seller' });
  });

  it('a non-COD order rejected → no payment flip, no payment_failed', async () => {
    const { service, analytics } = makeService(pendingCod(PaymentMethod.MOBILE_MONEY), false);
    await service.rejectOrder('s1', 'o1', 'Indisponible');
    expect(analytics.capture.mock.calls.map((c) => c[1])).not.toContain('payment_failed');
  });
});
