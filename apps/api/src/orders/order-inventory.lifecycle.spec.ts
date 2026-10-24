import { BadRequestException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  ReturnStatus,
  TransactionProvider,
  TransactionType,
} from '@prisma/client';
import { OrdersService } from './orders.service';
import { SellerOrdersService } from './seller-orders.service';
import { AdminOrdersService } from '../admin/admin-orders.service';
import { ReturnsService } from '../returns/returns.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutService } from '../checkout/checkout.service';

/**
 * Inventory lifecycle (I1) across EVERY actor, driven through the real
 * services against a small stateful in-memory database.
 *
 * What this proves: the decision logic — eligibility re-validated inside the
 * transaction, once-only release from the audit history, conditional COD
 * failure, rollback, and that a stale pre-read (the interleavings Promise.all
 * produces) can never win. The fake runs transactions one at a time, i.e. it
 * models the row lock as a perfect serializer; whether PostgreSQL actually
 * serializes them is proven by the opt-in real-database suite
 * (`test/inventory-concurrency.pg-spec.ts`), not here.
 */

type Row = Record<string, any>;

function matches(row: Row, where: Row | undefined): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (cond === undefined) continue;
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond && !cond.in.includes(value)) return false;
      if ('notIn' in cond && cond.notIn.includes(value)) return false;
      if ('gte' in cond && !(value >= cond.gte)) return false;
    } else if (cond === null ? value != null : value !== cond) {
      return false;
    }
  }
  return true;
}

function apply(row: Row, data: Row): Row {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && 'increment' in value) {
      row[key] += value.increment;
    } else if (value !== null && typeof value === 'object' && 'decrement' in value) {
      row[key] -= value.decrement;
    } else {
      row[key] = value;
    }
  }
  return row;
}

let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

class FakeDb {
  state = {
    orders: [] as Row[],
    items: [] as Row[],
    logs: [] as Row[],
    products: [] as Row[],
    transactions: [] as Row[],
    returns: [] as Row[],
  };
  /** Makes the next matching transaction.updateMany throw (rollback test). */
  failNextTransactionUpdate = false;
  private chain: Promise<unknown> = Promise.resolve();

  // --- seeding --------------------------------------------------------------
  seedProduct(id: string, quantity: number, extra: Row = {}) {
    this.state.products.push({
      id, quantity, title: `Produit ${id}`, status: ProductStatus.ACTIVE,
      deletedAt: null, priceCDF: 1_000_000n, priceUSD: null,
      discountPriceCDF: null, discountPriceUSD: null, unitsSold: 0, ...extra,
    });
  }

  seedOrder(o: {
    id: string;
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    lines: [string, number][];
    history?: OrderStatus[];
    deliveredAt?: Date | null;
  }) {
    this.state.orders.push({
      id: o.id, orderNumber: `TK-${o.id}`, buyerId: 'buyer', sellerId: 'seller',
      status: o.status ?? OrderStatus.PENDING, paymentMethod: PaymentMethod.COD,
      paymentStatus: o.paymentStatus ?? PaymentStatus.PENDING, deletedAt: null,
      deliveredAt: o.deliveredAt ?? null, returnedAt: null, totalCDF: 2_000_000n,
      totalUSD: null, cancellationReason: null, cancelledBy: null,
    });
    for (const [productId, quantity] of o.lines) {
      this.state.items.push({ id: nextId('item'), orderId: o.id, productId, quantity, totalCDF: 1_000_000n });
    }
    let from: OrderStatus | null = null;
    for (const to of o.history ?? [OrderStatus.PENDING]) {
      this.state.logs.push({ id: nextId('log'), orderId: o.id, fromStatus: from, toStatus: to });
      from = to;
    }
    this.state.transactions.push({
      id: nextId('txn'), orderId: o.id, type: TransactionType.PAYMENT,
      provider: TransactionProvider.COD, status: PaymentStatus.PENDING,
    });
  }

  // --- reads for assertions -------------------------------------------------
  stock(id: string) { return this.state.products.find((p) => p.id === id)!.quantity; }
  getOrder(id: string) { return this.state.orders.find((o) => o.id === id)!; }
  logsInto(id: string, to: OrderStatus) {
    return this.state.logs.filter((l) => l.orderId === id && l.toStatus === to);
  }
  codTxn(id: string) {
    return this.state.transactions.find((t) => t.orderId === id && t.type === TransactionType.PAYMENT)!;
  }

