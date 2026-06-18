import { SellerNotificationService } from './seller-notification.service';

function deps(over: { pushSucceeded?: number } = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'seller1',
        email: 'seller@test.cd',
        firstName: 'Sam',
      }),
    },
  } as any;
  const notificationPrefs = {
    shouldSendOrderUpdates: jest.fn().mockResolvedValue(true),
  } as any;
  const pushService = {
    sendToUser: jest
      .fn()
      .mockResolvedValue({ succeeded: over.pushSucceeded ?? 1 }),
  } as any;
  const emailService = {
    sendProductApproved: jest.fn().mockResolvedValue(true),
    sendProductRejected: jest.fn().mockResolvedValue(true),
  } as any;
  const userNotifications = { create: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new SellerNotificationService(
    prisma,
    notificationPrefs,
    pushService,
    emailService,
    userNotifications,
  );
  return { service, prisma, pushService, emailService, userNotifications };
}

const PRODUCT = { id: 'p1', sellerId: 'seller1', title: 'Samsung Galaxy S24' };

describe('SellerNotificationService — product approval/rejection', () => {
  it('approval: writes an in-app PRODUCT_APPROVED row + pushes (no email when push lands)', async () => {
    const d = deps({ pushSucceeded: 1 });
    await d.service.notifyProductApproved(PRODUCT);

    expect(d.userNotifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'seller1',
        type: 'PRODUCT_APPROVED',
        entityType: 'product',
        entityId: 'p1',
      }),
    );
    expect(d.pushService.sendToUser).toHaveBeenCalledWith(
      'seller1',
      expect.objectContaining({
        data: expect.objectContaining({ event: 'product-approved' }),
      }),
    );
    // push succeeded → email fallback NOT used
    expect(d.emailService.sendProductApproved).not.toHaveBeenCalled();
  });

  it('approval: falls back to email when the seller has no active push device', async () => {
    const d = deps({ pushSucceeded: 0 });
    await d.service.notifyProductApproved(PRODUCT);
    expect(d.emailService.sendProductApproved).toHaveBeenCalledWith(
      'seller@test.cd',
      'Sam',
      'Samsung Galaxy S24',
    );
  });

  it('rejection: writes PRODUCT_REJECTED + email fallback carries the FULL reason', async () => {
    const d = deps({ pushSucceeded: 0 });
    const longReason = 'x'.repeat(300);
    await d.service.notifyProductRejected(PRODUCT, longReason);

    expect(d.userNotifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PRODUCT_REJECTED', entityId: 'p1' }),
    );
    // email gets the full (untruncated) reason
    expect(d.emailService.sendProductRejected).toHaveBeenCalledWith(
      'seller@test.cd',
      'Sam',
      'Samsung Galaxy S24',
      longReason,
    );
  });

  it('never throws even if the in-app write fails', async () => {
    const d = deps();
    d.userNotifications.create.mockRejectedValue(new Error('db down'));
    await expect(d.service.notifyProductApproved(PRODUCT)).resolves.toBeUndefined();
  });
});
