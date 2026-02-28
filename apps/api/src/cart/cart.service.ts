import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductStatus } from '@prisma/client';
import { AddToCartDto } from './dto/add-to-cart.dto';

/** Prisma include for cart items with product details */
const CART_ITEM_INCLUDE = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          title: true,
          priceCDF: true,
          priceUSD: true,
          quantity: true,
          condition: true,
          status: true,
          sellerId: true,
          deletedAt: true,
          seller: {
            select: {
              sellerProfile: {
                select: {
                  businessName: true,
                },
              },
            },
          },
          images: {
            select: {
              thumbnailUrl: true,
            },
            orderBy: { displayOrder: 'asc' as const },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  /**
   * Gets the user's cart, creating one if it doesn't exist.
   * Automatically removes stale items (deleted or inactive products).
   */
  async getCart(userId: string) {
    const cart = await this.findOrCreateCart(userId);

    // Clean stale items (product deleted or no longer ACTIVE)
    const staleItemIds = cart.items
      .filter(
        (item) =>
          item.product.deletedAt !== null ||
          item.product.status !== ProductStatus.ACTIVE,
      )
      .map((item) => item.id);

    if (staleItemIds.length > 0) {
      await this.prisma.cartItem.deleteMany({
        where: { id: { in: staleItemIds } },
      });

      // Re-fetch clean cart
      return this.findOrCreateCart(userId);
    }

    return cart;
  }

  /**
   * Adds an item to the cart. If the product is already in the cart,
   * its quantity is updated.
   */
  async addItem(userId: string, dto: AddToCartDto) {
    // Validate product
    const product = await this.validateProduct(dto.productId);

    // Check stock
    if (dto.quantity > product.quantity) {
      throw new BadRequestException(
        `Stock insuffisant. Disponible : ${product.quantity}`,
      );
    }

    // Find or create cart
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    // Check if updating existing item — validate total quantity doesn't exceed stock
    const existingItem = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
    });

    const newQuantity = existingItem
      ? dto.quantity // Replace with the new quantity (not additive)
      : dto.quantity;

    if (newQuantity > product.quantity) {
      throw new BadRequestException(
        `Stock insuffisant. Disponible : ${product.quantity}`,
      );
    }

    // Upsert cart item
    await this.prisma.cartItem.upsert({
      where: {
        cartId_productId: { cartId: cart.id, productId: dto.productId },
      },
      create: {
        cartId: cart.id,
        productId: dto.productId,
        quantity: dto.quantity,
      },
      update: {
        quantity: dto.quantity,
      },
    });

    return this.getCart(userId);
  }

  /**
   * Updates the quantity of a cart item.
   * If quantity is 0, the item is removed.
   */
  async updateQuantity(userId: string, productId: string, quantity: number) {
    if (quantity === 0) {
      return this.removeItem(userId, productId);
    }

    // Validate product stock
    const product = await this.validateProduct(productId);

    if (quantity > product.quantity) {
      throw new BadRequestException(
        `Stock insuffisant. Disponible : ${product.quantity}`,
      );
    }

    const cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      throw new NotFoundException('Panier non trouvé');
    }

    const cartItem = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
    });

    if (!cartItem) {
      throw new NotFoundException('Article non trouvé dans le panier');
    }

    await this.prisma.cartItem.update({
      where: { id: cartItem.id },
      data: { quantity },
    });

    return this.getCart(userId);
  }

  /**
   * Removes a specific item from the cart.
   */
  async removeItem(userId: string, productId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      throw new NotFoundException('Panier non trouvé');
    }

    const cartItem = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
    });

    if (!cartItem) {
      throw new NotFoundException('Article non trouvé dans le panier');
    }

    await this.prisma.cartItem.delete({
      where: { id: cartItem.id },
    });

    return this.getCart(userId);
  }

  /**
   * Removes all items from the cart.
   */
  async clearCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      // Nothing to clear, return empty cart
      return this.findOrCreateCart(userId);
    }

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return this.getCart(userId);
  }

  /**
   * Merges guest cart items into the authenticated user's cart.
   * For existing products, takes the MAX of guest qty and DB qty.
   */
  async mergeGuestCart(
    userId: string,
    items: { productId: string; quantity: number }[],
  ) {
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    for (const item of items) {
      // Validate each product silently — skip invalid ones
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        select: { id: true, status: true, quantity: true, deletedAt: true },
      });

      if (
        !product ||
        product.deletedAt !== null ||
        product.status !== ProductStatus.ACTIVE
      ) {
        continue; // Skip invalid products
      }

      // Cap quantity to available stock
      const cappedQuantity = Math.min(item.quantity, product.quantity);
      if (cappedQuantity <= 0) continue;

      // Check if item already exists in DB cart
      const existingItem = await this.prisma.cartItem.findUnique({
        where: {
          cartId_productId: { cartId: cart.id, productId: item.productId },
        },
      });

      if (existingItem) {
        // Take MAX of guest and existing quantity, capped to stock
        const mergedQuantity = Math.min(
          Math.max(cappedQuantity, existingItem.quantity),
          product.quantity,
        );

        await this.prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: mergedQuantity },
        });
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: item.productId,
            quantity: cappedQuantity,
          },
        });
      }
    }

    return this.getCart(userId);
  }

  /**
   * Returns a cart summary grouped by seller, with subtotals.
   * Used by the checkout flow.
   */
  async getCartSummary(userId: string) {
    const cart = await this.getCart(userId);

    if (cart.items.length === 0) {
      return {
        items: [],
        sellerGroups: [],
        totalItems: 0,
        totalCDF: BigInt(0),
      };
    }

    // Group items by seller
    const sellerMap = new Map<
      string,
      {
        sellerId: string;
        sellerName: string;
        items: typeof cart.items;
        subtotalCDF: bigint;
      }
    >();

    let totalCDF = BigInt(0);
    let totalItems = 0;

    for (const item of cart.items) {
      const sellerId = item.product.sellerId;
      const sellerName =
        item.product.seller?.sellerProfile?.businessName ?? 'Vendeur inconnu';

      if (!sellerMap.has(sellerId)) {
        sellerMap.set(sellerId, {
          sellerId,
          sellerName,
          items: [],
          subtotalCDF: BigInt(0),
        });
      }

      const group = sellerMap.get(sellerId)!;
      group.items.push(item);

      const itemTotal = item.product.priceCDF * BigInt(item.quantity);
      group.subtotalCDF += itemTotal;
      totalCDF += itemTotal;
      totalItems += item.quantity;
    }

    return {
      items: cart.items,
      sellerGroups: Array.from(sellerMap.values()),
      totalItems,
      totalCDF,
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  /**
   * Finds the user's cart or creates a new one.
   * Always includes full item details.
   */
  private async findOrCreateCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: CART_ITEM_INCLUDE,
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
        include: CART_ITEM_INCLUDE,
      });
    }

    return cart;
  }

  /**
   * Validates that a product exists, is ACTIVE, and not deleted.
   */
  private async validateProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        status: true,
        quantity: true,
        deletedAt: true,
      },
    });

    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('Produit non trouvé');
    }

    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Ce produit n\'est plus disponible');
    }

    return product;
  }
}