  // --- Prisma surface used by the services ---------------------------------
  $transaction = (cb: (tx: FakeDb) => Promise<unknown>) => {
    const run = this.chain.then(async () => {
      const snapshot = structuredClone(this.state);
      try {
        return await cb(this);
      } catch (err) {
        this.state = snapshot; // rollback
        throw err;
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
  };

  $queryRaw = async (_sql: TemplateStringsArray, orderId: string) =>
    this.state.orders.some((o) => o.id === orderId && o.deletedAt === null) ? [{ id: orderId }] : [];

  private withRelations(order: Row, include?: Row) {
    if (!include) return { ...order };
    return {
      ...order,
      ...(include.items && { items: this.state.items.filter((i) => i.orderId === order.id).map((i) => ({ ...i })) }),
      ...(include.statusLogs && { statusLogs: this.state.logs.filter((l) => l.orderId === order.id) }),
    };
  }

  order = {
    findUnique: async ({ where, include }: Row) => {
      const o = this.state.orders.find((r) => matches(r, where));
      return o ? this.withRelations(o, include) : null;
    },
    findUniqueOrThrow: async (args: Row) => {
      const o = await this.order.findUnique(args);
      if (!o) throw new Error('not found');
      return o;
    },
    findMany: async ({ where }: Row) => this.state.orders.filter((r) => matches(r, where)),
    update: async ({ where, data, include }: Row) => {
      const o = this.state.orders.find((r) => r.id === where.id)!;
      apply(o, data);
      return this.withRelations(o, include);
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = this.state.orders.filter((r) => matches(r, where));
      rows.forEach((r) => apply(r, data));
      return { count: rows.length };
    },
    create: async ({ data }: Row) => {
      const { items, statusLogs, ...scalars } = data;
      const order = { id: nextId('order'), deletedAt: null, deliveredAt: null, returnedAt: null, ...scalars };
      this.state.orders.push(order);
      for (const it of items.create) this.state.items.push({ id: nextId('item'), orderId: order.id, ...it });
      this.state.logs.push({ id: nextId('log'), orderId: order.id, ...statusLogs.create });
      return this.withRelations(order, { items: true, statusLogs: true });
    },
  };

  orderStatusLog = {
    create: async ({ data }: Row) => {
      const row = { id: nextId('log'), ...data };
      this.state.logs.push(row);
      return row;
    },
    count: async ({ where }: Row) => this.state.logs.filter((l) => matches(l, where)).length,
  };

  orderItem = {
    findMany: async ({ where }: Row) => this.state.items.filter((i) => matches(i, where)).map((i) => ({ ...i })),
  };

  product = {
    update: async ({ where, data }: Row) => apply(this.state.products.find((p) => p.id === where.id)!, data),
    updateMany: async ({ where, data }: Row) => {
      const rows = this.state.products.filter((p) => matches(p, where));
      rows.forEach((r) => apply(r, data));
      return { count: rows.length };
    },
    findUnique: async ({ where }: Row) => {
      const p = this.state.products.find((r) => r.id === where.id);
      return p ? { ...p, images: [] } : null;
    },
    findUniqueOrThrow: async (args: Row) => (await this.product.findUnique(args))!,
  };

  transaction = {
    create: async ({ data }: Row) => {
      const row = { id: nextId('txn'), ...data };
      this.state.transactions.push(row);
      return row;
    },
    updateMany: async ({ where, data }: Row) => {
      if (this.failNextTransactionUpdate) {
        this.failNextTransactionUpdate = false;
        throw new Error('panne base de données');
      }
      const rows = this.state.transactions.filter((t) => matches(t, where));
      rows.forEach((r) => apply(r, data));
      return { count: rows.length };
    },
  };

  returnRequest = {
    updateMany: async ({ where, data }: Row) => {
      const rows = this.state.returns.filter((r) => matches(r, where));
      rows.forEach((r) => apply(r, data));
      return { count: rows.length };
    },
    findUnique: async ({ where }: Row) => {
      const r = this.state.returns.find((x) => x.id === where.id);
      if (!r) return null;
      const o = this.getOrder(r.orderId);
      return { ...r, order: { id: o.id, orderNumber: o.orderNumber, status: o.status, totalCDF: o.totalCDF } };
    },
    findUniqueOrThrow: async ({ where }: Row) => ({ ...this.state.returns.find((x) => x.id === where.id)! }),
  };

  // checkout-only surface
  address = { findFirst: async () => ({ id: 'addr', town: 'Lubumbashi', city: { name: 'Lubumbashi' } }) };
  sellerProfile = { findFirst: async () => null };
  cart = { findUnique: async () => ({ id: 'cart' }) };
  cartItem = { deleteMany: async () => ({ count: 0 }) };
}

function setup() {
  const db = new FakeDb();
  const prisma = db as never;
  const analytics = { capture: jest.fn() };
  const notifications = new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) });
  const earnings = {
    reverseEarning: jest.fn().mockResolvedValue({ reversed: true, inPayout: false }),
    createEarning: jest.fn().mockResolvedValue(undefined),
  };
  const payments = new PaymentsService(prisma);
  const cart = { getCartSummary: jest.fn() };
  const zones = { estimateFee: jest.fn().mockResolvedValue({ data: { found: true, feeCDF: '0', feeUSD: null } }) };
  return {
    db,
    analytics,
    earnings,
    cart,
    buyer: new OrdersService(prisma, notifications as never, analytics as never, payments),
    seller: new SellerOrdersService(prisma, notifications as never, earnings as never, analytics as never, payments),
    admin: new AdminOrdersService(prisma, earnings as never, payments, notifications as never, analytics as never),
    returns: new ReturnsService(prisma, earnings as never, notifications as never, analytics as never),
    checkout: new CheckoutService(prisma, cart as never, zones as never, notifications as never, payments, analytics as never),
  };
}

