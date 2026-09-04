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

// ---------------------------------------------------------------------------
// Payout lifecycle (PR 6) — feed row + push + email fallback, no PII in data
// ---------------------------------------------------------------------------

function payoutDeps(over: { pushSucceeded?: number; pushThrows?: boolean; payout?: unknown } = {}) {
  const payout =
    over.payout === undefined
      ? {
          amountCDF: BigInt(90000000),
          externalReference: 'MPESA-123',
          rejectionReason: 'Numéro Mobile Money invalide',
          sellerProfile: { user: { id: 'seller1', email: 'seller@test.cd', firstName: 'Sam' } },
        }
      : over.payout;
  const prisma = { payout: { findUnique: jest.fn().mockResolvedValue(payout) } } as any;
  const pushService = {
    sendToUser: over.pushThrows
      ? jest.fn().mockRejectedValue(new Error('FCM down'))
      : jest.fn().mockResolvedValue({ succeeded: over.pushSucceeded ?? 1 }),
  } as any;
  const emailService = {
    sendPayoutApproved: jest.fn().mockResolvedValue(true),
    sendPayoutPaid: jest.fn().mockResolvedValue(true),
    sendPayoutRejected: jest.fn().mockResolvedValue(true),
  } as any;
  const userNotifications = { createIfAbsent: jest.fn().mockResolvedValue(true) } as any;
  const service = new SellerNotificationService(prisma, {} as any, pushService, emailService, userNotifications);
  return { service, prisma, pushService, emailService, userNotifications };
}

describe('SellerNotificationService — payout notifications', () => {
  it('paid: durable PAYOUT feed row to the OWNER, French copy with the amount, push data = routing keys only', async () => {
    const d = payoutDeps();
    await d.service.notifyPayoutPaid('pay1');
    expect(d.userNotifications.createIfAbsent).toHaveBeenCalledWith({
      userId: 'seller1',
      type: 'PAYOUT',
      title: 'Paiement effectué',
      body: 'Votre demande de paiement de 900.000 FC a été marquée comme payée.',
      entityType: 'payout',
      entityId: 'pay1',
    });
    const push = d.pushService.sendToUser.mock.calls[0];
    expect(push[0]).toBe('seller1');
    expect(push[1].data).toEqual({ screen: 'earnings', event: 'payout-paid', payoutId: 'pay1' });
    // No destination phone / method / reference / email in the push payload.
    const serialized = JSON.stringify(push[1]);
    expect(serialized).not.toContain('MPESA-123');
    expect(serialized).not.toContain('seller@test.cd');
    expect(d.emailService.sendPayoutPaid).not.toHaveBeenCalled();
  });

  it('approved: informational — says the transfer is being prepared, never that money was sent', async () => {
    const d = payoutDeps();
    await d.service.notifyPayoutApproved('pay1');
    const row = d.userNotifications.createIfAbsent.mock.calls[0][0];
    expect(row.title).toBe('Paiement approuvé');
    expect(row.body).toContain('approuvée');
    expect(row.body.toLowerCase()).not.toContain('payée');
    expect(d.pushService.sendToUser.mock.calls[0][1].data.event).toBe('payout-approved');
  });

  it('rejected from REQUESTED/APPROVED: « Demande de paiement refusée » with the reason and the balance note', async () => {
    const d = payoutDeps();
    await d.service.notifyPayoutRejected('pay1');
    const row = d.userNotifications.createIfAbsent.mock.calls[0][0];
    expect(row.title).toBe('Demande de paiement refusée');
    expect(row.body).toContain('Raison : Numéro Mobile Money invalide');
    expect(row.body).toContain('de nouveau disponible');
    expect(d.pushService.sendToUser.mock.calls[0][1].data.event).toBe('payout-rejected');
  });

  it('rejected from PROCESSING: « Virement échoué » (failed transfer, not a refusal)', async () => {
    const d = payoutDeps();
    await d.service.notifyPayoutRejected('pay1', { failedTransfer: true });
    const row = d.userNotifications.createIfAbsent.mock.calls[0][0];
    expect(row.title).toBe('Virement échoué');
    expect(row.body).toContain('n’a pas pu être effectué');
    expect(d.pushService.sendToUser.mock.calls[0][1].data.event).toBe('payout-failed');
  });

  it('push reaches no device → email fallback carries the full reason / reference', async () => {
    const d = payoutDeps({ pushSucceeded: 0 });
    await d.service.notifyPayoutPaid('pay1');
    expect(d.emailService.sendPayoutPaid).toHaveBeenCalledWith('seller@test.cd', 'Sam', '900.000 FC', 'MPESA-123');
    await d.service.notifyPayoutRejected('pay1');
    expect(d.emailService.sendPayoutRejected).toHaveBeenCalledWith('seller@test.cd', 'Sam', '900.000 FC', 'Numéro Mobile Money invalide');
  });

  it('push infrastructure failure never throws and never loses the feed row', async () => {
    const d = payoutDeps({ pushThrows: true });
    await expect(d.service.notifyPayoutPaid('pay1')).resolves.toBeUndefined();
    expect(d.userNotifications.createIfAbsent).toHaveBeenCalledTimes(1);
    // Push threw → treated as "no device" → email fallback.
    expect(d.emailService.sendPayoutPaid).toHaveBeenCalledTimes(1);
  });

  it('unknown payout (deleted / no seller user) → nothing sent, no throw', async () => {
    const d = payoutDeps({ payout: null });
    await d.service.notifyPayoutPaid('nope');
    expect(d.userNotifications.createIfAbsent).not.toHaveBeenCalled();
    expect(d.pushService.sendToUser).not.toHaveBeenCalled();
  });

  it('a very long admin reason is truncated for the feed/push body but sent whole by email', async () => {
    const long = 'x'.repeat(200);
    const d = payoutDeps({
      pushSucceeded: 0,
      payout: {
        amountCDF: BigInt(500000),
        externalReference: null,
        rejectionReason: long,
        sellerProfile: { user: { id: 'seller1', email: 'seller@test.cd', firstName: null } },
      },
    });
    await d.service.notifyPayoutRejected('pay1');
    const row = d.userNotifications.createIfAbsent.mock.calls[0][0];
    expect(row.body).toContain('x'.repeat(137) + '…');
    expect(row.body).not.toContain('x'.repeat(138));
    expect(d.emailService.sendPayoutRejected.mock.calls[0][3]).toBe(long);
  });
});
