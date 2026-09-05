import { AdminUsersService } from './admin-users.service';

// Flush pending microtasks/macrotasks so the fire-and-forget
// notifyApplicationDecision (void, not awaited) completes before assertions.
const flush = () => new Promise((resolve) => setImmediate(resolve));

function makeService() {
  const tx = {
    sellerProfile: { update: jest.fn().mockResolvedValue({ id: 'app1' }) },
    user: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    sellerProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'app1',
        userId: 'user1',
        applicationStatus: 'PENDING',
      }),
      update: jest.fn().mockResolvedValue({
        id: 'app1',
        userId: 'user1',
        rejectionReason: 'Document illisible',
      }),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ email: 'vendeur@example.cd', firstName: 'Jean' }),
    },
    $transaction: jest
      .fn()
      .mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const analytics = { capture: jest.fn() };
  const email = {
    sendSellerApplicationApproved: jest.fn().mockResolvedValue(true),
    sendSellerApplicationRejected: jest.fn().mockResolvedValue(true),
  };
  const sellerNotifications = {
    notifyApplicationApproved: jest.fn().mockResolvedValue(undefined),
    notifyApplicationRejected: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AdminUsersService(
    prisma as never,
    analytics as never,
    email as never,
    sellerNotifications as never,
    {} as never,
    { get: jest.fn().mockReturnValue(120) } as never,
    { record: jest.fn() } as never,
  );
  return { service, prisma, email, sellerNotifications };
}

describe('AdminUsersService.reviewSellerApplication notifications', () => {
  it('on APPROVE sends the approved email + push to the seller', async () => {
    const { service, email, sellerNotifications } = makeService();

    await service.reviewSellerApplication('app1', 'admin1', {
      decision: 'APPROVE',
    });
    await flush();

    expect(sellerNotifications.notifyApplicationApproved).toHaveBeenCalledWith(
      'user1',
    );
    expect(email.sendSellerApplicationApproved).toHaveBeenCalledWith(
      'vendeur@example.cd',
      'Jean',
    );
    expect(
      sellerNotifications.notifyApplicationRejected,
    ).not.toHaveBeenCalled();
  });

  it('on REJECT sends the rejected email + push with the reason', async () => {
    const { service, email, sellerNotifications } = makeService();

    await service.reviewSellerApplication('app1', 'admin1', {
      decision: 'REJECT',
      reason: 'Document illisible',
    });
    await flush();

    expect(sellerNotifications.notifyApplicationRejected).toHaveBeenCalledWith(
      'user1',
      'Document illisible',
    );
    expect(email.sendSellerApplicationRejected).toHaveBeenCalledWith(
      'vendeur@example.cd',
      'Jean',
      'Document illisible',
    );
    expect(
      sellerNotifications.notifyApplicationApproved,
    ).not.toHaveBeenCalled();
  });
});

describe('AdminUsersService.findAllUsers — seller phone (QA-4)', () => {
  function makeListService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { user: { findMany, count } };
    const service = new AdminUsersService(
      prisma as never,
      { capture: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(120) } as never,
      { record: jest.fn() } as never,
    );
    return { service, findMany };
  }

  it('selects SellerProfile.phone so the admin list can render it', async () => {
    const { service, findMany } = makeListService();
    await service.findAllUsers({ role: 'SELLER' } as never);
    const calls = findMany.mock.calls as unknown as FindManyArg[][];
    const arg = calls[0][0];
    expect(arg.select.sellerProfile.select.phone).toBe(true);
  });

  it('search matches SellerProfile phone + businessName, not just User fields', async () => {
    const { service, findMany } = makeListService();
    await service.findAllUsers({ search: '0991427171' } as never);
    const calls = findMany.mock.calls as unknown as FindManyArg[][];
    const arg = calls[0][0];
    const or = arg.where.OR ?? [];
    expect(or).toEqual(
      expect.arrayContaining([
        { sellerProfile: { phone: { contains: '0991427171' } } },
      ]),
    );
    expect(or.some((c) => c.sellerProfile?.businessName !== undefined)).toBe(
      true,
    );
  });
});

describe('AdminUsersService.getApplicationDocumentUrl (KYC, P2a)', () => {
  function make(profile: { idDocumentCloudinaryId: string | null } | null) {
    const prisma = {
      sellerProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
    };
    const cloudinary = {
      getPrivateAssetFormat: jest.fn().mockResolvedValue('jpg'),
      getPrivateDownloadUrl: jest
        .fn()
        .mockReturnValue('https://api.cloudinary.example/download?sig=x'),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminUsersService(
      prisma as never,
      { capture: jest.fn() } as never,
      {} as never,
      {} as never,
      cloudinary as never,
      { get: jest.fn().mockReturnValue(120) } as never,
      audit as never,
    );
    return { service, cloudinary, audit };
  }

  it('returns an expiry-enforced private download link and audits the view (PR 2)', async () => {
    const { service, cloudinary, audit } = make({
      idDocumentCloudinaryId: 'teka-rdc/seller-documents/x',
    });
    const res = await service.getApplicationDocumentUrl('app1', 'admin-1');
    expect(cloudinary.getPrivateDownloadUrl).toHaveBeenCalledWith(
      'teka-rdc/seller-documents/x',
      { resourceType: 'image', format: 'jpg', expiresInSeconds: 120 },
    );
    expect(res).toEqual({
      url: 'https://api.cloudinary.example/download?sig=x',
      expiresInSeconds: 120,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'SELLER_DOCUMENT_VIEWED',
        entityType: 'seller_profile',
        entityId: 'app1',
      }),
    );
  });

  it('404s when the application has no document', async () => {
    const { service, audit } = make({ idDocumentCloudinaryId: null });
    await expect(
      service.getApplicationDocumentUrl('app1', 'admin-1'),
    ).rejects.toThrow();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('404s when the application does not exist', async () => {
    const { service } = make(null);
    await expect(
      service.getApplicationDocumentUrl('nope', 'admin-1'),
    ).rejects.toThrow();
  });
});

interface OrClause {
  sellerProfile?: {
    phone?: { contains: string };
    businessName?: { contains: string };
  };
}
interface FindManyArg {
  select: { sellerProfile: { select: Record<string, boolean> } };
  where: { OR?: OrClause[] };
}