const events = (analytics: { capture: jest.Mock }, name: string) =>
  analytics.capture.mock.calls.filter((c) => c[1] === name);

describe('Inventory lifecycle — cancellation releases the checkout hold exactly once', () => {
  it('buyer cancel: stock back, COD payment + transaction FAILED, one log; a retry is refused and releases nothing', async () => {
    const t = setup();
    t.db.seedProduct('p1', 8);
    t.db.seedOrder({ id: 'o1', lines: [['p1', 2]] });

    await t.buyer.cancelOrder('buyer', 'o1', 'Changé d’avis');
    expect(t.db.stock('p1')).toBe(10);
    expect(t.db.getOrder('o1')).toMatchObject({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED, cancelledBy: 'buyer' });
    expect(t.db.codTxn('o1')).toMatchObject({ status: PaymentStatus.FAILED, failureReason: 'order_cancelled' });
    expect(t.db.logsInto('o1', OrderStatus.CANCELLED)).toHaveLength(1);
    expect(events(t.analytics, 'payment_failed')).toHaveLength(1);

    await expect(t.buyer.cancelOrder('buyer', 'o1')).rejects.toThrow(BadRequestException);
    expect(t.db.stock('p1')).toBe(10);
    expect(t.db.logsInto('o1', OrderStatus.CANCELLED)).toHaveLength(1);
    expect(events(t.analytics, 'payment_failed')).toHaveLength(1);
  });

  it('every other actor is refused once cancelled — seller reject, admin cancel, forced CANCELLED', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', lines: [['p1', 3]] });
    await t.seller.rejectOrder('seller', 'o1', 'Rupture');
    expect(t.db.stock('p1')).toBe(3);

    await expect(t.buyer.cancelOrder('buyer', 'o1')).rejects.toThrow(BadRequestException);
    await expect(t.seller.rejectOrder('seller', 'o1', 'x')).rejects.toThrow(BadRequestException);
    await expect(t.admin.adminCancelOrder('o1', 'admin', 'x')).rejects.toThrow('déjà annulée');
    await expect(t.admin.forceStatusChange('o1', OrderStatus.CANCELLED, 'admin')).rejects.toThrow(BadRequestException);
    expect(t.db.stock('p1')).toBe(3);
    expect(t.db.logsInto('o1', OrderStatus.CANCELLED)).toHaveLength(1);
  });

  it('four actors racing on stale pre-reads: exactly one wins, one release, one log, one payment_failed', async () => {
    const t = setup();
    t.db.seedProduct('p1', 5);
    t.db.seedOrder({ id: 'o1', lines: [['p1', 2]] });

    const results = await Promise.allSettled([
      t.buyer.cancelOrder('buyer', 'o1'),
      t.seller.rejectOrder('seller', 'o1', 'Rupture'),
      t.admin.adminCancelOrder('o1', 'admin', 'Fraude'),
      t.admin.forceStatusChange('o1', OrderStatus.CANCELLED, 'admin'),
      t.buyer.cancelOrder('buyer', 'o1'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((x) => x.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);
    }
    expect(t.db.stock('p1')).toBe(7);
    expect(t.db.logsInto('o1', OrderStatus.CANCELLED)).toHaveLength(1);
    expect(events(t.analytics, 'payment_failed')).toHaveLength(1);
  });

  it('forced CANCELLED (the confirmed bypass) now restores stock and fails the unpaid COD payment', async () => {
    const t = setup();
    t.db.seedProduct('p1', 1);
    t.db.seedOrder({ id: 'o1', status: OrderStatus.RECEIVED_AT_TEKA, lines: [['p1', 4]], history: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.READY_FOR_TEKA_PICKUP, OrderStatus.RECEIVED_AT_TEKA] });

    await t.admin.forceStatusChange('o1', OrderStatus.CANCELLED, 'admin', 'Erreur de saisie');
    expect(t.db.stock('p1')).toBe(5);
    expect(t.db.getOrder('o1')).toMatchObject({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED, cancelledBy: 'admin', cancellationReason: 'Erreur de saisie' });
    expect(t.db.codTxn('o1').status).toBe(PaymentStatus.FAILED);
    expect(t.db.logsInto('o1', OrderStatus.CANCELLED)).toEqual([
      expect.objectContaining({ fromStatus: OrderStatus.RECEIVED_AT_TEKA, changedBy: 'admin', note: 'Erreur de saisie' }),
    ]);
    expect(events(t.analytics, 'payment_failed')[0][2]).toMatchObject({ actor: 'admin' });
  });

  it('multi-line order with variant products: each product gets back exactly its own quantity, others untouched', async () => {
    const t = setup();
    t.db.seedProduct('robe-m', 1);
    t.db.seedProduct('robe-l', 0);
    t.db.seedProduct('autre', 9);
    t.db.seedOrder({ id: 'o1', lines: [['robe-m', 2], ['robe-l', 1]] });

    await t.admin.adminCancelOrder('o1', 'admin', 'Client injoignable');
    expect([t.db.stock('robe-m'), t.db.stock('robe-l'), t.db.stock('autre')]).toEqual([3, 1, 9]);
  });

  it('a failure inside the cancellation rolls everything back: status, stock, log, payment', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', lines: [['p1', 2]] });
    t.db.failNextTransactionUpdate = true;

    await expect(t.buyer.cancelOrder('buyer', 'o1')).rejects.toThrow('panne');
    expect(t.db.stock('p1')).toBe(0);
    expect(t.db.getOrder('o1')).toMatchObject({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING });
    expect(t.db.logsInto('o1', OrderStatus.CANCELLED)).toHaveLength(0);
    expect(events(t.analytics, 'order_cancelled')).toHaveLength(0);

    await t.buyer.cancelOrder('buyer', 'o1'); // the retry then succeeds normally
    expect(t.db.stock('p1')).toBe(2);
  });

  it('authorization still holds: a foreign buyer or seller cannot cancel, and nothing moves', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', lines: [['p1', 1]] });
    await expect(t.buyer.cancelOrder('autre-acheteur', 'o1')).rejects.toThrow("Vous n'avez pas accès");
    await expect(t.seller.rejectOrder('autre-vendeur', 'o1', 'x')).rejects.toThrow("Vous n'avez pas accès");
    expect(t.db.stock('p1')).toBe(0);
    expect(t.db.getOrder('o1').status).toBe(OrderStatus.PENDING);
  });
});

