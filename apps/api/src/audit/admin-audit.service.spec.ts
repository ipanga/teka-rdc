import { Prisma } from '@prisma/client';
import { AdminAuditService } from './admin-audit.service';

describe('AdminAuditService', () => {
  it('writes the row on the transaction client it is given, stringifying BigInt', async () => {
    const tx = { adminAuditLog: { create: jest.fn().mockResolvedValue({}) } };
    const service = new AdminAuditService({} as never);
    await service.record(tx as never, {
      actorId: 'admin1',
      action: 'PAYOUT_COMPLETED',
      entityType: 'payout',
      entityId: 'p1',
      before: { status: 'PROCESSING', amountCDF: 700000n },
      after: { status: 'COMPLETED', amountCDF: 700000n },
      reason: 'MPESA-1',
    });
    const data = tx.adminAuditLog.create.mock.calls[0][0].data;
    expect(data.actorId).toBe('admin1');
    expect(data.before).toEqual({ status: 'PROCESSING', amountCDF: '700000' });
    expect(data.after).toEqual({ status: 'COMPLETED', amountCDF: '700000' });
    expect(data.reason).toBe('MPESA-1');
  });

  it('stores JsonNull (not undefined) for absent before/after', async () => {
    const tx = { adminAuditLog: { create: jest.fn().mockResolvedValue({}) } };
    const service = new AdminAuditService({} as never);
    await service.record(tx as never, {
      actorId: 'a',
      action: 'COMMISSION_SETTING_REMOVED',
      entityType: 'commission_setting',
      entityId: 'c1',
      before: { rate: '0.1' },
    });
    const data = tx.adminAuditLog.create.mock.calls[0][0].data;
    expect(data.after).toBe(Prisma.JsonNull);
    expect(data.reason).toBeNull();
  });
});
