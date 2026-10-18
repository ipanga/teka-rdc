import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderStatus, ReturnStatus } from '@prisma/client';
import { ReturnsService } from './returns.service';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function makeService(opts: {
  order?: Record<string, unknown> | null;
  activeReturn?: unknown;
  pendingReturn?: Record<string, unknown> | null;
}) {
  const tx = {
    returnRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    // Row lock + re-read of the order inside the transaction.
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'o1' }]),
    orderStatusLog: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    order: {
      findUnique: jest.fn().mockResolvedValue({ id: 'o1', status: OrderStatus.DELIVERED }),
      update: jest.fn().mockResolvedValue({}),
    },
    orderItem: {
      findMany: jest.fn().mockResolvedValue([{ productId: 'p1', quantity: 3 }]),
    },
    product: { update: jest.fn().mockResolvedValue({}) },
    transaction: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(opts.order ?? null) },
    returnRequest: {
      findFirst: jest.fn().mockResolvedValue(opts.activeReturn ?? null),
      findUnique: jest.fn().mockResolvedValue(opts.pendingReturn ?? null),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'r1', status: ReturnStatus.REJECTED }),
    },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const earningsService = {
    reverseEarning: jest
      .fn()
      .mockResolvedValue({ reversed: true, inPayout: false }),
  };
  const notificationService = {
    notifyReturnRequested: jest.fn().mockResolvedValue(undefined),
    notifyReturnApproved: jest.fn().mockResolvedValue(undefined),
    notifyReturnRejected: jest.fn().mockResolvedValue(undefined),
  };
  const analytics = { capture: jest.fn() };
  const service = new ReturnsService(
    prisma as never,
    earningsService as never,
    notificationService as never,
    analytics as never,
  );
  return { service, prisma, tx, earningsService, notificationService };
}

describe('ReturnsService.createReturnRequest', () => {
  const base = {
    id: 'o1',
    buyerId: 'b1',
    status: OrderStatus.DELIVERED,
    deliveredAt: daysAgo(1),
  };

  it('creates a request for a delivered order within the window', async () => {
    const { service, prisma } = makeService({ order: base });
    await service.createReturnRequest('b1', 'o1', '  abîmé  ');
    expect(prisma.returnRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'o1', reason: 'abîmé' }),
      }),
    );
  });

  it('blocks a non-owner (IDOR)', async () => {
    const { service } = makeService({ order: base });
    await expect(
      service.createReturnRequest('other', 'o1', 'x'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks when not delivered', async () => {
    const { service } = makeService({
      order: { ...base, status: OrderStatus.OUT_FOR_DELIVERY },
    });
    await expect(service.createReturnRequest('b1', 'o1', 'x')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('blocks after the return window', async () => {
    const { service } = makeService({
      order: { ...base, deliveredAt: daysAgo(5) },
    });
    await expect(service.createReturnRequest('b1', 'o1', 'x')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('blocks a second active request', async () => {
    const { service } = makeService({
      order: base,
      activeReturn: { id: 'r0' },
    });
    await expect(service.createReturnRequest('b1', 'o1', 'x')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('ReturnsService.approveReturn', () => {
  const pending = {
    id: 'r1',
    status: ReturnStatus.REQUESTED,
    deletedAt: null,
    order: {
      id: 'o1',
      orderNumber: 'TK-1',
      status: OrderStatus.DELIVERED,
      totalCDF: 5000000n,
    },
  };

  it('flips order to RETURNED, restocks, reverses earning, records a refund', async () => {
    const { service, tx, earningsService } = makeService({
      pendingReturn: pending,
    });
    await service.approveReturn('r1', 'admin1', 'ok');

    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OrderStatus.RETURNED }),
      }),
    );
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { increment: 3 } } }),
    );
    expect(earningsService.reverseEarning).toHaveBeenCalledWith(
      'o1',
      tx,
      'RETURN_APPROVED',
    );
    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'REFUND', amountCDF: 5000000n }),
      }),
    );
  });

  it('rejects an already-processed return', async () => {
    const { service } = makeService({
      pendingReturn: { ...pending, status: ReturnStatus.APPROVED },
    });
    await expect(service.approveReturn('r1', 'admin1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('a concurrent review that claimed the request first wins: nothing restocked, no refund', async () => {
    const { service, tx } = makeService({ pendingReturn: pending });
    tx.returnRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approveReturn('r1', 'admin1')).rejects.toThrow(
      'déjà été traitée',
    );
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('re-checks the locked order: one forced out of DELIVERED meanwhile is not returned', async () => {
    const { service, tx } = makeService({ pendingReturn: pending });
    tx.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.RETURNED });
    await expect(service.approveReturn('r1', 'admin1')).rejects.toThrow('livrée');
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('an order whose history already shows a release is returned without restocking twice', async () => {
    const { service, tx } = makeService({ pendingReturn: pending });
    tx.orderStatusLog.count.mockResolvedValue(1);
    await service.approveReturn('r1', 'admin1');
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    expect(tx.transaction.create).toHaveBeenCalledTimes(1); // refund still recorded
  });
});

describe('ReturnsService.rejectReturn', () => {
  it('marks the request REJECTED', async () => {
    const { service, prisma } = makeService({
      pendingReturn: {
        id: 'r1',
        status: ReturnStatus.REQUESTED,
        deletedAt: null,
        order: { id: 'o1', status: OrderStatus.DELIVERED },
      },
    });
    await service.rejectReturn('r1', 'admin1', 'non justifié');
    expect(prisma.returnRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ReturnStatus.REQUESTED }),
        data: expect.objectContaining({ status: ReturnStatus.REJECTED }),
      }),
    );
  });

  it('cannot overwrite a concurrent approval', async () => {
    const { service, prisma } = makeService({
      pendingReturn: {
        id: 'r1',
        status: ReturnStatus.REQUESTED,
        deletedAt: null,
        order: { id: 'o1', status: OrderStatus.DELIVERED },
      },
    });
    prisma.returnRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.rejectReturn('r1', 'admin1')).rejects.toThrow(
      'déjà été traitée',
    );
  });
});
