import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { SearchUsersDto } from './dto/search-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ReviewSellerDto } from './dto/review-seller.dto';

@Injectable()
export class AdminUsersService {
  constructor(private prisma: PrismaService) {}

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
          { firstName: { contains: query.search, mode: 'insensitive' as const } },
          { lastName: { contains: query.search, mode: 'insensitive' as const } },
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
        sellerProfile: true,
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
  async findSellerApplications(query: { page?: number; limit?: number; status?: string }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.SellerProfileWhereInput = {
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
            select: { id: true, phone: true, firstName: true, lastName: true, email: true },
          },
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
          select: { id: true, phone: true, firstName: true, lastName: true, email: true, createdAt: true },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Demande non trouvée');
    }

    return application;
  }

  async reviewSellerApplication(applicationId: string, adminId: string, dto: ReviewSellerDto) {
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
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.sellerProfile.update({
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

        return updated;
      });
    } else {
      return this.prisma.sellerProfile.update({
        where: { id: applicationId },
        data: {
          applicationStatus: 'REJECTED',
          rejectionReason: dto.reason || 'Demande rejetée',
          approvedById: adminId,
        },
      });
    }
  }
}
