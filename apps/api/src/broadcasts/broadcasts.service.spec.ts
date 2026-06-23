import { BadRequestException } from '@nestjs/common';
import { BroadcastsService } from './broadcasts.service';

function makeService(over: Record<string, any> = {}) {
  const prisma = {
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'prod1' }) },
    user: {
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([]),
    },
    notificationBroadcast: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 'b1', ...data })),
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 'b1', ...data })),
    },
    userNotification: { createMany: jest.fn() },
    ...over,
  };
  const push = { sendToUser: jest.fn() };
  const email = { sendBroadcast: jest.fn() };
  const prefs = {
    shouldSendPushBroadcasts: jest.fn().mockResolvedValue(true),
    shouldSendEmailBroadcasts: jest.fn().mockResolvedValue(true),
  };
  const analytics = { capture: jest.fn() };
  const service = new BroadcastsService(
    prisma as never,
    push as never,
    email as never,
    prefs as never,
    analytics as never,
  );
  return { service, prisma, analytics };
}

const baseDto = {
  title: 'Promo',
  message: 'Profitez de -20% cette semaine',
  segment: 'ALL_BUYERS' as const,
};

describe('BroadcastsService.create — product + recipients validation', () => {
  it('persists a plain broadcast (no product, no recipients)', async () => {
    const { service, prisma } = makeService();
    await service.create(baseDto as never, 'admin1');
    const data = prisma.notificationBroadcast.create.mock.calls[0][0].data;
    expect(data.productId).toBeNull();
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an unknown / inactive linked product (400)', async () => {
    const { service, prisma } = makeService({
      product: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.create({ ...baseDto, productId: 'ghost' } as never, 'admin1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.notificationBroadcast.create).not.toHaveBeenCalled();
  });

  it('persists a valid linked product (becomes a product promo)', async () => {
    const { service, prisma } = makeService();
    await service.create(
      { ...baseDto, productId: 'prod1' } as never,
      'admin1',
    );
    expect(
      prisma.notificationBroadcast.create.mock.calls[0][0].data.productId,
    ).toBe('prod1');
  });

  it('rejects recipientIds when any is not an active buyer (400)', async () => {
    const { service } = makeService({
      // 2 requested, only 1 valid
      user: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn() },
    });
    await expect(
      service.create(
        { ...baseDto, recipientIds: ['u1', 'u2'] } as never,
        'admin1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists deduped recipientIds when all are valid buyers', async () => {
    const { service, prisma } = makeService({
      user: { count: jest.fn().mockResolvedValue(2), findMany: jest.fn() },
    });
    await service.create(
      { ...baseDto, recipientIds: ['u1', 'u2', 'u1'] } as never,
      'admin1',
    );
    expect(
      prisma.notificationBroadcast.create.mock.calls[0][0].data.recipientIds,
    ).toEqual(['u1', 'u2']);
  });
});

describe('BroadcastsService.send — audience resolution', () => {
  it('targets explicit recipientIds when present (transitions to SENDING)', async () => {
    const { service, prisma } = makeService();
    prisma.notificationBroadcast.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'DRAFT',
      title: 'Promo',
      message: 'msg',
      segment: 'ALL_BUYERS',
      productId: null,
      recipientIds: ['u1', 'u2'],
      channels: null,
    });
    await service.send('b1');
    // audience count uses the id-in filter
    const countWhere = prisma.user.count.mock.calls.at(-1)?.[0]?.where;
    expect(countWhere.id).toEqual({ in: ['u1', 'u2'] });
    const updateData = prisma.notificationBroadcast.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('SENDING');
  });

  it('rejects sending a non-DRAFT broadcast (400)', async () => {
    const { service, prisma } = makeService();
    prisma.notificationBroadcast.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'SENT',
      recipientIds: null,
    });
    await expect(service.send('b1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
