/**
 * Inventory lifecycle (I1) against a REAL, ISOLATED PostgreSQL — opt-in.
 *
 * The unit suite (`src/orders/order-inventory.lifecycle.spec.ts`) proves the
 * decision logic with transactions run one at a time. This suite proves the
 * part a mock cannot: that PostgreSQL row locks really serialize concurrent
 * checkouts, cancellations, fulfillment and return reviews, so stock is never
 * oversold, never released twice, and a cancelled order is never overwritten.
 *
 * Safety (this file never touches the cloud database):
 *  - the URL comes ONLY from `TEKA_INVENTORY_PG_URL` and is passed to Prisma
 *    explicitly — `DATABASE_URL` and the root `.env.*` files are never read;
 *  - the host must be localhost / 127.0.0.1 / ::1 over TCP (no `host=`
 *    override), the database name must contain "test", and it may not equal
 *    DATABASE_URL (`test/isolated-db-guard.ts`, tested in the e2e suite);
 *  - credentials are never printed; it only INSERTs its own synthetic rows
 *    (random ids) and never drops, truncates or deletes anything.
 *
 * Run (from apps/api; Docker only for the throwaway database):
 *
 *   docker run --rm -d --name teka-inv-pg -e POSTGRES_PASSWORD=teka \
 *     -e POSTGRES_DB=teka_inventory_test -p 127.0.0.1:55432:5432 postgres:16
 *   pnpm exec prisma migrate diff --from-empty \
 *     --to-schema-datamodel prisma/schema.prisma --script > /tmp/teka-inv-schema.sql
 *   docker exec -i teka-inv-pg psql -v ON_ERROR_STOP=1 -U postgres \
 *     -d teka_inventory_test < /tmp/teka-inv-schema.sql
 *   TEKA_INVENTORY_PG_URL=postgresql://postgres:teka@127.0.0.1:55432/teka_inventory_test \
 *     pnpm test:pg
 *   docker stop teka-inv-pg
 *
 * Never matched by `pnpm test` (rootDir src, `.spec.ts`) nor `test:e2e`
 * (`.e2e-spec.ts`); only `test/jest-pg.json` picks up `*.pg-spec.ts`.
 */
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ConflictException, HttpException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  ProductStatus,
  ReturnStatus,
} from '@prisma/client';
import { OrdersService } from '../src/orders/orders.service';
import { SellerOrdersService } from '../src/orders/seller-orders.service';
import { AdminOrdersService } from '../src/admin/admin-orders.service';
import { ReturnsService } from '../src/returns/returns.service';
import { PaymentsService } from '../src/payments/payments.service';
import { CheckoutService } from '../src/checkout/checkout.service';
import { ProductsService } from '../src/products/products.service';
import { resolveIsolatedDatabaseUrl } from './isolated-db-guard';

const ROUNDS = 5;
jest.setTimeout(180_000);

