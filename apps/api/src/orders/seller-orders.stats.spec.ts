import { OrderStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { SellerOrdersService } from './seller-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderNotificationService } from '../notifications/order-notification.service';
import { EarningsService } from '../payments/earnings.service';
import { PostHogService } from '../analytics/posthog.service';
import { PaymentsService } from '../payments/payments.service';

describe('seller order statistics', () => {
  const groupBy = jest.fn();
  let service: SellerOrdersService;
  beforeEach(async () => {
    groupBy.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        SellerOrdersService,
        { provide: PrismaService, useValue: { order: { groupBy } } },
        { provide: OrderNotificationService, useValue: {} },
        { provide: EarningsService, useValue: {} },
        { provide: PostHogService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
      ],
    }).compile();
    service = module.get(SellerOrdersService);
  });

  it('groups all non-deleted orders for only the authenticated seller, without pagination', async () => {
    groupBy.mockResolvedValue([
      { status: OrderStatus.PENDING, _count: { _all: 45 } },
      { status: OrderStatus.CONFIRMED, _count: { _all: 6 } },
      { status: OrderStatus.PROCESSING, _count: { _all: 3 } },
      { status: OrderStatus.READY_FOR_TEKA_PICKUP, _count: { _all: 12 } },
      { status: OrderStatus.RECEIVED_AT_TEKA, _count: { _all: 2 } },
      { status: OrderStatus.OUT_FOR_DELIVERY, _count: { _all: 4 } },
      { status: OrderStatus.SHIPPED, _count: { _all: 1 } },
    ]);
    const result = await service.getOrderStats('seller-a');
    expect(groupBy).toHaveBeenCalledWith({
      by: ['status'], where: { sellerId: 'seller-a', deletedAt: null },
      _count: { _all: true },
    });
    expect(result.byStatus).toMatchObject({ PENDING: 45, CONFIRMED: 6, PROCESSING: 3 });
    expect(result.summary).toEqual({
      nouvelles: 45, aPreparer: 9, pretesPourCollecte: 12,
      enLivraison: 7, livrees: 0, annulees: 0, retours: 0,
    });
  });

  it('reports an empty seller without inventing pending work', async () => {
    groupBy.mockResolvedValue([]);
    const result = await service.getOrderStats('seller-b');
    expect(result.byStatus).toEqual({});
    expect(Object.values(result.summary).every((count) => count === 0)).toBe(true);
    expect(groupBy.mock.calls[0][0].where.sellerId).toBe('seller-b');
  });

  it('propagates a failed query instead of returning a misleading zero', async () => {
    groupBy.mockRejectedValue(new Error('unavailable'));
    await expect(service.getOrderStats('seller-a')).rejects.toThrow('unavailable');
  });
});
