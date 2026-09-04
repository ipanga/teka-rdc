import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { formatFC } from '@teka/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { UpdatePayoutMethodDto } from './dto/update-payout-method.dto';
import { PayoutQueryDto } from './dto/payout-query.dto';
import { Payout, PayoutStatus, Prisma } from '@prisma/client';
import { SellerNotificationService } from '../notifications/seller-notification.service';
import { EarningsService } from '../payments/earnings.service';
import { AdminAuditService } from '../audit/admin-audit.service';

/** Minimum payout amount: 5 000 FC = 500 000 centimes */
export const MIN_PAYOUT_AMOUNT_CDF = BigInt(500000);

/**
 * Statuses that reserve the seller's payable funds. While one exists the
 * seller cannot open another request (D2 — PROCESSING included, matching the
 * clients). Mirrored by the partial unique index
 * `payouts_one_open_per_seller` in the 2026-09-04 migration.
 */
export const OPEN_PAYOUT_STATUSES: PayoutStatus[] = [
  PayoutStatus.REQUESTED,
  PayoutStatus.APPROVED,
  PayoutStatus.PROCESSING,
];

const PAYOUT_LABEL: Record<PayoutStatus, string> = {
  REQUESTED: 'demandé',
  APPROVED: 'approuvé',
  PROCESSING: 'en traitement',
  COMPLETED: 'payé',
  REJECTED: 'rejeté',
};