describe('Inventory lifecycle on real PostgreSQL (opt-in)', () => {
  let prisma: PrismaClient;
  let svc: ReturnType<typeof buildServices>;
  let categoryId: string;
  let sellerId: string;
  const adminId = randomUUID(); // changedBy/cancelledBy are plain uuids (no FK)

  function buildServices(db: PrismaClient) {
    const p = db as never;
    const analytics = { capture: jest.fn() };
    const notifications = new Proxy({}, { get: () => () => Promise.resolve() });
    // Earnings are not under test here; keep them out of the fixture surface.
    const earnings = {
      reverseEarning: jest.fn().mockResolvedValue({ reversed: false, inPayout: false }),
      createEarning: jest.fn().mockResolvedValue(undefined),
    };
    const payments = new PaymentsService(p);
    const carts = new Map<string, { items: unknown[]; sellerGroups: unknown[] }>();
    const cartService = { getCartSummary: async (userId: string) => carts.get(userId) };
    const zones = { estimateFee: async () => ({ data: { found: true, feeCDF: '0', feeUSD: null } }) };
    return {
      analytics,
      earnings,
      carts,
      products: new ProductsService(p, {} as never, analytics as never, { create: async () => undefined } as never),
      buyer: new OrdersService(p, notifications as never, analytics as never, payments),
      seller: new SellerOrdersService(p, notifications as never, earnings as never, analytics as never, payments),
      admin: new AdminOrdersService(p, earnings as never, payments, notifications as never, analytics as never),
      returns: new ReturnsService(p, earnings as never, notifications as never, analytics as never),
      checkout: new CheckoutService(p, cartService as never, zones as never, notifications as never, payments, analytics as never),
    };
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: resolveIsolatedDatabaseUrl() });
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    if (!/test/i.test(db)) throw new Error('Refus : base connectée inattendue.');
    svc = buildServices(prisma);

    const seller = await prisma.user.create({ data: { role: 'SELLER', status: 'ACTIVE', firstName: 'Mutombo', lastName: 'Kabila' } });
    sellerId = seller.id;
    const category = await prisma.category.create({ data: { name: `Test inventaire ${randomUUID()}` } });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  // --- fixtures ---------------------------------------------------------------
  async function product(quantity: number) {
    return prisma.product.create({
      data: {
        title: `Pagne wax ${randomUUID().slice(0, 6)}`, description: 'Produit synthétique de test',
        categoryId, sellerId, priceCDF: 2_500_000n, quantity, status: ProductStatus.ACTIVE,
      },
    });
  }

  async function buyer() {
    const user = await prisma.user.create({ data: { role: 'BUYER', status: 'ACTIVE', firstName: 'Ilunga' } });
    const address = await prisma.address.create({
      data: { userId: user.id, province: 'Haut-Katanga', town: 'Lubumbashi', neighborhood: 'Kampemba', avenue: 'Avenue Kasavubu' },
    });
    return { id: user.id, addressId: address.id };
  }

  function setCart(userId: string, lines: { id: string; title: string; quantity: number }[]) {
    const items = lines.map((l) => ({ product: { id: l.id, title: l.title }, quantity: l.quantity }));
    svc.carts.set(userId, { items, sellerGroups: [{ sellerId, items }] });
  }

  async function placeOrder(b: { id: string; addressId: string }, lines: { id: string; title: string; quantity: number }[]) {
    setCart(b.id, lines);
    return svc.checkout.checkout(b.id, {
      idempotencyKey: randomUUID(), deliveryAddressId: b.addressId, paymentMethod: PaymentMethod.COD,
    } as never);
  }

  const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).quantity;
  const cancelLogs = (orderId: string) => prisma.orderStatusLog.count({ where: { orderId, toStatus: OrderStatus.CANCELLED } });

  /** Every loser must be a clean 4xx business refusal — not a deadlock, timeout or 500. */
  function expectOnlyBusinessRefusals(results: PromiseSettledResult<unknown>[]) {
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(HttpException);
        expect((r.reason as HttpException).getStatus()).toBeLessThan(500);
      }
    }
  }

  // --- checkout -----------------------------------------------------------------
  it('12 concurrent buyers, 5 units: exactly 5 orders, stock exactly 0, never negative', async () => {
    const p = await product(5);
    const buyers = await Promise.all(Array.from({ length: 12 }, buyer));
    const results = await Promise.allSettled(buyers.map((b) => placeOrder(b, [{ id: p.id, title: p.title, quantity: 1 }])));

    expectOnlyBusinessRefusals(results);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(await stockOf(p.id)).toBe(0);
    const sold = await prisma.orderItem.aggregate({ where: { productId: p.id }, _sum: { quantity: true } });
    expect(sold._sum.quantity).toBe(5);
  });

  it('multi-product carts in opposite line order never deadlock and every unit is accounted for', async () => {
    const a = await product(40);
    const b = await product(40);
    const buyers = await Promise.all(Array.from({ length: 10 }, buyer));
    const results = await Promise.allSettled(
      buyers.map((u, i) =>
        placeOrder(u, i % 2
          ? [{ id: a.id, title: a.title, quantity: 2 }, { id: b.id, title: b.title, quantity: 1 }]
          : [{ id: b.id, title: b.title, quantity: 1 }, { id: a.id, title: a.title, quantity: 2 }]),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect([await stockOf(a.id), await stockOf(b.id)]).toEqual([20, 30]);
  });

  it('every order is created with its PENDING COD transaction in the same commit', async () => {
    const p = await product(3);
    const res = await placeOrder(await buyer(), [{ id: p.id, title: p.title, quantity: 1 }]);
    const txns = await prisma.transaction.findMany({ where: { orderId: res.orders[0].id } });
    expect(txns).toEqual([expect.objectContaining({ status: PaymentStatus.PENDING, provider: 'COD', type: 'PAYMENT' })]);
  });

  // --- cancellations ------------------------------------------------------------
  it(`buyer ×2, seller, admin and forced cancellations racing (${ROUNDS} rounds): one winner, one release, one log, COD failed`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const p = await product(10);
      const b = await buyer();
      const { orders } = await placeOrder(b, [{ id: p.id, title: p.title, quantity: 2 }]);
      const orderId = orders[0].id;
      expect(await stockOf(p.id)).toBe(8);

      const results = await Promise.allSettled([
        svc.buyer.cancelOrder(b.id, orderId, 'Changé d’avis'),
        svc.buyer.cancelOrder(b.id, orderId, 'Double clic'),
        svc.seller.rejectOrder(sellerId, orderId, 'Rupture'),
        svc.admin.adminCancelOrder(orderId, adminId, 'Client injoignable'),
        svc.admin.forceStatusChange(orderId, OrderStatus.CANCELLED, adminId),
      ]);

      expectOnlyBusinessRefusals(results);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await stockOf(p.id)).toBe(10);
      expect(await cancelLogs(orderId)).toBe(1);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { transactions: true } });
      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(order.paymentStatus).toBe(PaymentStatus.FAILED);
      expect(order.transactions.map((t) => t.status)).toEqual([PaymentStatus.FAILED]);
    }
  });

  it(`ready-for-pickup vs buyer cancel (${ROUNDS} rounds): never both, stock consistent with the winner`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const p = await product(4);
      const b = await buyer();
      const orderId = (await placeOrder(b, [{ id: p.id, title: p.title, quantity: 1 }])).orders[0].id;
      await svc.seller.confirmOrder(sellerId, orderId);
      await svc.seller.processOrder(sellerId, orderId);

      const results = await Promise.allSettled([
        svc.seller.markReadyForPickup(sellerId, orderId),
        svc.buyer.cancelOrder(b.id, orderId),
      ]);
      expectOnlyBusinessRefusals(results);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      const logs = await prisma.orderStatusLog.findMany({ where: { orderId } });
      if (order.status === OrderStatus.CANCELLED) {
        expect(await stockOf(p.id)).toBe(4);
        expect(logs.some((l) => l.toStatus === OrderStatus.READY_FOR_TEKA_PICKUP)).toBe(false);
      } else {
        expect(order.status).toBe(OrderStatus.READY_FOR_TEKA_PICKUP);
        expect(await stockOf(p.id)).toBe(3);
      }
      // The audit chain is gap-free and ends at the real status: walking
      // from → to from creation consumes every log (timestamps can tie).
      let current: OrderStatus | null = null;
      for (let i = 0; i < logs.length; i++) {
        const next = logs.find((l) => l.fromStatus === current);
        expect(next).toBeDefined();
        current = next!.toStatus;
      }
      expect(current).toBe(order.status);
    }
  });

  it(`delivery vs admin cancel on OUT_FOR_DELIVERY (${ROUNDS} rounds): exactly one outcome`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const p = await product(2);
      const b = await buyer();
      const orderId = (await placeOrder(b, [{ id: p.id, title: p.title, quantity: 2 }])).orders[0].id;
      await svc.admin.forceStatusChange(orderId, OrderStatus.OUT_FOR_DELIVERY, adminId, 'Préparation du test');

      const results = await Promise.allSettled([
        svc.admin.markDelivered(orderId, adminId),
        svc.admin.adminCancelOrder(orderId, adminId, 'Refusé à la porte'),
      ]);
      expectOnlyBusinessRefusals(results);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      if (order.status === OrderStatus.DELIVERED) {
        expect(order.paymentStatus).toBe(PaymentStatus.COMPLETED);
        expect(await stockOf(p.id)).toBe(0);
      } else {
        expect(order).toMatchObject({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED });
        expect(await stockOf(p.id)).toBe(2);
      }
    }
  });

  it('cancel racing two repurchases of the last unit: units are conserved, never oversold', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const p = await product(1);
      const first = await buyer();
      const orderId = (await placeOrder(first, [{ id: p.id, title: p.title, quantity: 1 }])).orders[0].id;
      const [b2, b3] = [await buyer(), await buyer()];

      const results = await Promise.allSettled([
        svc.buyer.cancelOrder(first.id, orderId),
        placeOrder(b2, [{ id: p.id, title: p.title, quantity: 1 }]),
        placeOrder(b3, [{ id: p.id, title: p.title, quantity: 1 }]),
      ]);
      expectOnlyBusinessRefusals(results);
      const stock = await stockOf(p.id);
      const live = await prisma.orderItem.aggregate({
        where: { productId: p.id, order: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] } } },
        _sum: { quantity: true },
      });
      expect(stock).toBeGreaterThanOrEqual(0);
      expect(stock + (live._sum.quantity ?? 0)).toBe(1);
    }
  });

  // --- seller absolute stock edit vs cancellation restock ------------------------
  it('a seller form loaded before a cancellation restock gets a 409 and the restock survives', async () => {
    const p = await product(6);
    const b = await buyer();
    const orderId = (await placeOrder(b, [{ id: p.id, title: p.title, quantity: 2 }])).orders[0].id;
    const loaded = await stockOf(p.id); // 4 — what the seller's form shows
    await svc.buyer.cancelOrder(b.id, orderId); // restock → 6

    await expect(
      svc.products.update(sellerId, p.id, { quantity: 10, expectedQuantity: loaded } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await stockOf(p.id)).toBe(6);

    // After seeing the conflict, a deliberate reset from the fresh value applies.
    await svc.products.update(sellerId, p.id, { quantity: 10, expectedQuantity: 6 } as never);
    expect(await stockOf(p.id)).toBe(10);
  });

  it(`seller edit racing a cancellation (${ROUNDS} rounds): the restock is never lost`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const p = await product(6);
      const b = await buyer();
      const orderId = (await placeOrder(b, [{ id: p.id, title: p.title, quantity: 2 }])).orders[0].id;
      const loaded = await stockOf(p.id); // 4

      const [edit] = await Promise.allSettled([
        svc.products.update(sellerId, p.id, { quantity: 20, expectedQuantity: loaded } as never),
        svc.buyer.cancelOrder(b.id, orderId),
      ]);
      const stock = await stockOf(p.id);
      if (edit.status === 'fulfilled') {
        expect(stock).toBe(22); // edit first, restock applied on top
      } else {
        expect((edit.reason as HttpException).getStatus()).toBe(409);
        expect(stock).toBe(6); // restock first, stale edit refused
      }
    }
  });

  it('a modern price-only save (stock untouched in the form) never overwrites a restock', async () => {
    const p = await product(6);
    const b = await buyer();
    const orderId = (await placeOrder(b, [{ id: p.id, title: p.title, quantity: 2 }])).orders[0].id;
    await svc.buyer.cancelOrder(b.id, orderId); // 4 → 6 while the form showed 4
    await svc.products.update(sellerId, p.id, { priceCDF: '2600000', quantity: 4, expectedQuantity: 4 } as never);
    expect(await stockOf(p.id)).toBe(6);
  });

  it('documented limitation: an installed client with no snapshot still overwrites a restock that preceded its request', async () => {
    const p = await product(6);
    const b = await buyer();
    const orderId = (await placeOrder(b, [{ id: p.id, title: p.title, quantity: 2 }])).orders[0].id;
    await svc.buyer.cancelOrder(b.id, orderId); // 4 → 6, form opened at 4
    await svc.products.update(sellerId, p.id, { quantity: 4 } as never); // legacy payload
    expect(await stockOf(p.id)).toBe(4); // last write wins — only modern clients are protected
  });

  // --- I3 read-only historical report on synthetic history ------------------------
  describe('inventory-hold-candidates.sql (synthetic history only)', () => {
    const REPORT = readFileSync(join(__dirname, '../prisma/reports/inventory-hold-candidates.sql'), 'utf8');
    const VARS = ['cancel_restock_verified_since', 'return_restock_verified_since', 'i1_fix_deployed_at'];

    /** The @query block exactly as psql runs it, psql variables → bound parameters. */
    function reportQuery(name: 'summary' | 'candidates') {
      const block = REPORT.split(`-- @query:${name}`)[1].split('-- @end')[0];
      return block.replace(/:'([a-z0-9_]+)'/g, (_m, v: string) => `$${VARS.indexOf(v) + 1}`).replace(/;\s*$/, '');
    }
    type Candidate = { order_id: string; classification: string; entry_classes: string };
    const run = (params: [string, string, string]) =>
      prisma.$queryRawUnsafe<Candidate[]>(reportQuery('candidates'), ...params);

    const at = (iso: string) => new Date(`${iso}T10:00:00Z`);
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      const p = await product(100);
      const b = await buyer();
      const order = async () => (await placeOrder(b, [{ id: p.id, title: p.title, quantity: 1 }])).orders[0].id;
      const log = (orderId: string, fromStatus: OrderStatus, toStatus: OrderStatus, changedBy: string, note: string, day: string) =>
        prisma.orderStatusLog.create({ data: { orderId, fromStatus, toStatus, changedBy, note, createdAt: at(day) } });
      const P = OrderStatus.PENDING;
      const C = OrderStatus.CANCELLED;

      ids.preEra = await order(); // buyer cancel served by code that never restored
      await log(ids.preEra, P, C, b.id, "Annulée par l'acheteur", '2026-05-01');

      ids.knownEra = await order(); // buyer cancel after the verified rollout
      await log(ids.knownEra, P, C, b.id, "Annulée par l'acheteur", '2026-08-01');

      ids.sellerKnown = await order();
      await log(ids.sellerKnown, P, C, sellerId, 'Rejetée par le vendeur : Rupture', '2026-08-01');

      ids.forced = await order(); // pre-I1 forceStatusChange: log, no restore
      await log(ids.forced, P, C, adminId, "Changement forcé par l'administrateur", '2026-08-01');

      ids.rewound = await order(); // restored, revived, restored again
      await log(ids.rewound, P, C, b.id, "Annulée par l'acheteur", '2026-08-01');
      await log(ids.rewound, C, P, adminId, "Changement forcé par l'administrateur", '2026-08-02');
      await log(ids.rewound, P, C, adminId, "Annulée par l'administrateur : Rupture", '2026-08-03');

      ids.postFixFirst = await order(); // I1 forced cancel: first release restores
      await log(ids.postFixFirst, P, C, adminId, "Changement forcé par l'administrateur", '2026-10-05');

      ids.postFixAfterRewind = await order(); // restored pre-fix, revived, I1 skips the 2nd
      await log(ids.postFixAfterRewind, P, C, b.id, "Annulée par l'acheteur", '2026-08-01');
      await log(ids.postFixAfterRewind, C, P, adminId, "Changement forcé par l'administrateur", '2026-08-02');
      await log(ids.postFixAfterRewind, P, C, adminId, "Changement forcé par l'administrateur", '2026-10-05');

      ids.returned = await order();
      await log(ids.returned, OrderStatus.DELIVERED, OrderStatus.RETURNED, adminId, 'Retour approuvé', '2026-08-01');
    });

    function classes(rows: Candidate[]) {
      const ours = Object.fromEntries(Object.entries(ids).map(([k, id]) => [id, k]));
      return Object.fromEntries(rows.filter((r) => ours[r.order_id]).map((r) => [ours[r.order_id], r.classification]));
    }

    it('with verified boundaries: pre-era is UNKNOWN (not ok), forced never restored, repeats and revivals flagged', async () => {
      const got = classes(await run(['2026-07-01 00:00:00', '2026-07-01 00:00:00', '2026-10-01 00:00:00']));
      expect(got).toEqual({
        preEra: 'U_restoration_unproven',
        forced: 'A_hold_never_restored_suspected',
        rewound: 'B_restored_more_than_once_suspected',
        postFixAfterRewind: 'C_revived_after_release',
        // knownEra, sellerKnown, postFixFirst, returned: likely_normal_estimate → not listed
      });
    });

    it('without any verified boundary nothing normal-looking is assumed restored', async () => {
      const got = classes(await run(['', '', '']));
      expect(got.knownEra).toBe('U_restoration_unproven');
      expect(got.sellerKnown).toBe('U_restoration_unproven');
      expect(got.returned).toBe('U_restoration_unproven');
      expect(got.preEra).toBe('U_restoration_unproven');
      // I1 not marked deployed → its forced cancel counts as a pre-fix force.
      expect(got.postFixFirst).toBe('A_hold_never_restored_suspected');
    });

    it('a boundary later than an entry pushes it back to unknown (and mixes with a later restore)', async () => {
      // Rollout verified only from 08-02: the 08-01 cancels are unproven, the
      // 08-03 admin cancel of the rewound order is a likely restore.
      const got = classes(await run(['2026-08-02 00:00:00', '2026-07-01 00:00:00', '2026-10-01 00:00:00']));
      expect(got.knownEra).toBe('U_restoration_unproven');
      expect(got.sellerKnown).toBe('U_restoration_unproven');
      expect(got.rewound).toBe('M_mixed_unproven_and_restored');
      expect(got.postFixAfterRewind).toBe('U_restoration_unproven'); // 08-01 unproven, I1 skips the 2nd
      expect(got.returned).toBeUndefined(); // its own boundary (07-01) is verified
    });

    it('the summary query runs on the same rules and returns integer counts', async () => {
      const rows = await prisma.$queryRawUnsafe<{ classification: string; orders: number; units: number }[]>(
        reportQuery('summary'), '2026-07-01 00:00:00', '2026-07-01 00:00:00', '2026-10-01 00:00:00',
      );
      const byClass = Object.fromEntries(rows.map((r) => [r.classification, r.orders]));
      expect(byClass.U_restoration_unproven).toBeGreaterThanOrEqual(1);
      expect(byClass.A_hold_never_restored_suspected).toBeGreaterThanOrEqual(1);
      expect(byClass.likely_normal_estimate).toBeGreaterThanOrEqual(4);
      for (const r of rows) expect(Number.isInteger(r.units)).toBe(true);
    });
  });

  // --- returns & legacy ---------------------------------------------------------
  it('approve ×2 + reject of one return request concurrently: one review, at most one restock', async () => {
    const p = await product(3);
    const b = await buyer();
    const orderId = (await placeOrder(b, [{ id: p.id, title: p.title, quantity: 3 }])).orders[0].id;
    await svc.admin.forceStatusChange(orderId, OrderStatus.OUT_FOR_DELIVERY, adminId, 'Préparation du test');
    await svc.admin.markDelivered(orderId, adminId);
    const request = await prisma.returnRequest.create({ data: { orderId, buyerId: b.id, reason: 'Article abîmé' } });

    const results = await Promise.allSettled([
      svc.returns.approveReturn(request.id, adminId),
      svc.returns.approveReturn(request.id, adminId),
      svc.returns.rejectReturn(request.id, adminId),
    ]);
    expectOnlyBusinessRefusals(results);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const review = await prisma.returnRequest.findUniqueOrThrow({ where: { id: request.id } });
    const refunds = await prisma.transaction.count({ where: { orderId, type: 'REFUND' } });
    if (review.status === ReturnStatus.APPROVED) {
      expect(await stockOf(p.id)).toBe(3);
      expect(refunds).toBe(1);
    } else {
      expect(await stockOf(p.id)).toBe(0);
      expect(refunds).toBe(0);
    }
  });

  it('legacy forced-cancel + rewind (log present, stock never restored) is not restocked on a guess', async () => {
    const p = await product(5);
    const b = await buyer();
    const orderId = (await placeOrder(b, [{ id: p.id, title: p.title, quantity: 2 }])).orders[0].id;
    // Reproduce what the pre-fix forceStatusChange wrote: logs only, no stock movement.
    await prisma.orderStatusLog.createMany({
      data: [
        { orderId, fromStatus: OrderStatus.PENDING, toStatus: OrderStatus.CANCELLED, changedBy: adminId, note: 'Ancien forçage' },
        { orderId, fromStatus: OrderStatus.CANCELLED, toStatus: OrderStatus.PENDING, changedBy: adminId, note: 'Ancien forçage' },
      ],
    });

    await svc.buyer.cancelOrder(b.id, orderId);
    expect(await stockOf(p.id)).toBe(3); // the uncertain hold stays out of stock
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe(PaymentStatus.FAILED);
  });
});
