import { CartService } from './cart.service';

/**
 * PR B (2026-09-06) — the cart's `totalCDF` is the figure every client shows
 * and the figure checkout charges: promotional price when one is set, else the
 * regular price, × quantity. Pinned here so a client can rely on it. Values
 * are BigInt here; the response interceptor serialises them as strings.
 */
function cartRow(items: Array<{ id: string; qty: number; price: bigint; promo: bigint | null }>) {
  return {
    id: 'cart-1',
    userId: 'u1',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    items: items.map((i) => ({
      id: `line-${i.id}`,
      productId: i.id,
      quantity: i.qty,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      product: {
        id: i.id,
        title: `Produit ${i.id}`,
        slug: `produit-${i.id}`,
        shortCode: `sc${i.id}`,
        city: { slug: 'lubumbashi' },
        priceCDF: i.price,
        priceUSD: null,
        discountPriceCDF: i.promo,
        discountPriceUSD: null,
        quantity: 50,
        condition: 'NEW',
        status: 'ACTIVE',
        deletedAt: null,
        sellerId: 's1',
        seller: { sellerProfile: { businessName: 'Boutique Kabila' } },
        images: [],
      },
    })),
  };
}

function makeService(row: ReturnType<typeof cartRow>) {
  const prisma = {
    cart: { findUnique: jest.fn().mockResolvedValue(row), create: jest.fn() },
    cartItem: { deleteMany: jest.fn() },
  } as any;
  return new CartService(prisma);
}

describe('CartService.getCart — authoritative totalCDF', () => {
  it('no promotion: regular price × quantity', async () => {
    const cart = (await makeService(cartRow([{ id: 'a', qty: 3, price: 1_100_000n, promo: null }])).getCart('u1')) as any;
    expect(cart.totalCDF).toBe(3300000n);
    expect(cart.totalItems).toBe(3);
  });

  it('promotion: the promotional price is charged (9.350 FC not 11.000 FC), ×2 = 18.700 FC', async () => {
    const cart = (await makeService(cartRow([{ id: 'a', qty: 2, price: 1_100_000n, promo: 935_000n }])).getCart('u1')) as any;
    expect(cart.totalCDF).toBe(1870000n);
    expect(cart.items[0].product.discountPriceCDF).toBe(935000n);
    expect(cart.items[0].product.priceCDF).toBe(1100000n);
  });

  it('mixed cart: promo × 2 + regular × 1', async () => {
    const cart = (await makeService(
      cartRow([
        { id: 'a', qty: 2, price: 1_100_000n, promo: 935_000n },
        { id: 'b', qty: 1, price: 2_500_000n, promo: null },
      ]),
    ).getCart('u1')) as any;
    expect(cart.totalCDF).toBe(4370000n);
    expect(cart.totalItems).toBe(3);
  });
});