/**
 * Seller payout workflow.
 *
 * State machine (approve = authorization only; COMPLETED = cash actually sent
 * off-platform and confirmed with a reference):
 *
 *   REQUESTED ──approve──▶ APPROVED ──process──▶ PROCESSING ──complete──▶ COMPLETED
 *   REQUESTED | APPROVED | PROCESSING ──reject(reason)──▶ REJECTED  (earnings released)
 *   APPROVED ──complete──▶ COMPLETED
 *
 * Every transition is a conditional update (`where: { id, status: expected }`)
 * inside a transaction together with its audit row, so a concurrent or
 * retried call finds `count = 0` and fails instead of re-applying the
 * transition or re-notifying the seller.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private prisma: PrismaService,
    private sellerNotifications: SellerNotificationService,
    private earningsService: EarningsService,
    private audit: AdminAuditService,
  ) {}

  /**
   * Seller requests a payout of the whole available balance.
   *
   * Runs entirely inside one transaction that first takes a row lock on the
   * seller profile, so two concurrent requests from the same seller serialize:
   * the second one sees the first payout and gets a 409. The reservation
   * `updateMany` is guarded by `payoutId: null` and its count is compared to
   * the ids read under the lock — any mismatch rolls the whole request back.
   */
  async requestPayout(sellerProfileId: string, dto: RequestPayoutDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize per seller. (Also protects the eligible-earnings read.)
        const locked = await tx.$queryRaw<
          {
            id: string;
            payoutMethod: string | null;
            payoutPhone: string | null;
          }[]
        >`SELECT "id", "payoutMethod", "payoutPhone" FROM "seller_profiles" WHERE "id" = ${sellerProfileId}::uuid FOR UPDATE`;
        const sellerProfile = locked[0];
        if (!sellerProfile) {
          throw new NotFoundException('Profil vendeur non trouvé');
        }

        const existing = await tx.payout.findFirst({
          where: { sellerProfileId, status: { in: OPEN_PAYOUT_STATUSES } },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException(
            'Vous avez déjà une demande de retrait en cours. Veuillez attendre son traitement.',
          );
        }

        const eligible = await this.earningsService.getEligibleEarnings(
          sellerProfileId,
          tx,
        );
        const availableCDF = eligible.reduce(
          (sum, e) => sum + e.netAmountCDF,
          BigInt(0),
        );
        if (availableCDF < MIN_PAYOUT_AMOUNT_CDF) {
          throw new BadRequestException(
            `Le solde minimum pour un retrait est de ${formatFC(Number(MIN_PAYOUT_AMOUNT_CDF))}. Votre solde disponible est de ${formatFC(Number(availableCDF))}. Les revenus en attente sont libérés après la fenêtre de retour de 2 jours.`,
          );
        }

        // Destination: body wins, else the saved profile destination; snapshotted on the payout.
        const payoutMethod = dto.payoutMethod ?? sellerProfile.payoutMethod;
        const payoutPhone = dto.payoutPhone ?? sellerProfile.payoutPhone;
        if (!payoutMethod || !payoutPhone) {
          throw new BadRequestException(
            'Veuillez configurer votre méthode de paiement (mobile money) avant de demander un retrait.',
          );
        }

        const payout = await tx.payout.create({
          data: {
            sellerProfileId,
            amountCDF: availableCDF,
            currency: 'CDF',
            status: PayoutStatus.REQUESTED,
            payoutMethod,
            payoutPhone,
          },
        });

        const ids = eligible.map((e) => e.id);
        const reserved = await tx.sellerEarning.updateMany({
          where: {
            id: { in: ids },
            isPaid: false,
            payoutId: null,
            reversedAt: null,
          },
          data: { isPaid: true, payoutId: payout.id },
        });
        if (reserved.count !== ids.length) {
          // Some row was reserved or reversed between the read and the write —
          // impossible under the lock, but never let a payout claim money twice.
          throw new ConflictException(
            'Votre solde a changé pendant la demande. Veuillez réessayer.',
          );
        }

        this.logger.log(
          `Payout requested: id=${payout.id}, seller=${sellerProfileId}, amount=${availableCDF} centimes, earnings=${ids.length}`,
        );
        return payout;
      });
    } catch (err) {
      // The partial unique index (one open payout per seller) is the last line
      // of defence — surface it as the same 409 the pre-check produces.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Vous avez déjà une demande de retrait en cours. Veuillez attendre son traitement.',
        );
      }
      throw err;
    }
  }

  /** REQUESTED → APPROVED (authorization to pay; no money moves). */
  async approvePayout(payoutId: string, adminId: string) {
    const updated = await this.transition(payoutId, adminId, {
      from: [PayoutStatus.REQUESTED],
      to: PayoutStatus.APPROVED,
      data: { approvedAt: new Date(), approvedById: adminId },
      action: 'PAYOUT_APPROVED',
      verb: 'approuver',
    });
    this.sellerNotifications
      .notifyPayoutApproved(payoutId)
      .catch((err) =>
        this.logger.error('Échec notification retrait approuvé', err),
      );
    return updated;
  }

  /** APPROVED → PROCESSING (operator started the manual transfer). */
  async processPayout(payoutId: string, adminId: string) {
    return this.transition(payoutId, adminId, {
      from: [PayoutStatus.APPROVED],
      to: PayoutStatus.PROCESSING,
      data: { processingAt: new Date(), processingById: adminId },
      action: 'PAYOUT_PROCESSING',
      verb: 'mettre en traitement',
    });
  }

  /**
   * APPROVED | PROCESSING → COMPLETED: the operator sent the cash / mobile
   * money and confirms it with an external reference. Terminal. The seller is
   * told they were paid only here — never on approval.
   */
  async completePayout(
    payoutId: string,
    adminId: string,
    externalReference: string,
  ) {
    const updated = await this.transition(payoutId, adminId, {
      from: [PayoutStatus.APPROVED, PayoutStatus.PROCESSING],
      to: PayoutStatus.COMPLETED,
      data: {
        processedAt: new Date(),
        completedById: adminId,
        externalReference,
      },
      action: 'PAYOUT_COMPLETED',
      verb: 'finaliser',
      reason: externalReference,
    });
    this.sellerNotifications
      .notifyPayoutPaid(payoutId)
      .catch((err) =>
        this.logger.error('Échec notification retrait effectué', err),
      );
    return updated;
  }

  /**
   * REQUESTED | APPROVED | PROCESSING → REJECTED (D1: a failed transfer is
   * representable). Releases the reserved earnings back to the eligible pool
   * in the same transaction. Terminal.
   */
  async rejectPayout(payoutId: string, adminId: string, reason: string) {
    const updated = await this.transition(payoutId, adminId, {
      from: OPEN_PAYOUT_STATUSES,
      to: PayoutStatus.REJECTED,
      data: {
        rejectedAt: new Date(),
        rejectedById: adminId,
        rejectionReason: reason,
      },
      action: 'PAYOUT_REJECTED',
      verb: 'rejeter',
      reason,
      after: async (tx) => {
        const released = await tx.sellerEarning.updateMany({
          where: { payoutId },
          data: { isPaid: false, payoutId: null },
        });
        this.logger.log(
          `Payout rejected: id=${payoutId}, admin=${adminId}, released=${released.count} earnings`,
        );
      },
    });
    this.sellerNotifications
      .notifyPayoutRejected(payoutId)
      .catch((err) =>
        this.logger.error('Échec notification retrait refusé', err),
      );
    return updated;
  }

  /**
   * One guarded transition: conditional update + audit row in a transaction.
   * `count = 0` means the payout is missing or not in an accepted state — the
   * current row is re-read only to build the error message.
   */
  private async transition(
    payoutId: string,
    adminId: string,
    t: {
      from: PayoutStatus[];
      to: PayoutStatus;
      data: Prisma.PayoutUncheckedUpdateManyInput;
      action:
        | 'PAYOUT_APPROVED'
        | 'PAYOUT_PROCESSING'
        | 'PAYOUT_COMPLETED'
        | 'PAYOUT_REJECTED';
      verb: string;
      reason?: string;
      after?: (tx: Prisma.TransactionClient) => Promise<void>;
    },
  ): Promise<Payout> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.payout.findUnique({ where: { id: payoutId } });
      if (!before) {
        throw new NotFoundException('Demande de retrait non trouvée');
      }
      const result = await tx.payout.updateMany({
        where: { id: payoutId, status: { in: t.from } },
        data: { ...t.data, status: t.to },
      });
      if (result.count !== 1) {
        // Lost the race (or wrong state). Re-read for an accurate message.
        const now = await tx.payout.findUnique({
          where: { id: payoutId },
          select: { status: true },
        });
        const allowed = t.from.map((s) => `"${s}"`).join(' ou ');
        throw new BadRequestException(
          `Impossible de ${t.verb} un retrait avec le statut "${now?.status ?? before.status}" (${PAYOUT_LABEL[now?.status ?? before.status]}). Seuls les retraits ${allowed} peuvent être ${t.verb === 'rejeter' ? 'rejetés' : 'traités ainsi'}.`,
        );
      }
      if (t.after) await t.after(tx);
      const after = await tx.payout.findUnique({ where: { id: payoutId } });
      await this.audit.record(tx, {
        actorId: adminId,
        action: t.action,
        entityType: 'payout',
        entityId: payoutId,
        before: { status: before.status, amountCDF: before.amountCDF },
        after: after
          ? {
              status: after.status,
              amountCDF: after.amountCDF,
              externalReference: after.externalReference,
              rejectionReason: after.rejectionReason,
            }
          : null,
        reason: t.reason ?? null,
      });
      this.logger.log(
        `Payout ${before.status} → ${t.to}: id=${payoutId}, admin=${adminId}`,
      );
      return after as Payout;
    });
  }

  /** The seller's saved payout destination (prefill). */
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

  /** Set/update the seller's reusable payout destination (mobile money). */
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

  /** Seller's own payouts (paginated). */
  async listSellerPayouts(sellerProfileId: string, query: PayoutQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PayoutWhereInput = { sellerProfileId };
    if (query.status) where.status = query.status as PayoutStatus;

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

  /** All payouts (admin, paginated). */
  async listAllPayouts(query: PayoutQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PayoutWhereInput = {};
    if (query.status) where.status = query.status as PayoutStatus;

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
              user: { select: { firstName: true, lastName: true } },
            },
          },
          approvedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** One payout with its reserved earnings (admin). */
  async getPayoutById(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        sellerProfile: {
          select: {
            id: true,
            businessName: true,
            phone: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        approvedBy: { select: { firstName: true, lastName: true } },
        earnings: {
          select: {
            id: true,
            orderId: true,
            grossAmountCDF: true,
            commissionCDF: true,
            netAmountCDF: true,
            commissionRate: true,
            commissionSource: true,
            reversedAt: true,
            clawbackRequiredAt: true,
            createdAt: true,
            order: { select: { orderNumber: true } },
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