describe('Inventory lifecycle — ineligible cancellations', () => {
  it('a paid order (legacy rewind kept COMPLETED) cannot be cancelled by anyone', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', status: OrderStatus.PENDING, paymentStatus: PaymentStatus.COMPLETED, lines: [['p1', 1]] });

    await expect(t.buyer.cancelOrder('buyer', 'o1')).rejects.toThrow('encaissée');
    await expect(t.seller.rejectOrder('seller', 'o1', 'x')).rejects.toThrow('encaissée');
    await expect(t.admin.adminCancelOrder('o1', 'admin', 'x')).rejects.toThrow('encaissée');
    await expect(t.admin.forceStatusChange('o1', OrderStatus.CANCELLED, 'admin')).rejects.toThrow('encaissée');
    expect(t.db.stock('p1')).toBe(0);
    expect(t.db.getOrder('o1').paymentStatus).toBe(PaymentStatus.COMPLETED);
  });

  it('DELIVERED and RETURNED orders cannot be cancelled; RETURNED/CANCELLED cannot be revived', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'del', status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.COMPLETED, lines: [['p1', 1]] });
    t.db.seedOrder({ id: 'ret', status: OrderStatus.RETURNED, paymentStatus: PaymentStatus.COMPLETED, lines: [['p1', 1]], history: [OrderStatus.PENDING, OrderStatus.DELIVERED, OrderStatus.RETURNED] });
    t.db.seedOrder({ id: 'can', status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED, lines: [['p1', 1]], history: [OrderStatus.PENDING, OrderStatus.CANCELLED] });

    await expect(t.admin.adminCancelOrder('del', 'admin', 'x')).rejects.toThrow('déjà livrée');
    await expect(t.admin.forceStatusChange('del', OrderStatus.CANCELLED, 'admin')).rejects.toThrow('déjà livrée');
    await expect(t.admin.adminCancelOrder('ret', 'admin', 'x')).rejects.toThrow('retournée');
    for (const target of [OrderStatus.PENDING, OrderStatus.DELIVERED, OrderStatus.CANCELLED]) {
      await expect(t.admin.forceStatusChange('ret', target, 'admin')).rejects.toThrow('ne peut plus changer de statut');
    }
    for (const target of [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.DELIVERED]) {
      await expect(t.admin.forceStatusChange('can', target, 'admin')).rejects.toThrow('ne peut plus changer de statut');
    }
    expect(t.db.stock('p1')).toBe(0);
  });

  it('admin may still cancel a parcel refused at the door (OUT_FOR_DELIVERY, unpaid)', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', status: OrderStatus.OUT_FOR_DELIVERY, lines: [['p1', 1]] });
    await t.admin.adminCancelOrder('o1', 'admin', 'Refusé à la livraison');
    expect(t.db.stock('p1')).toBe(1);
    expect(t.db.getOrder('o1').status).toBe(OrderStatus.CANCELLED);
  });
});

