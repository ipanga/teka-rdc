import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';

const service = new PaymentsService({} as never);

function dbWith(flippedOrders: number) {
  return {
    order: { updateMany: jest.fn().mockResolvedValue({ count: flippedOrders }) },
    transaction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn().mockResolvedValue({}) },
  };
}

describe('PaymentsService — D7 (unpaid COD cancelled → payment FAILED)', () => {
  it('failUnpaidCodPayment flips only a COD order still PENDING (conditional on the row), then fails its COD transaction', async () => {
    const db = dbWith(1);
    await expect(service.failUnpaidCodPayment('o1', db as never)).resolves.toBe(true);
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', paymentMethod: PaymentMethod.COD, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.FAILED },
    });
    expect(db.transaction.updateMany).toHaveBeenCalledTimes(1);
  });

  it('a payment already COMPLETED / REFUNDED / FAILED, or non-COD, matches no row → nothing else touched, no event', async () => {
    const db = dbWith(0);
    await expect(service.failUnpaidCodPayment('o1', db as never)).resolves.toBe(false);
    expect(db.transaction.updateMany).not.toHaveBeenCalled();
  });

  it('createCodTransaction writes through the caller’s transaction with a collision-free reference', async () => {
    const db = dbWith(0);
    await service.createCodTransaction('5f1c2e3a-0000-4000-8000-000000000001', 1500000n, null, db as never);
    expect(db.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: '5f1c2e3a-0000-4000-8000-000000000001',
        status: PaymentStatus.PENDING,
        externalReference: 'COD-5f1c2e3a-0000-4000-8000-000000000001',
      }),
    });
  });

  it('failCodTransactionOnCancellation: the COD PAYMENT transaction PENDING/PROCESSING → FAILED (order_cancelled), conditional → idempotent', async () => {
    const db = { transaction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await expect(service.failCodTransactionOnCancellation('o1', db as never)).resolves.toBe(1);
    expect(db.transaction.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'o1', type: 'PAYMENT', provider: 'COD', status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] } },
      data: { status: PaymentStatus.FAILED, failureReason: 'order_cancelled' },
    });
    db.transaction.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.failCodTransactionOnCancellation('o1', db as never)).resolves.toBe(0);
  });
});
