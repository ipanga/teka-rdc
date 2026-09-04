import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';

const service = new PaymentsService({} as never);
const cod = (paymentStatus: PaymentStatus, paymentMethod: PaymentMethod = PaymentMethod.COD) => ({
  paymentMethod,
  paymentStatus,
});

describe('PaymentsService — D7 (unpaid COD cancelled → payment FAILED)', () => {
  it('an unpaid COD order will fail: the cancelling update gets { paymentStatus: FAILED }', () => {
    expect(service.codPaymentWillFail(cod(PaymentStatus.PENDING))).toBe(true);
    expect(service.codPaymentFailureData(cod(PaymentStatus.PENDING))).toEqual({ paymentStatus: PaymentStatus.FAILED });
  });

  it('a payment already COMPLETED, REFUNDED or FAILED is never touched (no refund, no flip)', () => {
    for (const st of [PaymentStatus.COMPLETED, PaymentStatus.REFUNDED, PaymentStatus.FAILED]) {
      expect(service.codPaymentWillFail(cod(st))).toBe(false);
      expect(service.codPaymentFailureData(cod(st))).toEqual({});
    }
  });

  it('non-COD orders are out of scope', () => {
    expect(service.codPaymentWillFail(cod(PaymentStatus.PENDING, PaymentMethod.MOBILE_MONEY))).toBe(false);
    expect(service.codPaymentFailureData(cod(PaymentStatus.PENDING, PaymentMethod.MOBILE_MONEY))).toEqual({});
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
