import { UserNotificationType } from '@prisma/client';
import { OrderNotificationService } from './order-notification.service';

/**
 * Regression coverage for the buyer Notification Center fix: order-lifecycle
 * events must persist a buyer `UserNotification` feed row (not push/email only),
 * and that row must be written regardless of the buyer's notification prefs —
 * opt-outs gate delivery, never the persistent feed.
 */
describe('OrderNotificationService — buyer feed persistence', () => {
  let service: OrderNotificationService;
  let userNotifications: { create: jest.Mock };
  let pushService: { sendToUser: jest.Mock };
  let emailService: Record<string, jest.Mock>;
  let prefs: { shouldSendOrderUpdates: jest.Mock };

  // Pre-enriched order — has every relation enrichOrder() needs, so it's used
  // as-is without touching Prisma.
  const buildOrder = () => ({
    id: 'order-1',
    orderNumber: 'TK-0001',
    totalCDF: 10_000n,
    subtotalCDF: 9_000n,
    cancellationReason: null,
    buyer: {
      id: 'buyer-1',
      firstName: 'Amina',
      lastName: 'K',
      phone: '+243990000001',
      email: 'amina@example.cd',
    },
    seller: {
      id: 'seller-1',
      firstName: 'Boutique',
      lastName: 'X',
      phone: '+243990000002',
      email: 'seller@example.cd',
      sellerProfile: { businessName: 'Boutique X' },
    },
    deliveryAddress: { town: 'Lubumbashi', neighborhood: 'Kenya' },
    items: [{ id: 'i1', quantity: 1, productTitle: 'Article' }],
  });

  beforeEach(() => {
    userNotifications = { create: jest.fn().mockResolvedValue(undefined) };
    pushService = {
      sendToUser: jest.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
    };
    emailService = {
      sendSellerNewOrder: jest.fn().mockResolvedValue(undefined),
    };
    prefs = { shouldSendOrderUpdates: jest.fn().mockResolvedValue(true) };
    const config = { get: (_key: string, def: string) => def };

    service = new OrderNotificationService(
      {} as never, // prisma — unused for a pre-enriched order
      prefs as never,
      pushService as never,
      emailService as never,
      userNotifications as never,
      config as never,
    );
  });

  const buyerFeedCalls = () =>
    userNotifications.create.mock.calls
      .map((c) => c[0])
      .filter((n) => n.userId === 'buyer-1');

  it('persists a buyer feed row for every lifecycle event', async () => {
    const methods: Array<keyof OrderNotificationService> = [
      'notifyOrderPlaced',
      'notifyOrderConfirmed',
      'notifyOrderReadyForPickup',
      'notifyOrderReceivedAtTeka',
      'notifyOrderOutForDelivery',
      'notifyOrderShipped',
      'notifyOrderDelivered',
      'notifyOrderCancelled',
      'notifyReturnApproved',
      'notifyReturnRejected',
    ];

    for (const m of methods) {
      userNotifications.create.mockClear();
      await (service[m] as (o: unknown) => Promise<void>)(buildOrder());
      const buyerRows = buyerFeedCalls();
      expect(buyerRows).toHaveLength(1);
      expect(buyerRows[0]).toMatchObject({
        userId: 'buyer-1',
        type: UserNotificationType.ORDER,
        entityType: 'order',
        entityId: 'order-1',
      });
      expect(buyerRows[0].title).toBeTruthy();
      expect(buyerRows[0].body).toBeTruthy();
    }
  });

  it('writes the buyer feed row even when order-update prefs are OFF', async () => {
    prefs.shouldSendOrderUpdates.mockResolvedValue(false);

    await service.notifyOrderConfirmed(buildOrder());

    // Feed row persisted...
    expect(buyerFeedCalls()).toHaveLength(1);
    // ...but no push/email delivery attempted for the buyer.
    expect(pushService.sendToUser).not.toHaveBeenCalledWith(
      'buyer-1',
      expect.anything(),
    );
  });

  it('notifyOrderPlaced writes rows for both buyer and seller', async () => {
    await service.notifyOrderPlaced(buildOrder());
    const recipients = userNotifications.create.mock.calls.map(
      (c) => c[0].userId,
    );
    expect(recipients).toContain('buyer-1');
    expect(recipients).toContain('seller-1');
  });
});
