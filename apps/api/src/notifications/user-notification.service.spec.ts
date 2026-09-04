import { UserNotificationService } from './user-notification.service';

function makePrisma() {
  return {
    userNotification: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  } as any;
}

function makeService(prisma: any) {
  return new UserNotificationService(prisma);
}

describe('UserNotificationService — per-user scoping (security)', () => {
  it('create persists the row for the given user', async () => {
    const prisma = makePrisma();
    await makeService(prisma).create({
      userId: 'u1',
      type: 'PRODUCT_APPROVED',
      title: 'T',
      body: 'B',
      entityType: 'product',
      entityId: 'p1',
    });
    expect(prisma.userNotification.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        type: 'PRODUCT_APPROVED',
        title: 'T',
        body: 'B',
        entityType: 'product',
        entityId: 'p1',
      },
    });
  });

  it('create never throws (fire-and-forget)', async () => {
    const prisma = makePrisma();
    prisma.userNotification.create.mockRejectedValue(new Error('db down'));
    await expect(
      makeService(prisma).create({
        userId: 'u1',
        type: 'PRODUCT_APPROVED',
        title: 'T',
        body: 'B',
      }),
    ).resolves.toBeUndefined();
  });

  it('list scopes findMany + counts to the userId', async () => {
    const prisma = makePrisma();
    await makeService(prisma).list('u1', { page: 1, limit: 20 });
    expect(prisma.userNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    // total + unread counts both scoped to the user
    expect(prisma.userNotification.count).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
    expect(prisma.userNotification.count).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
    });
  });

  it('unreadCount counts only the user’s unread rows', async () => {
    const prisma = makePrisma();
    prisma.userNotification.count.mockResolvedValue(3);
    const res = await makeService(prisma).unreadCount('u1');
    expect(prisma.userNotification.count).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
    });
    expect(res.data.unread).toBe(3);
  });

  it('markRead is ownership-scoped: WHERE includes userId (no cross-account write)', async () => {
    const prisma = makePrisma();
    await makeService(prisma).markRead('u1', 'n1');
    expect(prisma.userNotification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('markAllRead is scoped to the user', async () => {
    const prisma = makePrisma();
    await makeService(prisma).markAllRead('u1');
    expect(prisma.userNotification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe('UserNotificationService.createIfAbsent — effectively-once feed rows', () => {
  const input = {
    userId: 'u1',
    type: 'PAYOUT' as const,
    title: 'Paiement effectué',
    body: 'Votre demande de paiement de 63.000 FC a été marquée comme payée.',
    entityType: 'payout',
    entityId: 'pay1',
  };
  function make(existing: unknown) {
    const prisma = {
      userNotification: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    return { prisma, service: new UserNotificationService(prisma as never) };
  }
  it('writes the row when none matches (user + type + entity + title)', async () => {
    const { prisma, service } = make(null);
    await expect(service.createIfAbsent(input)).resolves.toBe(true);
    expect(prisma.userNotification.findFirst.mock.calls[0][0].where).toEqual({
      userId: 'u1', type: 'PAYOUT', entityType: 'payout', entityId: 'pay1', title: 'Paiement effectué',
    });
    expect(prisma.userNotification.create).toHaveBeenCalledTimes(1);
  });
  it('skips (no duplicate) when the same event was already recorded', async () => {
    const { prisma, service } = make({ id: 'n1' });
    await expect(service.createIfAbsent(input)).resolves.toBe(false);
    expect(prisma.userNotification.create).not.toHaveBeenCalled();
  });
  it('a different event on the same payout (approved → paid) is a new row', async () => {
    const { prisma, service } = make(null);
    await service.createIfAbsent({ ...input, title: 'Paiement approuvé' });
    expect(prisma.userNotification.findFirst.mock.calls[0][0].where.title).toBe('Paiement approuvé');
    expect(prisma.userNotification.create).toHaveBeenCalledTimes(1);
  });
  it('never throws on a DB error', async () => {
    const { prisma, service } = make(null);
    prisma.userNotification.create.mockRejectedValue(new Error('down'));
    await expect(service.createIfAbsent(input)).resolves.toBe(false);
  });
});
