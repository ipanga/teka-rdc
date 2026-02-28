import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductStatus } from '@prisma/client';

@Injectable()
export class AdminProductsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns a paginated list of PENDING_REVIEW products
   * with first image, category, and seller info.
   */
  async findPendingProducts(page: number = 1, limit: number = 20) {
    page = Math.max(1, page);
    limit = Math.min(Math.max(1, limit), 100);
    const skip = (page - 1) * limit;

    const where = {
      status: ProductStatus.PENDING_REVIEW,
      deletedAt: null,
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
        },
        category: true,
        seller: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            email: true,
            sellerProfile: {
              select: {
                businessName: true,
                businessType: true,
                location: true,
                applicationStatus: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    return product;
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

    return this.prisma.product.update({
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

    return this.prisma.product.update({
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
  }
}
