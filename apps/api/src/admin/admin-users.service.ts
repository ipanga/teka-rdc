import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_QUEUES } from './admin-queues';
import { Prisma } from '@prisma/client';
import { SearchUsersDto } from './dto/search-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ReviewSellerDto } from './dto/review-seller.dto';
import { PostHogService } from '../analytics/posthog.service';
import { EmailService } from '../email/email.service';
import { SellerNotificationService } from '../notifications/seller-notification.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private prisma: PrismaService,
    private analytics: PostHogService,
    private email: EmailService,
    private sellerNotifications: SellerNotificationService,
    private cloudinary: CloudinaryService,
  ) {}

  /**
   * Short-lived signed URL to view an applicant's KYC document. The document
   * is stored privately (authenticated Cloudinary asset), so this signed URL
   * is the only way to view it; it is generated on demand, never persisted.
   */
  async getApplicationDocumentUrl(applicationId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { id: applicationId },
      select: { idDocumentCloudinaryId: true },
    });
    if (!profile) {
      throw new NotFoundException('Demande non trouvée');
    }
    if (!profile.idDocumentCloudinaryId) {
      throw new NotFoundException("Aucune pièce d'identité fournie");
    }
    return {
      url: this.cloudinary.getSignedImageUrl(profile.idDocumentCloudinaryId),
    };
  }

  async findAllUsers(query: SearchUsersDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role && { role: query.role as any }),
      ...(query.status && { status: query.status as any }),
      ...(query.search && {
        OR: [
          { phone: { contains: query.search } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
          {
            firstName: { contains: query.search, mode: 'insensitive' as const },
          },
          {
            lastName: { contains: query.search, mode: 'insensitive' as const },
          },
          // The Vendeurs search placeholder promises "boutique, nom ou
          // téléphone" — seller phone + shop name live on SellerProfile, not
          // User (email-registered sellers have User.phone = null).
          { sellerProfile: { phone: { contains: query.search } } },
          {
            sellerProfile: {
              businessName: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
          },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          phoneVerified: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          // Needed by the admin Vendeurs page to render KYC status + approve/
          // reject inline. Null for non-SELLER users; clients that don't need
          // this field can ignore it.
          sellerProfile: {
            select: {
              id: true,
              businessName: true,
              phone: true,
              applicationStatus: true,
              rejectionReason: true,
              city: { select: { id: true, name: true } },
              commune: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      include: {
        sellerProfile: {
          include: {
            city: { select: { id: true, name: true } },
            commune: { select: { id: true, name: true } },
          },
        },
        addresses: { where: { deletedAt: null } },
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const { passwordHash, ...rest } = user;
    return rest;
  }

  async updateUserStatus(userId: string, dto: UpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { status: dto.status as any },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
      },
    });
  }

  // Seller application management
  async findSellerApplications(query: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    // The PENDING filter IS the dashboard "À traiter" queue definition, so the
    // count on the dashboard and the rows on /dashboard/sellers?status=PENDING
    // can never disagree.
    const where: Prisma.SellerProfileWhereInput =
      query.status === 'PENDING'
        ? ADMIN_QUEUES.sellerApplicationsPending()
        : {
            deletedAt: null,
            ...(query.status && { applicationStatus: query.status as any }),
          };

    const [applications, total] = await Promise.all([
      this.prisma.sellerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              firstName: true,
              lastName: true,
              email: true,
              status: true,
              createdAt: true,
            },
          },
          city: { select: { id: true, name: true } },
          commune: { select: { id: true, name: true } },
        },
      }),
      this.prisma.sellerProfile.count({ where }),
    ]);

    return {
      data: applications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findSellerApplicationById(applicationId: string) {
    const application = await this.prisma.sellerProfile.findUnique({
      where: { id: applicationId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            email: true,
            createdAt: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Demande non trouvée');
    }

    return application;
  }

  async reviewSellerApplication(
    applicationId: string,
    adminId: string,
    dto: ReviewSellerDto,
  ) {
    const application = await this.prisma.sellerProfile.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Demande non trouvée');
    }

    if (application.applicationStatus !== 'PENDING') {
      throw new NotFoundException('Cette demande a déjà été traitée');
    }

    if (dto.decision === 'APPROVE') {
      const updated = await this.prisma.$transaction(async (tx) => {
        const profile = await tx.sellerProfile.update({
          where: { id: applicationId },
          data: {
            applicationStatus: 'APPROVED',
            approvedAt: new Date(),
            approvedById: adminId,
          },
        });

        await tx.user.update({
          where: { id: application.userId },
          data: { role: 'SELLER', status: 'ACTIVE' },
        });

        return profile;
      });

      // Server-owned admin event, attributed to the seller (distinctId =
      // the approved user) with the acting admin as a property.
      this.analytics.capture(application.userId, 'seller_approved', {
        applicationId,
        adminId,
      });

      // Notify the seller (email + push). Fire-and-forget — never block the
      // review response on a notification failure.
      void this.notifyApplicationDecision(application.userId, 'APPROVE');

      return updated;
    } else {
      const updated = await this.prisma.sellerProfile.update({
        where: { id: applicationId },
        data: {
          applicationStatus: 'REJECTED',
          rejectionReason: dto.reason || 'Demande rejetée',
          approvedById: adminId,
        },
      });

      this.analytics.capture(application.userId, 'seller_rejected', {
        applicationId,
        adminId,
      });

      void this.notifyApplicationDecision(
        application.userId,
        'REJECT',
        updated.rejectionReason ?? 'Demande rejetée',
      );

      return updated;
    }
  }

  /**
   * Sends the seller their application decision over email (Resend) + push
   * (FCM). Fire-and-forget: loads the user's email/firstName and dispatches
   * both channels, swallowing any failure so the admin review response is
   * never blocked. Push is keyed on userId; email is skipped if absent.
   */
  private async notifyApplicationDecision(
    userId: string,
    decision: 'APPROVE' | 'REJECT',
    reason?: string,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true },
      });

      if (decision === 'APPROVE') {
        void this.sellerNotifications.notifyApplicationApproved(userId);
        if (user?.email) {
          void this.email.sendSellerApplicationApproved(
            user.email,
            user.firstName ?? null,
          );
        }
      } else {
        const finalReason = reason || 'Demande rejetée';
        void this.sellerNotifications.notifyApplicationRejected(
          userId,
          finalReason,
        );
        if (user?.email) {
          void this.email.sendSellerApplicationRejected(
            user.email,
            user.firstName ?? null,
            finalReason,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to dispatch seller application ${decision} notification for ${userId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
