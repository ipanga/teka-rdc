import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ProductStatus, Prisma } from '@prisma/client';
import { SellerNotificationService } from '../notifications/seller-notification.service';
import { PostHogService } from '../analytics/posthog.service';

@Injectable()
export class AdminProductsService {
  private readonly logger = new Logger(AdminProductsService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private sellerNotifications: SellerNotificationService,
    private analytics: PostHogService,
  ) {}

  /**
   * Returns a paginated list of products for admin oversight,
   * with first image, category, and seller info.
   *
   * When `status` is omitted, returns ALL products regardless of status —
   * the admin "Produits" page is a full catalogue view, not a moderation
   * queue. Pass `status=PENDING_REVIEW` to get the moderation subset.
   * Approve/Reject actions still gate on PENDING_REVIEW server-side.
   */
  async findProducts(
    page: number = 1,
    limit: number = 20,
    status?: string,
    search?: string,
    cityId?: string,
  ) {
    page = Math.max(1, page);
    limit = Math.min(Math.max(1, limit), 100);
    const skip = (page - 1) * limit;

    const allowedStatuses = Object.values(ProductStatus) as string[];
    const q = search?.trim();
    const insensitive = { mode: 'insensitive' as const };
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(status && allowedStatuses.includes(status)
        ? { status: status as ProductStatus }
        : {}),
      ...(cityId ? { cityId } : {}),
      // Marketplace admin search: product title/shortCode/id, seller
      // name + email, brand name, category name.
      ...(q && {
        OR: [
          { title: { contains: q, ...insensitive } },
          { shortCode: { equals: q, ...insensitive } },
          ...(/^[0-9a-f-]{36}$/i.test(q) ? [{ id: q }] : []),
          {
            seller: {
              OR: [
                { firstName: { contains: q, ...insensitive } },
                { lastName: { contains: q, ...insensitive } },
                { email: { contains: q, ...insensitive } },
              ],
            },
          },
          { brand: { name: { contains: q, ...insensitive } } },
          { category: { name: { contains: q, ...insensitive } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { displayOrder: 'asc' },
            take: 1,
          },
          category: {
            select: { id: true, name: true },
          },
          city: {
            select: { id: true, name: true },
          },
          seller: {
            select: {
              id: true,
              phone: true,
              firstName: true,
              lastName: true,
              sellerProfile: {
                select: { businessName: true },
              },
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Returns full product detail for admin review,
   * including images, specifications, category, and seller info.
   */
  async findProductForReview(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, deletedAt: null },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        specifications: {
          include: { attribute: true },
          orderBy: { attribute: { sortOrder: 'asc' } },
        },
        category: true,
        seller: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            sellerProfile: {
              select: {
                businessName: true,
                businessType: true,
                location: true,
                applicationStatus: true,
                avgRating: true,
                totalReviews: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Flatten `attribute.name` onto the spec, mirroring the buyer detail
    // endpoint — the admin product page reads `spec.name`, which the raw
    // Prisma include never provided.
    const { specifications, ...rest } = product;
    return {
      ...rest,
      specifications: specifications.map((s) => ({
        id: s.id,
        attributeId: s.attributeId,
        name: s.attribute.name,
        value: s.value,
        sortOrder: s.attribute.sortOrder,
      })),
    };
  }

  /**
   * Approves a product: PENDING_REVIEW → ACTIVE.
   */
  async approveProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    if (product.status !== ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Seuls les produits en attente de révision peuvent être approuvés',
      );
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        status: ProductStatus.ACTIVE,
        rejectionReason: null,
      },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        category: { select: { id: true, name: true } },
        seller: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Fire-and-forget — the service catches its own errors. Don't
    // await; admin endpoint shouldn't wait on FCM round-trip.
    void this.sellerNotifications.notifyProductApproved({
      id: updated.id,
      sellerId: updated.sellerId,
      title: updated.title,
    });

    // Server-owned moderation event, attributed to the product's seller.
    this.analytics.capture(updated.sellerId, 'product_moderated', {
      productId: updated.id,
      decision: 'approved',
    });

    return updated;
  }

  /**
   * Rejects a product: PENDING_REVIEW → REJECTED with reason.
   */
  async rejectProduct(productId: string, rejectionReason: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    if (product.status !== ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Seuls les produits en attente de révision peuvent être rejetés',
      );
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        status: ProductStatus.REJECTED,
        rejectionReason,
      },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        category: { select: { id: true, name: true } },
        seller: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    void this.sellerNotifications.notifyProductRejected(
      { id: updated.id, sellerId: updated.sellerId, title: updated.title },
      rejectionReason,
    );

    this.analytics.capture(updated.sellerId, 'product_moderated', {
      productId: updated.id,
      decision: 'rejected',
    });

    return updated;
  }

  /** Appends a status-transition to the audit log (never blocks the action). */
  private async logStatus(
    productId: string,
    fromStatus: ProductStatus | null,
    toStatus: ProductStatus,
    actorId: string | null,
    reason?: string,
  ): Promise<void> {
    try {
      await this.prisma.productStatusLog.create({
        data: {
          productId,
          fromStatus,
          toStatus,
          actorId,
          actorRole: 'ADMIN',
          reason,
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to write product status log: ${String(e)}`);
    }
  }

  private readonly adminSelect = {
    images: { orderBy: { displayOrder: 'asc' as const } },
    category: { select: { id: true, name: true } },
    seller: {
      select: { id: true, phone: true, firstName: true, lastName: true },
    },
  };

  /**
   * Suspends a published product (ACTIVE → SUSPENDED) — an admin takedown.
   * Hidden from buyers; only an admin can lift it. Notifies the seller.
   */
  async suspendProduct(productId: string, adminId: string, reason: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Produit non trouvé');
    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException(
        'Seul un produit actif peut être suspendu.',
      );
    }
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.SUSPENDED },
      include: this.adminSelect,
    });
    await this.logStatus(
      productId,
      ProductStatus.ACTIVE,
      ProductStatus.SUSPENDED,
      adminId,
      reason,
    );
    void this.sellerNotifications.notifyProductSuspended(
      { id: updated.id, sellerId: updated.sellerId, title: updated.title },
      reason,
    );
    this.analytics.capture(updated.sellerId, 'product_suspended', {
      productId: updated.id,
    });
    return updated;
  }

  /**
   * Restores a SUSPENDED or ARCHIVED product back to ACTIVE (admin authority).
   */
  async restoreProduct(productId: string, adminId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Produit non trouvé');
    if (
      product.status !== ProductStatus.SUSPENDED &&
      product.status !== ProductStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        'Seul un produit suspendu ou archivé peut être réactivé.',
      );
    }
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ACTIVE },
      include: this.adminSelect,
    });
    await this.logStatus(
      productId,
      product.status,
      ProductStatus.ACTIVE,
      adminId,
      'Réactivé par un administrateur',
    );
    this.analytics.capture(updated.sellerId, 'product_restored', {
      productId: updated.id,
    });
    return updated;
  }

  /**
   * Archives any product (admin → ARCHIVED). Distinct from suspend.
   */
  async archiveProduct(productId: string, adminId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Produit non trouvé');
    if (product.status === ProductStatus.ARCHIVED) {
      throw new BadRequestException('Ce produit est déjà archivé.');
    }
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ARCHIVED },
      include: this.adminSelect,
    });
    await this.logStatus(
      productId,
      product.status,
      ProductStatus.ARCHIVED,
      adminId,
      'Archivé par un administrateur',
    );
    this.analytics.capture(updated.sellerId, 'product_archived', {
      productId: updated.id,
    });
    return updated;
  }

  /**
   * Soft-deletes a product (sets deletedAt). Reversible at the DB level; hidden
   * everywhere (buyer filters already exclude deletedAt != null). Use the /hard
   * endpoint only to purge a product with no order history.
   */
  async softDeleteProduct(productId: string, adminId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Produit non trouvé');
    await this.prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date() },
    });
    await this.logStatus(
      productId,
      product.status,
      product.status,
      adminId,
      'Supprimé (soft-delete) par un administrateur',
    );
    return { id: productId, deleted: true };
  }

  /** Status-transition history for a product (admin audit view). */
  async getStatusHistory(productId: string) {
    return this.prisma.productStatusLog.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Permanently deletes a single product (any seller) and purges its Cloudinary
   * assets. Mirrors the seller-side hard-delete but is unscoped — for admin
   * catalog cleanup. Product-related rows are removed by the DB cascades
   * (images / specifications / reviews / wishlists / cart_items); promotions are
   * detached (SET NULL). Refuses products with order history — `order_items` is
   * `ON DELETE RESTRICT` to preserve order records; archive those instead.
   */
  async hardDeleteProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        images: { select: { cloudinaryId: true } },
        _count: { select: { orderItems: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    if (product._count.orderItems > 0) {
      throw new BadRequestException(
        'Ce produit a un historique de commandes et ne peut pas être ' +
          'supprimé définitivement. Archivez-le à la place.',
      );
    }

    const cloudinaryIds = product.images.map((img) => img.cloudinaryId);

    await this.prisma.product.delete({ where: { id: productId } });

    if (cloudinaryIds.length > 0) {
      await this.cloudinary.deleteImages(cloudinaryIds);
    }

    this.logger.warn(
      `Product ${productId} hard-deleted by admin ` +
        `(${cloudinaryIds.length} Cloudinary assets purged)`,
    );

    return { deleted: true, purgedAssets: cloudinaryIds.length };
  }
}
