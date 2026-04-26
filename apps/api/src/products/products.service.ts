import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductCondition, ProductStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { generateProductSlug } from '../common/utils/slugify';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  /**
   * Creates a new product in DRAFT status.
   */
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

    // Derive cityId: explicit > seller profile > null
    const cityId = dto.cityId ?? sellerProfile.cityId ?? undefined;

    // Generate product ID and SEO slug
    const productId = randomUUID();
    const slug = generateProductSlug(dto.title, productId);

    const product = await this.prisma.product.create({
      data: {
        id: productId,
        slug,
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        sellerId,
        cityId,
        priceCDF,
        priceUSD,
        quantity: dto.quantity,
        condition: dto.condition as ProductCondition,
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

    return product;
  }

  /**
   * Returns paginated list of seller's products with optional status filter.
   */
  async findSellerProducts(sellerId: string, query: ProductQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      sellerId,
      deletedAt: null,
      ...(query.status && { status: query.status as ProductStatus }),
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
      },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    return product;
  }

  /**
   * Updates a product. Only DRAFT or REJECTED products can be edited.
   */
  async update(sellerId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, sellerId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    if (
      product.status !== ProductStatus.DRAFT &&
      product.status !== ProductStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Seuls les produits en brouillon ou rejetés peuvent être modifiés',
      );
    }

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
    }

    // Convert BigInt prices if provided
    const priceCDF =
      dto.priceCDF !== undefined ? BigInt(dto.priceCDF) : undefined;
    const priceUSD =
      dto.priceUSD !== undefined ? BigInt(dto.priceUSD) : undefined;

    // Handle specifications update: delete old ones and create new ones
    const specOps =
      dto.specifications !== undefined
        ? [
            this.prisma.productSpecification.deleteMany({
              where: { productId },
            }),
          ]
        : [];

    const updatedProduct = await this.prisma.$transaction(async (tx) => {
      // Delete old specifications if new ones are provided
      if (dto.specifications !== undefined) {
        await tx.productSpecification.deleteMany({
          where: { productId },
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
          ...(priceCDF !== undefined && { priceCDF }),
          ...(priceUSD !== undefined && { priceUSD }),
          ...(dto.quantity !== undefined && { quantity: dto.quantity }),
          ...(dto.condition !== undefined && {
            condition: dto.condition as ProductCondition,
          }),
          // If product was rejected, reset to DRAFT on edit
          ...(product.status === ProductStatus.REJECTED && {
            status: ProductStatus.DRAFT,
            rejectionReason: null,
          }),
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

    return updatedProduct;
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
      throw new BadRequestException('Le prix CDF doit être supérieur à zéro');
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

    return submitted;
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

    // Validate file size (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException(
        "La taille de l'image ne doit pas dépasser 5 Mo",
      );
    }

    // Upload to Cloudinary
    const uploadResult = await this.cloudinary.uploadImage(file.buffer);

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
