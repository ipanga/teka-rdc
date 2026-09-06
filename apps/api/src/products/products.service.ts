import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { validateImageUpload } from '../common/uploads/image-upload';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { dedupeSpecificationsByName } from '../common/utils/product-specifications';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductCondition, ProductStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  generateProductSlug,
  generateShortCode,
} from '../common/utils/slugify';
import { PostHogService } from '../analytics/posthog.service';
import { AdminNotificationService } from '../notifications/admin-notification.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private analytics: PostHogService,
    private adminNotifications: AdminNotificationService,
  ) {}

  /**
   * Produce a product `shortCode` guaranteed unique against existing rows.
   * Retries on the (rare) base36 collision; bails after a sane cap.
   */
  private async generateUniqueShortCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateShortCode();
      const clash = await this.prisma.product.findUnique({
        where: { shortCode: code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    // 5 consecutive collisions in a 2.2B space is effectively impossible;
    // surface loudly rather than silently risk a unique-constraint throw.
    throw new Error('Failed to generate a unique product shortCode');
  }

  /** Throws 400 if the brand id doesn't resolve to a live brand. */
  private async assertBrandExists(brandId: string): Promise<void> {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, deletedAt: null },
      select: { id: true },
    });
    if (!brand) {
      throw new BadRequestException('Marque introuvable');
    }
  }

  /**
   * Enforces the discount rules: a promotional price (when set) must be > 0 and
   * strictly less than the corresponding regular price; a USD promo requires a
   * USD price. Throws 400 otherwise. The percentage is never stored/validated —
   * it is derived on display as round((price − discount) / price × 100).
   */
  private validateDiscount(
    priceCDF: bigint,
    priceUSD: bigint | null,
    discountPriceCDF: bigint | null,
    discountPriceUSD: bigint | null,
  ): void {
    if (discountPriceCDF !== null) {
      if (discountPriceCDF <= 0n) {
        throw new BadRequestException(
          'Le prix promotionnel doit être supérieur à 0.',
        );
      }
      if (discountPriceCDF >= priceCDF) {
        throw new BadRequestException(
          'Le prix promotionnel doit être inférieur au prix normal.',
        );
      }
    }
    if (discountPriceUSD !== null) {
      if (priceUSD === null) {
        throw new BadRequestException(
          'Un prix USD est requis pour définir une promotion en USD.',
        );
      }
      if (discountPriceUSD <= 0n || discountPriceUSD >= priceUSD) {
        throw new BadRequestException(
          'Le prix promotionnel USD doit être supérieur à 0 et inférieur au prix normal.',
        );
      }
    }
  }

  /**
   * Creates a new product in DRAFT status.
   */
  /**
   * Enforces the leaf-category invariant for product↔category assignment.
   *
   * The 3-level taxonomy (Catégorie → Sous-catégorie → Type de produit) attaches
   * attributes to the LEAF, and products are meant to link to the leaf. That was
   * documented but never enforced, so products drifted onto intermediate nodes —
   * where they pick up whatever legacy attribute rows those nodes still carry
   * (e.g. a men's shirt on « Mode > Homme » rendering "Type de peau").
   *
   * Deliberately a hard error rather than a silent re-map: a parent like
   * « Homme » contains shirts, trousers, shoes and accessories, so the correct
   * leaf CANNOT be inferred from the parent. The seller must choose.
   *
   * Only called when a category is being ASSIGNED (create, or an update that
   * actually changes categoryId). Legacy products already sitting on a non-leaf
   * node stay editable — price, stock, images and title edits never trip this.
   */
  private async assertLeafCategory(
    categoryId: string,
    categoryName: string,
  ): Promise<void> {
    const childCount = await this.prisma.category.count({
      where: { parentCategoryId: categoryId, deletedAt: null },
    });

    if (childCount > 0) {
      throw new BadRequestException(
        `« ${categoryName} » est une catégorie intermédiaire. Choisissez une sous-catégorie plus précise.`,
      );
    }
  }

  /**
   * Attribute ids an update is allowed to clear: those the API would serve for
   * the target category (leaf-only, same rule as getCategoryAttributes) plus any
   * the payload names outright. Legacy specifications pointing at attributes
   * outside this set are preserved — never silently deleted.
   */
  private async resolveReplaceableAttributeIds(
    categoryId: string,
    incomingAttributeIds: string[],
  ): Promise<string[]> {
    const childCount = await this.prisma.category.count({
      where: { parentCategoryId: categoryId, deletedAt: null },
    });

    const servable =
      childCount > 0
        ? []
        : await this.prisma.productAttribute.findMany({
            where: { categoryId },
            select: { id: true },
          });

    return [
      ...new Set([...servable.map((a) => a.id), ...incomingAttributeIds]),
    ];
  }

  async create(sellerId: string, dto: CreateProductDto) {
    // Validate category exists and is active
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    if (!category.isActive) {
      throw new BadRequestException("Cette catégorie n'est plus active");
    }

    await this.assertLeafCategory(category.id, category.name);

    // Validate brand if provided (clearer error than a Prisma FK violation).
    if (dto.brandId) {
      await this.assertBrandExists(dto.brandId);
    }

    // Validate seller has approved SellerProfile
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { userId: sellerId },
    });

    if (!sellerProfile || sellerProfile.applicationStatus !== 'APPROVED') {
      throw new ForbiddenException(
        'Votre profil vendeur doit être approuvé pour créer des produits',
      );
    }

    // Convert BigInt prices
    const priceCDF = BigInt(dto.priceCDF);
    const priceUSD = dto.priceUSD ? BigInt(dto.priceUSD) : undefined;

    // Optional promotional price (null = no promo). Validated < price below.
    const discountPriceCDF = dto.discountPriceCDF
      ? BigInt(dto.discountPriceCDF)
      : null;
    const discountPriceUSD = dto.discountPriceUSD
      ? BigInt(dto.discountPriceUSD)
      : null;
    this.validateDiscount(
      priceCDF,
      priceUSD ?? null,
      discountPriceCDF,
      discountPriceUSD,
    );

    // Derive cityId: explicit > seller profile > null
    const cityId = dto.cityId ?? sellerProfile.cityId ?? undefined;

    // Generate product ID, cosmetic city-independent slug, and a unique
    // resolver shortCode (the tail of the `/{ville}/{slug}-{shortCode}` URL).
    const productId = randomUUID();
    const slug = generateProductSlug(dto.title);
    const shortCode = await this.generateUniqueShortCode();

    const product = await this.prisma.product.create({
      data: {
        id: productId,
        slug,
        shortCode,
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        brandId: dto.brandId ?? undefined,
        sellerId,
        cityId,
        priceCDF,
        priceUSD,
        discountPriceCDF,
        discountPriceUSD,
        quantity: dto.quantity,
        // Deprecated field: defaults to NEW when the client omits it.
        condition: (dto.condition as ProductCondition) ?? ProductCondition.NEW,
        status: ProductStatus.DRAFT,
        specifications: dto.specifications?.length
          ? {
              create: dto.specifications.map((spec) => ({
                attributeId: spec.attributeId,
                value: spec.value,
              })),
            }
          : undefined,
      },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        specifications: {
          include: { attribute: true },
        },
        category: true,
      },
    });

    await this.logStatus(
      product.id,
      null,
      ProductStatus.DRAFT,
      sellerId,
      'SELLER',
      'Créé',
    );

    // Server-owned seller event (created in DRAFT). distinctId = seller.
    this.analytics.capture(sellerId, 'product_created', {
      productId: product.id,
      categoryId: product.categoryId,
      status: product.status,
    });

    return product;
  }

  /**
   * Dashboard counts for the seller's products, grouped by status in a single
   * query (vs. one paginated call per status). Excludes soft-deleted rows.
   * `total` is the sum across all live statuses.
   */
  async getSellerStats(sellerId: string) {
    const grouped = await this.prisma.product.groupBy({
      by: ['status'],
      where: { sellerId, deletedAt: null },
      _count: { _all: true },
    });
    const count = (s: ProductStatus) =>
      grouped.find((g) => g.status === s)?._count._all ?? 0;
    return {
      total: grouped.reduce((sum, g) => sum + g._count._all, 0),
      active: count(ProductStatus.ACTIVE),
      pendingReview: count(ProductStatus.PENDING_REVIEW),
      draft: count(ProductStatus.DRAFT),
      rejected: count(ProductStatus.REJECTED),
      suspended: count(ProductStatus.SUSPENDED),
      archived: count(ProductStatus.ARCHIVED),
    };
  }

  /**
   * Returns paginated list of seller's products with optional status filter.
   */
  async findSellerProducts(sellerId: string, query: ProductQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      sellerId,
      deletedAt: null,
      ...(query.status && { status: query.status as ProductStatus }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { shortCode: { equals: search, mode: 'insensitive' as const } },
          // Match a pasted full UUID exactly (ignored otherwise).
          ...(/^[0-9a-f-]{36}$/i.test(search) ? [{ id: search }] : []),
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
          // Town where the product is published/sold (seller product list column).
          city: {
            select: { id: true, name: true },
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
   * Returns a single product by ID, validating seller ownership.
   */
  async findById(sellerId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, sellerId, deletedAt: null },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        specifications: {
          include: { attribute: true },
        },
        category: true,
        brand: { select: { id: true, name: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Same canonical characteristics the buyer PDP and admin review page use:
    // foreign legacy rows stay stored and remain visible when they are the only
    // source, but a duplicate name collapses to the product's own-category row.
    // Without this the seller-mobile detail screen, which renders every row,
    // showed each characteristic twice after a category remediation.
    const { specifications, ...rest } = product;
    return {
      ...rest,
      specifications: dedupeSpecificationsByName(
        specifications,
        product.categoryId,
      ).map((s) => ({
        id: s.id,
        attributeId: s.attributeId,
        attributeName: s.attribute.name,
        name: s.attribute.name,
        value: s.value,
        sortOrder: s.attribute.sortOrder,
      })),
    };
  }

  // On a PUBLISHED product (status not DRAFT/REJECTED) sellers may adjust only
  // these fields — price, promo price and stock — with no re-review. Editing
  // content fields still requires the draft→review flow.
  private static readonly LIVE_EDITABLE_FIELDS = new Set([
    'priceCDF',
    'priceUSD',
    'discountPriceCDF',
    'discountPriceUSD',
    'quantity',
  ]);

  /**
   * Updates a product. DRAFT/REJECTED products are fully editable; published
   * products allow only price / promotional price / stock edits (no re-review).
   */
  async update(sellerId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, sellerId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // ARCHIVED / SUSPENDED products can't be edited in place — the seller must
    // restore an archive first, and only an admin can lift a suspension.
    if (
      product.status === ProductStatus.ARCHIVED ||
      product.status === ProductStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        product.status === ProductStatus.SUSPENDED
          ? 'Ce produit a été suspendu par un administrateur et ne peut pas être modifié.'
          : 'Restaurez ce produit avant de le modifier.',
      );
    }

    // Did a CONTENT field actually CHANGE value (not merely appear in the
    // payload)? Compares against the stored product so re-submitting an
    // unchanged title alongside a price edit does NOT trigger re-review.
    const contentChanged =
      (dto.title !== undefined && dto.title !== product.title) ||
      (dto.description !== undefined &&
        dto.description !== product.description) ||
      (dto.categoryId !== undefined &&
        dto.categoryId !== product.categoryId) ||
      (dto.brandId !== undefined &&
        (dto.brandId || null) !== product.brandId) ||
      (dto.condition !== undefined &&
        dto.condition !== product.condition) ||
      // Specifications are a set — any provided value counts as a content edit.
      dto.specifications !== undefined;

    // Re-review: a content edit to a PUBLISHED (ACTIVE) product sends it back to
    // moderation (PENDING_REVIEW). Price/discount/stock stay instant. A REJECTED
    // product's edit resets it to DRAFT (handled below). DRAFT/PENDING edits
    // don't change status.
    const reReview =
      product.status === ProductStatus.ACTIVE && contentChanged;

    // Validate category if changing
    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId, deletedAt: null },
      });

      if (!category) {
        throw new NotFoundException('Catégorie non trouvée');
      }

      if (!category.isActive) {
        throw new BadRequestException("Cette catégorie n'est plus active");
      }

      await this.assertLeafCategory(category.id, category.name);
    }

    // Validate brand if a (non-null) brand is being set.
    if (dto.brandId) {
      await this.assertBrandExists(dto.brandId);
    }

    // Convert BigInt prices if provided
    const priceCDF =
      dto.priceCDF !== undefined ? BigInt(dto.priceCDF) : undefined;
    const priceUSD =
      dto.priceUSD !== undefined ? BigInt(dto.priceUSD) : undefined;

    // Resolve the discount fields: an explicit key (incl. null to clear) wins,
    // otherwise keep the stored value. Then validate the resulting discount
    // against the resulting price — this also catches a price change that would
    // drop the regular price at/below an unchanged discount.
    const discountPriceCDF =
      dto.discountPriceCDF !== undefined
        ? dto.discountPriceCDF
          ? BigInt(dto.discountPriceCDF)
          : null
        : product.discountPriceCDF;
    const discountPriceUSD =
      dto.discountPriceUSD !== undefined
        ? dto.discountPriceUSD
          ? BigInt(dto.discountPriceUSD)
          : null
        : product.discountPriceUSD;
    this.validateDiscount(
      priceCDF ?? product.priceCDF,
      priceUSD ?? product.priceUSD,
      discountPriceCDF,
      discountPriceUSD,
    );

    // Specifications are replaced, but ONLY within the set the client could
    // actually see. The old code deleted every row for the product, so any
    // caller that posted `specifications` silently destroyed values it was
    // never served — which is exactly the legacy case: this product's stored
    // Taille/Couleur/Matière hang off attribute rows belonging to a DIFFERENT
    // category, so no seller form renders them, yet one quantity edit would
    // have wiped them.
    //
    // Replaceable = what the API would serve for the effective category
    // (leaf-only, mirroring getCategoryAttributes) ∪ whatever the payload
    // explicitly addresses. Everything else is preserved untouched.
    const effectiveCategoryId = dto.categoryId ?? product.categoryId;
    const replaceableAttributeIds =
      dto.specifications !== undefined
        ? await this.resolveReplaceableAttributeIds(
            effectiveCategoryId,
            dto.specifications.map((spec) => spec.attributeId),
          )
        : [];

    const updatedProduct = await this.prisma.$transaction(async (tx) => {
      if (dto.specifications !== undefined && replaceableAttributeIds.length) {
        await tx.productSpecification.deleteMany({
          where: { productId, attributeId: { in: replaceableAttributeIds } },
        });
      }

      return tx.product.update({
        where: { id: productId },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          // `null` clears the brand; a value sets it; undefined leaves it.
          ...(dto.brandId !== undefined && { brandId: dto.brandId || null }),
          ...(priceCDF !== undefined && { priceCDF }),
          ...(priceUSD !== undefined && { priceUSD }),
          // null clears the promo; a value sets it; undefined leaves it.
          ...(dto.discountPriceCDF !== undefined && { discountPriceCDF }),
          ...(dto.discountPriceUSD !== undefined && { discountPriceUSD }),
          ...(dto.quantity !== undefined && { quantity: dto.quantity }),
          ...(dto.condition !== undefined && {
            // Deprecated field: defaults to NEW when the client omits it.
        condition: (dto.condition as ProductCondition) ?? ProductCondition.NEW,
          }),
          // If product was rejected, reset to DRAFT on edit
          ...(product.status === ProductStatus.REJECTED && {
            status: ProductStatus.DRAFT,
            rejectionReason: null,
          }),
          // Content edit to a live product → back to moderation.
          ...(reReview && { status: ProductStatus.PENDING_REVIEW }),
          // Create new specifications if provided
          ...(dto.specifications?.length && {
            specifications: {
              create: dto.specifications.map((spec) => ({
                attributeId: spec.attributeId,
                value: spec.value,
              })),
            },
          }),
        },
        include: {
          images: { orderBy: { displayOrder: 'asc' } },
          specifications: {
            include: { attribute: true },
          },
          category: true,
        },
      });
    });

    // Audit + notify on any status transition triggered by this edit.
    if (reReview) {
      await this.logStatus(
        productId,
        ProductStatus.ACTIVE,
        ProductStatus.PENDING_REVIEW,
        sellerId,
        'SELLER',
        'Modification du contenu — nouvelle revue requise',
      );
      void this.adminNotifications.create({
        type: 'PRODUCT_SUBMITTED',
        title: 'Produit modifié à revalider',
        body: `« ${updatedProduct.title} » a été modifié et attend une nouvelle validation.`,
        entityType: 'product',
        entityId: updatedProduct.id,
      });
    } else if (product.status === ProductStatus.REJECTED) {
      await this.logStatus(
        productId,
        ProductStatus.REJECTED,
        ProductStatus.DRAFT,
        sellerId,
        'SELLER',
        'Modification après rejet',
      );
    }

    this.analytics.capture(sellerId, 'product_updated', {
      productId: updatedProduct.id,
      status: updatedProduct.status,
    });

    return updatedProduct;
  }

  /**
   * Appends a product status-transition to the audit log. Never blocks the
   * caller's action — a failed audit write is logged but swallowed.
   */
  private async logStatus(
    productId: string,
    fromStatus: ProductStatus | null,
    toStatus: ProductStatus,
    actorId: string | null,
    actorRole: 'SELLER' | 'ADMIN' | 'SYSTEM',
    reason?: string,
  ): Promise<void> {
    try {
      await this.prisma.productStatusLog.create({
        data: { productId, fromStatus, toStatus, actorId, actorRole, reason },
      });
    } catch (e) {
      this.logger.warn(`Failed to write product status log: ${String(e)}`);
    }
  }

  /**
   * Withdraws a product from review (PENDING_REVIEW → DRAFT). Owner-scoped.
   */
  async withdraw(sellerId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, sellerId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Produit non trouvé');
    if (product.status !== ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Seul un produit en attente de révision peut être retiré.',
      );
    }
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.DRAFT },
      include: { images: { orderBy: { displayOrder: 'asc' } }, category: true },
    });
    await this.logStatus(
      productId,
      ProductStatus.PENDING_REVIEW,
      ProductStatus.DRAFT,
      sellerId,
      'SELLER',
      'Retiré de la revue par le vendeur',
    );
    return updated;
  }

  /**
   * Restores an ARCHIVED product back to DRAFT so the seller can edit + resubmit.
   * Owner-scoped. (Admin-suspended products are NOT seller-restorable.)
   */
  async restore(sellerId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, sellerId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Produit non trouvé');
    if (product.status !== ProductStatus.ARCHIVED) {
      throw new BadRequestException(
        'Seul un produit archivé peut être restauré.',
      );
    }
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.DRAFT },
      include: { images: { orderBy: { displayOrder: 'asc' } }, category: true },
    });
    await this.logStatus(
      productId,
      ProductStatus.ARCHIVED,
      ProductStatus.DRAFT,
      sellerId,
      'SELLER',
      'Restauré depuis les archives',
    );
    return updated;
  }

  /**
   * Duplicates a product into a fresh DRAFT owned by the same seller: copies
   * title (+ " (copie)"), description, prices, category, brand, condition,
   * specifications and images. The clone always starts as a DRAFT (re-review
   * before it can go live), with its own shortCode + a 0 sales counter.
   */
  async duplicate(sellerId: string, productId: string) {
    const src = await this.prisma.product.findUnique({
      where: { id: productId, sellerId, deletedAt: null },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        specifications: true,
      },
    });
    if (!src) throw new NotFoundException('Produit non trouvé');

    const clone = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          sellerId,
          cityId: src.cityId,
          categoryId: src.categoryId,
          brandId: src.brandId,
          title: `${src.title} (copie)`,
          slug: src.slug,
          shortCode: await this.generateUniqueShortCode(),
          description: src.description,
          priceCDF: src.priceCDF,
          priceUSD: src.priceUSD,
          discountPriceCDF: src.discountPriceCDF,
          discountPriceUSD: src.discountPriceUSD,
          condition: src.condition,
          quantity: src.quantity,
          status: ProductStatus.DRAFT,
          specifications: {
            create: src.specifications.map((s) => ({
              attributeId: s.attributeId,
              value: s.value,
            })),
          },
          images: {
            create: src.images.map((img) => ({
              url: img.url,
              thumbnailUrl: img.thumbnailUrl,
              cloudinaryId: img.cloudinaryId,
              displayOrder: img.displayOrder,
            })),
          },
        },
        include: {
          images: { orderBy: { displayOrder: 'asc' } },
          category: true,
        },
      });
      return created;
    });

    await this.logStatus(
      clone.id,
      null,
      ProductStatus.DRAFT,
      sellerId,
      'SELLER',
      `Dupliqué depuis ${src.id}`,
    );
    this.analytics.capture(sellerId, 'product_duplicated', {
      productId: clone.id,
      sourceProductId: src.id,
    });
    return clone;
  }

  /**
   * Archives a product (soft status change, not soft delete).
   */
  async archive(sellerId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, sellerId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    const archived = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ARCHIVED },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        category: true,
      },
    });

    await this.logStatus(
      productId,
      product.status,
      ProductStatus.ARCHIVED,
      sellerId,
      'SELLER',
      'Archivé par le vendeur',
    );
    this.analytics.capture(sellerId, 'product_archived', {
      productId,
      from: product.status,
    });
    return archived;
  }

  /**
   * Submits a DRAFT product for admin review.
   */
  async submitForReview(sellerId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, sellerId, deletedAt: null },
      include: { images: true },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    if (product.status !== ProductStatus.DRAFT) {
      throw new BadRequestException(
        'Seuls les produits en brouillon peuvent être soumis pour révision',
      );
    }

    if (product.images.length === 0) {
      throw new BadRequestException(
        'Le produit doit avoir au moins une image avant la soumission',
      );
    }

    if (product.priceCDF <= BigInt(0)) {
      throw new BadRequestException('Le prix FC doit être supérieur à zéro');
    }

    const submitted = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.PENDING_REVIEW },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        specifications: {
          include: { attribute: true },
        },
        category: true,
      },
    });

    await this.logStatus(
      productId,
      ProductStatus.DRAFT,
      ProductStatus.PENDING_REVIEW,
      sellerId,
      'SELLER',
      'Soumis pour révision',
    );

    // Notify admins a product is awaiting moderation. Fire-and-forget — the
    // service swallows its own errors, so this never blocks the submission.
    void this.adminNotifications.create({
      type: 'PRODUCT_SUBMITTED',
      title: 'Nouveau produit à valider',
      body: `« ${submitted.title} » a été soumis et attend votre validation.`,
      entityType: 'product',
      entityId: submitted.id,
    });

    return submitted;
  }

  /**
   * Hard-deletes a product and purges its Cloudinary assets. Owner-scoped.
   * Bypasses the soft-delete path entirely — the Product row goes away and
   * the ProductImage FK cascade removes its image records. Cloudinary
   * destruction happens after the DB transaction so a network blip on
   * Cloudinary's side doesn't roll back the local delete (orphans are
   * recoverable via a sweep job; a stuck DB record is much worse).
   *
   * Safe re: order history because OrderItem snapshots product title +
   * image URL at order time — past orders keep their thumbnails even
   * after the source product is gone.
   */
  async hardDelete(sellerId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, sellerId },
      include: { images: { select: { cloudinaryId: true } } },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    const cloudinaryIds = product.images.map((img) => img.cloudinaryId);

    await this.prisma.product.delete({ where: { id: productId } });

    if (cloudinaryIds.length > 0) {
      await this.cloudinary.deleteImages(cloudinaryIds);
    }

    this.logger.log(
      `Product ${productId} hard-deleted by seller ${sellerId} ` +
        `(${cloudinaryIds.length} Cloudinary assets purged)`,
    );

    return { deleted: true, purgedAssets: cloudinaryIds.length };
  }

  /**
   * Uploads an image to a product via Cloudinary.
   */
  async uploadImage(
    sellerId: string,
    productId: string,
    file: Express.Multer.File,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, sellerId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Check max images
    const imageCount = await this.prisma.productImage.count({
      where: { productId },
    });

    if (imageCount >= 8) {
      throw new BadRequestException(
        'Le produit ne peut pas avoir plus de 8 images',
      );
    }

    // Size / content / metadata hardening shared with avatars (S8): multer
    // already refused anything above 5 MB while it streamed; here the bytes
    // are identified from their signature (an SVG or HTML declared as PNG can
    // never pass), the declared type must agree, and EXIF/XMP is stripped
    // before the image reaches a public Cloudinary URL.
    const validated = validateImageUpload(file, {
      allowGif: true,
      unsupportedMessage:
        "Format d'image non supporté. Formats acceptés : JPEG, PNG, WebP, GIF.",
    });

    // Upload to Cloudinary
    const uploadResult = await this.cloudinary.uploadImage(validated.buffer);

    // Get max display order
    const maxOrderImage = await this.prisma.productImage.findFirst({
      where: { productId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });

    const displayOrder = (maxOrderImage?.displayOrder ?? -1) + 1;

    // Create ProductImage record
    const image = await this.prisma.productImage.create({
      data: {
        productId,
        cloudinaryId: uploadResult.cloudinaryId,
        url: uploadResult.url,
        thumbnailUrl: uploadResult.thumbnailUrl,
        displayOrder,
      },
    });

    return image;
  }

  /**
   * Deletes an image from a product and Cloudinary.
   */
  async deleteImage(sellerId: string, productId: string, imageId: string) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
      include: {
        product: { select: { id: true, sellerId: true, deletedAt: true } },
      },
    });

    if (!image || image.product.deletedAt !== null) {
      throw new NotFoundException('Image non trouvée');
    }

    if (image.product.id !== productId || image.product.sellerId !== sellerId) {
      throw new NotFoundException('Image non trouvée');
    }

    // Delete from Cloudinary
    await this.cloudinary.deleteImage(image.cloudinaryId);

    // Delete record
    await this.prisma.productImage.delete({
      where: { id: imageId },
    });

    return { message: 'Image supprimée avec succès' };
  }
}
