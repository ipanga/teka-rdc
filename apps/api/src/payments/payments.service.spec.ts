import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';

function makeDb(orderFlipCount = 1) {
  return {
    order: { updateMany: jest.fn().mockResolvedValue({ count: orderFlipCount }) },
    transaction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}
const service = new PaymentsService({} as never);

describe('PaymentsService.failCodPaymentOnCancellation (D7)', () => {
  it('unpaid COD order → order PENDING→FAILED and its COD PAYMENT transaction → FAILED (order_cancelled), in the given transaction', async () => {
    const db = makeDb();
    const res = await service.failCodPaymentOnCancellation(
      { id: 'o1', paymentMethod: PaymentMethod.COD, paymentStatus: PaymentStatus.PENDING },
      db as never,
    );
    expect(res).toBe(true);
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.FAILED },
    });
    expect(db.transaction.updateMany).toHaveBeenCalledWith({
      where: {
        orderId: 'o1',
        type: 'PAYMENT',
        provider: 'COD',
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
      },
      data: { status: PaymentStatus.FAILED, failureReason: 'order_cancelled' },
    });
  });

  it('a payment already COMPLETED, REFUNDED or FAILED is never touched, and no refund is created', async () => {
    for (const st of [PaymentStatus.COMPLETED, PaymentStatus.REFUNDED, PaymentStatus.FAILED]) {
      const db = makeDb();
      const res = await service.failCodPaymentOnCancellation(
        { id: 'o1', paymentMethod: PaymentMethod.COD, paymentStatus: st },
        db as never,
      );
      expect(res).toBe(false);
      expect(db.order.updateMany).not.toHaveBeenCalled();
      expect(db.transaction.updateMany).not.toHaveBeenCalled();
    }
  });

  it('non-COD orders are out of scope', async () => {
    const db = makeDb();
    const res = await service.failCodPaymentOnCancellation(
      { id: 'o1', paymentMethod: PaymentMethod.MOBILE_MONEY, paymentStatus: PaymentStatus.PENDING },
      db as never,
    );
    expect(res).toBe(false);
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('idempotent: a concurrent flip (conditional update count 0) reports no flip and leaves the transaction alone', async () => {
    const db = makeDb(0);
    const res = await service.failCodPaymentOnCancellation(
      { id: 'o1', paymentMethod: PaymentMethod.COD, paymentStatus: PaymentStatus.PENDING },
      db as never,
    );
    expect(res).toBe(false);
    expect(db.transaction.updateMany).not.toHaveBeenCalled();
  });
});
