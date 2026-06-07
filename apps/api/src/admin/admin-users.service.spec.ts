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
