import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

export interface CatalogResetReport {
  dryRun: boolean;
  productsTotal: number;
  /** Products eligible for deletion (no order history). */
  productsDeletable: number;
  /** Actually deleted (0 on a dry run). */
  productsDeleted: number;
  /** Skipped because an order line references them — order history is preserved. */
  productsSkippedWithOrders: number;
  /** Cloudinary public_ids purged after the DB delete committed. */
  cloudinaryAssetsPurged: number;
  /** Rows removed by ON DELETE CASCADE (reported for transparency). */
  cascade: {
    images: number;
    specifications: number;
    reviews: number;
    wishlistEntries: number;
    cartItems: number;
  };
  /** Promotion rows whose productId was nulled (ON DELETE SET NULL). */
  promotionsDetached: number;
}

/**
 * Pre-launch catalog wipe. Deletes every product that is NOT referenced by an
 * order line (those are kept so order history survives — `order_items.productId`
 * is intentionally `ON DELETE RESTRICT`). Product-related rows are removed by the
 * DB cascades hardened in the 2026-06-14 taxonomy/brand migration
 * (images / specifications / reviews / wishlists / cart_items → CASCADE;
 * promotions → SET NULL). The generated `search_vector` column clears itself on
 * row delete. Cloudinary assets are purged AFTER the DB delete commits, so a
 * crash leaves orphaned (cost-only) assets rather than dangling DB pointers.
 *
 * Irreversible. Exposed only through the `prisma/reset-catalog.ts` CLI script
 * (a deliberate operator action, like `db:seed`) — there is no HTTP endpoint.
 * Idempotent: a second run finds 0 deletable products and is a no-op.
 */
@Injectable()
export class CatalogResetService {
  private readonly logger = new Logger(CatalogResetService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async resetCatalog(
    opts: { dryRun?: boolean } = {},
  ): Promise<CatalogResetReport> {
    // Safe by default: an explicit `dryRun: false` is required to actually
    // delete. The CLI script passes `dryRun` explicitly (false only with
    // `--confirm`), so a bare `resetCatalog()` never destroys anything.
    const dryRun = opts.dryRun ?? true;

    // Products referenced by order history must be preserved (RESTRICT).
    const ordered = await this.prisma.orderItem.findMany({
      distinct: ['productId'],
      select: { productId: true },
    });
    const orderedIds = ordered.map((o) => o.productId);

    const productsTotal = await this.prisma.product.count();

    // Candidate set: every product NOT referenced by an order line.
    const deletable = await this.prisma.product.findMany({
      where: orderedIds.length ? { id: { notIn: orderedIds } } : {},
      select: { id: true, images: { select: { cloudinaryId: true } } },
    });
    const deletableIds = deletable.map((p) => p.id);
    const cloudinaryIds = deletable.flatMap((p) =>
      p.images.map((img) => img.cloudinaryId),
    );

    // Cascade-impact counts, scoped to the deletable set, for the report.
    const productFilter = { productId: { in: deletableIds } };
    const [
      images,
      specifications,
      reviews,
      wishlistEntries,
      cartItems,
      promotionsDetached,
    ] = deletableIds.length
      ? await Promise.all([
          this.prisma.productImage.count({ where: productFilter }),
          this.prisma.productSpecification.count({ where: productFilter }),
          this.prisma.review.count({ where: productFilter }),
          this.prisma.wishlist.count({ where: productFilter }),
          this.prisma.cartItem.count({ where: productFilter }),
          this.prisma.promotion.count({ where: productFilter }),
        ])
      : [0, 0, 0, 0, 0, 0];

    const report: CatalogResetReport = {
      dryRun,
      productsTotal,
      productsDeletable: deletableIds.length,
      productsDeleted: 0,
      productsSkippedWithOrders: orderedIds.length,
      cloudinaryAssetsPurged: 0,
      cascade: { images, specifications, reviews, wishlistEntries, cartItems },
      promotionsDetached,
    };

    if (dryRun || deletableIds.length === 0) {
      return report;
    }

    // DB first: a single deleteMany fires every ON DELETE cascade atomically.
    const deleted = await this.prisma.product.deleteMany({
      where: { id: { in: deletableIds } },
    });
    report.productsDeleted = deleted.count;

    // Cloudinary AFTER the DB commit — irreversible, never throws (cost-only).
    if (cloudinaryIds.length) {
      await this.cloudinary.deleteImages(cloudinaryIds);
      report.cloudinaryAssetsPurged = cloudinaryIds.length;
    }

    this.logger.warn(
      `Catalog reset: deleted ${report.productsDeleted} products ` +
        `(${report.productsSkippedWithOrders} kept for order history), ` +
        `purged ${report.cloudinaryAssetsPurged} Cloudinary assets.`,
    );

    return report;
  }
}
