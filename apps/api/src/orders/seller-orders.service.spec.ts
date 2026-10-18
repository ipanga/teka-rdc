import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { SellerOrdersService } from './seller-orders.service';

function makeService(order: Record<string, unknown> | null, flip = true) {
  const tx = {
    // Row lock + re-read inside the transaction (lockOrderForUpdate).
    $queryRaw: jest.fn().mockResolvedValue(order ? [{ id: 'o1' }] : []),
    orderStatusLog: { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
    orderItem: { findMany: jest.fn().mockResolvedValue([{ productId: 'p1', quantity: 1 }]) },
    product: { update: jest.fn().mockResolvedValue({}) },
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
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
  const notificationService = {
    notifyOrderCancelled: jest.fn().mockResolvedValue(undefined),
    notifyOrderConfirmed: jest.fn().mockResolvedValue(undefined),
  };
  const analytics = { capture: jest.fn() };
  const paymentsService = {
    failUnpaidCodPayment: jest.fn().mockResolvedValue(flip),
  };
  const service = new SellerOrdersService(prisma as never, notificationService as never, {} as never, analytics as never, paymentsService as never);
  return { service, tx, prisma, analytics, paymentsService };
}

const pendingCod = (paymentMethod: PaymentMethod = PaymentMethod.COD) => ({
  id: 'o1', buyerId: 'b1', sellerId: 's1', orderNumber: 'TK-1', status: OrderStatus.PENDING, deletedAt: null,
  paymentMethod, paymentStatus: PaymentStatus.PENDING,
});

describe('SellerOrdersService.rejectOrder — D7', () => {
  it('rejecting an unpaid COD order flips the payment in the same transaction and emits payment_failed once (actor seller)', async () => {
    const { service, tx, analytics, paymentsService } = makeService(pendingCod());
    await service.rejectOrder('s1', 'o1', 'Rupture de stock');
    expect(paymentsService.failUnpaidCodPayment).toHaveBeenCalledWith('o1', tx);
    expect(tx.orderStatusLog.create).toHaveBeenCalledTimes(1);
    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(tx.order.update.mock.calls[0][0].data).toMatchObject({ status: OrderStatus.CANCELLED, cancellationReason: 'Rupture de stock', cancelledBy: 's1' });
    const events = analytics.capture.mock.calls.map((c) => c[1]);
    expect(events.filter((e) => e === 'payment_failed')).toHaveLength(1);
    const pf = analytics.capture.mock.calls.find((c) => c[1] === 'payment_failed')!;
    expect(pf[0]).toBe('b1'); // distinctId = the buyer whose payment will never occur
    expect(pf[2]).toMatchObject({ method: 'COD', reason: 'order_cancelled', actor: 'seller' });
  });

  it('a non-COD order rejected → no payment flip, no payment_failed', async () => {
    const { service, analytics, tx, paymentsService } = makeService(pendingCod(PaymentMethod.MOBILE_MONEY), false);
    await service.rejectOrder('s1', 'o1', 'Indisponible');
    expect(analytics.capture.mock.calls.map((c) => c[1])).not.toContain('payment_failed');
    expect(paymentsService.failUnpaidCodPayment).toHaveBeenCalledWith('o1', tx);
    expect(tx.order.update.mock.calls[0][0].data).not.toHaveProperty('paymentStatus');
  });

  it('a paid order cannot be rejected → 400 before any write', async () => {
    const { service, prisma } = makeService({ ...pendingCod(), paymentStatus: PaymentStatus.COMPLETED }, false);
    await expect(service.rejectOrder('s1', 'o1', 'x')).rejects.toThrow('encaissée');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('re-validated on the locked row: an order confirmed meanwhile can no longer be rejected', async () => {
    const { service, tx } = makeService(pendingCod());
    tx.order.findUnique.mockResolvedValue({ ...pendingCod(), status: OrderStatus.CONFIRMED });
    await expect(service.rejectOrder('s1', 'o1', 'x')).rejects.toThrow('Transition de statut invalide');
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});

describe('SellerOrdersService fulfillment — cannot overwrite a cancellation', () => {
  it('confirm on a stale PENDING pre-read fails once the locked row says CANCELLED; nothing written', async () => {
    const { service, tx, analytics } = makeService({ ...pendingCod() });
    tx.order.findUnique.mockResolvedValue({ ...pendingCod(), status: OrderStatus.CANCELLED });
    await expect(service.confirmOrder('s1', 'o1')).rejects.toThrow('Transition de statut invalide');
    expect(tx.orderStatusLog.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(analytics.capture).not.toHaveBeenCalled();
  });

  it('confirm on a still-PENDING locked row logs the real from-status and moves it', async () => {
    const { service, tx } = makeService({ ...pendingCod() });
    await service.confirmOrder('s1', 'o1');
    expect(tx.orderStatusLog.create.mock.calls[0][0].data).toMatchObject({ fromStatus: OrderStatus.PENDING, toStatus: OrderStatus.CONFIRMED });
    expect(tx.order.update.mock.calls[0][0].data).toEqual({ status: OrderStatus.CONFIRMED });
  });
});