describe('Inventory lifecycle — legacy history is never restocked on a guess', () => {
  // Before this fix a forced CANCELLED wrote the log WITHOUT restocking, and
  // an order could then be forced back. Whether its stock came back is
  // unknowable from the row, so the conservative rule is: never twice.
  it('a rewound order (CANCELLED → PENDING in its history) is cancelled again without a second release', async () => {
    const t = setup();
    t.db.seedProduct('p1', 4);
    t.db.seedOrder({ id: 'o1', lines: [['p1', 2]], history: [OrderStatus.PENDING, OrderStatus.CANCELLED, OrderStatus.PENDING] });

    await t.buyer.cancelOrder('buyer', 'o1');
    expect(t.db.stock('p1')).toBe(4);
    // Status, audit and payment are still handled normally.
    expect(t.db.getOrder('o1')).toMatchObject({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED });
    expect(t.db.logsInto('o1', OrderStatus.CANCELLED)).toHaveLength(2);
  });
});

describe('Inventory lifecycle — cancellation vs fulfillment', () => {
  it('a fulfillment step on a stale pre-read cannot overwrite a committed cancellation', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', status: OrderStatus.PROCESSING, lines: [['p1', 1]], history: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING] });

    const results = await Promise.allSettled([
      t.seller.markReadyForPickup('seller', 'o1'),
      t.buyer.cancelOrder('buyer', 'o1'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const o = t.db.getOrder('o1');
    if (o.status === OrderStatus.CANCELLED) {
      expect(t.db.stock('p1')).toBe(1);
      expect(t.db.logsInto('o1', OrderStatus.READY_FOR_TEKA_PICKUP)).toHaveLength(0);
    } else {
      expect(o.status).toBe(OrderStatus.READY_FOR_TEKA_PICKUP);
      expect(t.db.stock('p1')).toBe(0);
    }
  });

  it('delivery vs admin cancel on OUT_FOR_DELIVERY: exactly one outcome, never both', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', status: OrderStatus.OUT_FOR_DELIVERY, lines: [['p1', 2]] });

    const results = await Promise.allSettled([
      t.admin.markDelivered('o1', 'admin'),
      t.admin.adminCancelOrder('o1', 'admin', 'Refusé'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const o = t.db.getOrder('o1');
    if (o.status === OrderStatus.DELIVERED) {
      expect(o.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(t.db.stock('p1')).toBe(0);
      expect(t.earnings.createEarning).toHaveBeenCalledTimes(1);
    } else {
      expect(o).toMatchObject({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED });
      expect(t.db.stock('p1')).toBe(2);
      expect(t.earnings.createEarning).not.toHaveBeenCalled();
    }
  });

  it('sequential: confirm after a cancellation is refused and the order stays CANCELLED', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', lines: [['p1', 1]] });
    await t.buyer.cancelOrder('buyer', 'o1');
    await expect(t.seller.confirmOrder('seller', 'o1')).rejects.toThrow('Transition de statut invalide');
    await expect(t.admin.markReceivedAtTeka('o1', 'admin')).rejects.toThrow('Transition de statut invalide');
    expect(t.db.getOrder('o1').status).toBe(OrderStatus.CANCELLED);
    expect(t.db.stock('p1')).toBe(1);
  });

  it('the cancellation log records the status the order was really in (not the stale pre-read)', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', lines: [['p1', 1]] });
    // The buyer's pre-read saw PENDING; the seller confirmed before the
    // buyer's transaction ran.
    const stale = { ...t.db.getOrder('o1') };
    await t.seller.confirmOrder('seller', 'o1');
    const realFindUnique = t.db.order.findUnique;
    t.db.order.findUnique = jest.fn().mockResolvedValueOnce(stale).mockImplementation(realFindUnique);

    await t.buyer.cancelOrder('buyer', 'o1');
    expect(t.db.logsInto('o1', OrderStatus.CANCELLED)).toEqual([
      expect.objectContaining({ fromStatus: OrderStatus.CONFIRMED }),
    ]);
  });
});

describe('Inventory lifecycle — returns never double-restock', () => {
  function delivered(t: ReturnType<typeof setup>, history?: OrderStatus[]) {
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.COMPLETED, deliveredAt: new Date(), lines: [['p1', 2]], history: history ?? [OrderStatus.PENDING, OrderStatus.DELIVERED] });
    t.db.state.returns.push({ id: 'r1', orderId: 'o1', status: ReturnStatus.REQUESTED, deletedAt: null });
  }

  it('approved return restocks once and records the refund; a second approval is refused', async () => {
    const t = setup();
    delivered(t);
    await t.returns.approveReturn('r1', 'admin');
    expect(t.db.stock('p1')).toBe(2);
    expect(t.db.state.transactions.filter((x) => x.type === TransactionType.REFUND)).toHaveLength(1);
    await expect(t.returns.approveReturn('r1', 'admin')).rejects.toThrow('déjà été traitée');
    expect(t.db.stock('p1')).toBe(2);
  });

  it('concurrent approve + approve + reject of one request: one outcome, at most one restock', async () => {
    const t = setup();
    delivered(t);
    const results = await Promise.allSettled([
      t.returns.approveReturn('r1', 'admin'),
      t.returns.approveReturn('r1', 'admin2'),
      t.returns.rejectReturn('r1', 'admin3'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const approved = t.db.state.returns[0].status === ReturnStatus.APPROVED;
    expect(t.db.stock('p1')).toBe(approved ? 2 : 0);
  });

  it('forced RETURNED restocks once (no refund record); the pending request can then no longer restock', async () => {
    const t = setup();
    delivered(t);
    await t.admin.forceStatusChange('o1', OrderStatus.RETURNED, 'admin');
    expect(t.db.stock('p1')).toBe(2);
    expect(t.earnings.reverseEarning).toHaveBeenCalledWith('o1', expect.anything(), 'ORDER_STATUS_FORCED');
    expect(t.db.state.transactions.filter((x) => x.type === TransactionType.REFUND)).toHaveLength(0);

    await expect(t.returns.approveReturn('r1', 'admin')).rejects.toThrow('livrée');
    expect(t.db.stock('p1')).toBe(2);
    expect(t.db.state.returns[0].status).toBe(ReturnStatus.REQUESTED); // rolled back
  });

  it('a legacy rewound order (CANCELLED earlier in its history) is returned without a second restock', async () => {
    const t = setup();
    delivered(t, [OrderStatus.PENDING, OrderStatus.CANCELLED, OrderStatus.DELIVERED]);
    await t.returns.approveReturn('r1', 'admin');
    expect(t.db.getOrder('o1').status).toBe(OrderStatus.RETURNED);
    expect(t.db.stock('p1')).toBe(0);
  });

  it('forced RETURNED is refused for an order that was never delivered', async () => {
    const t = setup();
    t.db.seedProduct('p1', 0);
    t.db.seedOrder({ id: 'o1', status: OrderStatus.PROCESSING, lines: [['p1', 1]] });
    await expect(t.admin.forceStatusChange('o1', OrderStatus.RETURNED, 'admin')).rejects.toThrow('Seule une commande livrée');
    expect(t.db.stock('p1')).toBe(0);
  });
});

describe('Inventory lifecycle — checkout takes stock atomically', () => {
  function cartOf(t: ReturnType<typeof setup>, lines: [string, number][]) {
    const items = lines.map(([id, quantity]) => ({ product: { id, title: `Produit ${id}` }, quantity }));
    t.cart.getCartSummary.mockResolvedValue({ items, sellerGroups: [{ sellerId: 'seller', items }] });
  }
  const dto = (key: string) => ({ idempotencyKey: key, deliveryAddressId: 'addr', paymentMethod: PaymentMethod.COD }) as never;

  it('decrements stock and creates the PENDING COD transaction in the same transaction', async () => {
    const t = setup();
    t.db.seedProduct('p1', 3);
    cartOf(t, [['p1', 2]]);
    const res = await t.checkout.checkout('buyer', dto('k1'));
    const orderId = res.orders[0].id;
    expect(t.db.stock('p1')).toBe(1);
    expect(t.db.codTxn(orderId)).toMatchObject({ status: PaymentStatus.PENDING, provider: TransactionProvider.COD, externalReference: `COD-${orderId}` });
  });

  it('cannot oversell: once the last unit is sold the next checkout gets the French stock error', async () => {
    const t = setup();
    t.db.seedProduct('p1', 2);
    cartOf(t, [['p1', 2]]);
    await t.checkout.checkout('buyer', dto('k1'));
    cartOf(t, [['p1', 1]]);
    await expect(t.checkout.checkout('buyer2', dto('k2'))).rejects.toThrow('Stock insuffisant pour "Produit p1". Disponible : 0, demandé : 1');
    expect(t.db.stock('p1')).toBe(0);
    expect(t.db.state.orders).toHaveLength(1);
  });

  it('five concurrent checkouts for three units: exactly three orders, stock exactly zero', async () => {
    const t = setup();
    t.db.seedProduct('p1', 3);
    cartOf(t, [['p1', 1]]);
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((n) => t.checkout.checkout(`b${n}`, dto(`k${n}`))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(t.db.stock('p1')).toBe(0);
  });

  it('one short line rolls the whole multi-line checkout back (no partial decrement, no order, no COD record)', async () => {
    const t = setup();
    t.db.seedProduct('a', 5);
    t.db.seedProduct('b', 1);
    cartOf(t, [['a', 1], ['b', 3]]);
    await expect(t.checkout.checkout('buyer', dto('k1'))).rejects.toThrow('Stock insuffisant');
    expect([t.db.stock('a'), t.db.stock('b')]).toEqual([5, 1]);
    expect(t.db.state.orders).toHaveLength(0);
    expect(t.db.state.transactions).toHaveLength(0);
  });

  it('an inactive product is refused before any stock is taken', async () => {
    const t = setup();
    t.db.seedProduct('p1', 5, { status: ProductStatus.ARCHIVED });
    cartOf(t, [['p1', 1]]);
    await expect(t.checkout.checkout('buyer', dto('k1'))).rejects.toThrow("n'est plus disponible");
    expect(t.db.stock('p1')).toBe(5);
  });

  it('repurchase: units released by a cancellation can be bought again, and only once', async () => {
    const t = setup();
    t.db.seedProduct('p1', 1);
    cartOf(t, [['p1', 1]]);
    const first = await t.checkout.checkout('buyer', dto('k1'));
    await t.buyer.cancelOrder('buyer', first.orders[0].id);
    expect(t.db.stock('p1')).toBe(1);

    const again = await Promise.allSettled([t.checkout.checkout('b2', dto('k2')), t.checkout.checkout('b3', dto('k3'))]);
    expect(again.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(t.db.stock('p1')).toBe(0);
  });
});
