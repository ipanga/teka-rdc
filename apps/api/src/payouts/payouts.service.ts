import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { UpdatePayoutMethodDto } from './dto/update-payout-method.dto';
import { PayoutQueryDto } from './dto/payout-query.dto';
import { PayoutStatus } from '@prisma/client';
import { SellerNotificationService } from '../notifications/seller-notification.service';

/** Minimum payout amount: 5 000 CDF = 500 000 centimes */
const MIN_PAYOUT_AMOUNT_CDF = BigInt(500000);

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private prisma: PrismaService,
    private sellerNotifications: SellerNotificationService,
  ) {}

  /**
   * Request a payout for a seller.
   * Validates balance, checks for existing pending payouts,
   * and atomically creates the payout + marks earnings as paid.
   */
  async requestPayout(sellerProfileId: string, dto: RequestPayoutDto) {
    // Get current wallet balance + saved payout destination
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { id: sellerProfileId },
      select: {
        walletBalanceCDF: true,
        payoutMethod: true,
        payoutPhone: true,
      },
    });

    if (!sellerProfile) {
      throw new NotFoundException('Profil vendeur non trouvé');
    }

    if (sellerProfile.walletBalanceCDF < MIN_PAYOUT_AMOUNT_CDF) {
      throw new BadRequestException(
        `Le solde minimum pour un retrait est de 5 000 FC. Votre solde actuel est de ${Number(sellerProfile.walletBalanceCDF) / 100} FC`,
      );
    }

    // Check for existing pending payout (REQUESTED or APPROVED)
    const existingPayout = await this.prisma.payout.findFirst({
      where: {
        sellerProfileId,
        status: { in: [PayoutStatus.REQUESTED, PayoutStatus.APPROVED] },
      },
    });

    if (existingPayout) {
      throw new ConflictException(
        'Vous avez déjà une demande de retrait en cours. Veuillez attendre son traitement.',
      );
    }

    // Resolve the payout destination: the request body wins, falling back to
    // the seller's saved profile destination (B1). Reject if neither is set.
    const payoutMethod = dto.payoutMethod ?? sellerProfile.payoutMethod;
    const payoutPhone = dto.payoutPhone ?? sellerProfile.payoutPhone;
    if (!payoutMethod || !payoutPhone) {
      throw new BadRequestException(
        'Veuillez configurer votre méthode de paiement (mobile money) avant de demander un retrait.',
      );
    }

    // Calculate the payout amount from unpaid earnings
    const unpaidEarnings = await this.prisma.sellerEarning.findMany({
      where: {
        sellerProfileId,
        isPaid: false,
        payoutId: null,
      },
      select: { id: true, netAmountCDF: true },
    });

    const totalEarningsCDF = unpaidEarnings.reduce(
      (sum, e) => sum + e.netAmountCDF,
      BigInt(0),
    );

    // Use the wallet balance as the payout amount (it should match unpaid earnings)
    const payoutAmountCDF = sellerProfile.walletBalanceCDF;

    // Atomically: create payout, mark earnings as paid, decrement wallet
    const payout = await this.prisma.$transaction(async (tx) => {
      const newPayout = await tx.payout.create({
        data: {
          sellerProfileId,
          amountCDF: payoutAmountCDF,
          currency: 'CDF',
          status: PayoutStatus.REQUESTED,
          payoutMethod,
          payoutPhone,
        },
      });

      // Mark all unpaid earnings as paid and link to this payout
      if (unpaidEarnings.length > 0) {
        await tx.sellerEarning.updateMany({
          where: {
            id: { in: unpaidEarnings.map((e) => e.id) },
          },
          data: {
            isPaid: true,
            payoutId: newPayout.id,
          },
        });
      }

      // Decrement wallet balance
      await tx.sellerProfile.update({
        where: { id: sellerProfileId },
        data: {
          walletBalanceCDF: { decrement: payoutAmountCDF },
        },
      });

      return newPayout;
    });

    this.logger.log(
      `Payout requested: id=${payout.id}, seller=${sellerProfileId}, amount=${payoutAmountCDF} centimes`,
    );

    return payout;
  }

  /**
   * Approve a payout (admin action).
   */
  async approvePayout(payoutId: string, adminId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException('Demande de retrait non trouvée');
    }

    if (payout.status !== PayoutStatus.REQUESTED) {
      throw new BadRequestException(
        `Impossible d'approuver un retrait avec le statut "${payout.status}". Seuls les retraits avec le statut "REQUESTED" peuvent être approuvés.`,
      );
    }

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: adminId,
      },
    });

    this.logger.log(`Payout approved: id=${payoutId}, admin=${adminId}`);

    // Fire-and-forget: notify the seller (push primary + email fallback).
    this.sellerNotifications
      .notifyPayoutApproved(payoutId)
      .catch((err) =>
        this.logger.error('Échec notification retrait approuvé', err),
      );

    return updated;
  }

  /**
   * Reject a payout (admin action).
   * Restores earnings and wallet balance.
   */
  async rejectPayout(payoutId: string, adminId: string, reason: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        earnings: { select: { id: true } },
      },
    });

    if (!payout) {
      throw new NotFoundException('Demande de retrait non trouvée');
    }

    if (
      payout.status !== PayoutStatus.REQUESTED &&
      payout.status !== PayoutStatus.APPROVED
    ) {
      throw new BadRequestException(
        `Impossible de rejeter un retrait avec le statut "${payout.status}". Seuls les retraits avec le statut "REQUESTED" ou "APPROVED" peuvent être rejetés.`,
      );
    }

    const earningIds = payout.earnings.map((e) => e.id);

    await this.prisma.$transaction(async (tx) => {
      // Update payout status
      await tx.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.REJECTED,
          rejectionReason: reason,
        },
      });

      // Restore earnings: unmark as paid, remove payoutId link
      if (earningIds.length > 0) {
        await tx.sellerEarning.updateMany({
          where: { id: { in: earningIds } },
          data: {
            isPaid: false,
            payoutId: null,
          },
        });
      }

      // Restore wallet balance
      await tx.sellerProfile.update({
        where: { id: payout.sellerProfileId },
        data: {
          walletBalanceCDF: { increment: payout.amountCDF },
        },
      });
    });

    this.logger.log(
      `Payout rejected: id=${payoutId}, admin=${adminId}, reason="${reason}"`,
    );

    // Fire-and-forget: notify the seller their request was refused + recredited.
    this.sellerNotifications
      .notifyPayoutRejected(payoutId)
      .catch((err) =>
        this.logger.error('Échec notification retrait refusé', err),
      );

    const updated = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    return updated;
  }

  /**
   * Get the seller's saved payout destination (for prefilling the request UI).
   */
  async getPayoutMethod(sellerProfileId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { id: sellerProfileId },
      select: { payoutMethod: true, payoutPhone: true },
    });
    if (!profile) {
      throw new NotFoundException('Profil vendeur non trouvé');
    }
    return {
      payoutMethod: profile.payoutMethod,
      payoutPhone: profile.payoutPhone,
    };
  }

  /**
   * Set/update the seller's reusable payout destination (mobile money).
   */
  async updatePayoutMethod(
    sellerProfileId: string,
    dto: UpdatePayoutMethodDto,
  ) {
    const updated = await this.prisma.sellerProfile.update({
      where: { id: sellerProfileId },
      data: { payoutMethod: dto.payoutMethod, payoutPhone: dto.payoutPhone },
      select: { payoutMethod: true, payoutPhone: true },
    });
    this.logger.log(
      `Payout method updated: seller=${sellerProfileId}, method=${dto.payoutMethod}`,
    );
    return updated;
  }

  /**
   * Mark a payout as being processed (admin action). Optional intermediate
   * state for when the operator has started the manual transfer but not yet
   * confirmed it. APPROVED → PROCESSING. Does not touch wallet/earnings.
   */
  async processPayout(payoutId: string, adminId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException('Demande de retrait non trouvée');
    }

    if (payout.status !== PayoutStatus.APPROVED) {
      throw new BadRequestException(
        `Impossible de mettre en traitement un retrait avec le statut "${payout.status}". Seuls les retraits "APPROVED" peuvent passer en traitement.`,
      );
    }

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: PayoutStatus.PROCESSING },
    });

    this.logger.log(`Payout processing: id=${payoutId}, admin=${adminId}`);

    return updated;
  }

  /**
   * Complete a payout (admin action): the operator transferred the funds
   * out-of-band (mobile money / cash) and confirms it with an external
   * reference (e.g. an M-Pesa transaction id). APPROVED | PROCESSING →
   * COMPLETED — a terminal state. Sets processedAt + externalReference.
   *
   * The seller's earnings were already marked isPaid=true and the wallet
   * decremented at request time, so completion only flips the payout to its
   * final state (no wallet/earning change). Completing is the finance control
   * point: the operator only marks paid once the cash is actually sent.
   */
  async completePayout(
    payoutId: string,
    adminId: string,
    externalReference: string,
  ) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException('Demande de retrait non trouvée');
    }

    if (
      payout.status !== PayoutStatus.APPROVED &&
      payout.status !== PayoutStatus.PROCESSING
    ) {
      throw new BadRequestException(
        `Impossible de finaliser un retrait avec le statut "${payout.status}". Seuls les retraits "APPROVED" ou "PROCESSING" peuvent être finalisés.`,
      );
    }

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.COMPLETED,
        processedAt: new Date(),
        externalReference,
      },
    });

    this.logger.log(
      `Payout completed: id=${payoutId}, admin=${adminId}, ref="${externalReference}"`,
    );

    // Fire-and-forget: notify the seller they've been paid (push + email).
    this.sellerNotifications
      .notifyPayoutPaid(payoutId)
      .catch((err) =>
        this.logger.error('Échec notification retrait effectué', err),
      );

    return updated;
  }

  /**
   * List payouts for a specific seller (paginated).
   */
  async listSellerPayouts(sellerProfileId: string, query: PayoutQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { sellerProfileId };
    if (query.status) {
      where.status = query.status as PayoutStatus;
    }

    const [data, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * List all payouts across the platform (admin, paginated).
   */
  async listAllPayouts(query: PayoutQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.status) {
      where.status = query.status as PayoutStatus;
    }

    const [data, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sellerProfile: {
            select: {
              id: true,
              businessName: true,
              phone: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          approvedBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get a single payout by ID (admin).
   */
  async getPayoutById(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        sellerProfile: {
          select: {
            id: true,
            businessName: true,
            phone: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        approvedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        earnings: {
          select: {
            id: true,
            orderId: true,
            grossAmountCDF: true,
            commissionCDF: true,
            netAmountCDF: true,
            commissionRate: true,
            createdAt: true,
            order: {
              select: {
                orderNumber: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!payout) {
      throw new NotFoundException('Demande de retrait non trouvée');
    }

    return payout;
  }
}
