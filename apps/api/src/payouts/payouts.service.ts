import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { verifyPassword } from '../auth/utils/password.util';

/** Minimum payout amount: 5 000 FC = 500 000 centimes */
export const MIN_PAYOUT_AMOUNT_CDF = BigInt(500000);

/**
 * Statuses that reserve the seller's payable funds. While one exists the
 * seller cannot open another request (D2 — PROCESSING included, matching the
 * clients). Mirrored by the partial unique index
 * `payouts_one_open_per_seller` in the 2026-09-04 migration.
 */
/**
 * S12 — after the seller changes the payout destination, payout requests are
 * refused for this long. A stolen session that redirects the destination
 * therefore cannot cash out before the seller sees the notice (feed + push +
 * email) and reacts. Existing payouts keep their snapshot; only NEW requests
 * wait.
 */
export const PAYOUT_METHOD_COOLING_OFF_MS = 24 * 60 * 60 * 1000;

/** `+243970000001` → `+243•••••01` — enough to recognise, never to dial. */
export function maskPayoutPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.length > 6
    ? `${phone.slice(0, 4)}•••••${phone.slice(-2)}`
    : '•••';
}

/** When payout requests reopen after a destination change; null = now. */
export function payoutsAvailableAt(
  changedAt: Date | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!changedAt) return null;
  const at = new Date(changedAt.getTime() + PAYOUT_METHOD_COOLING_OFF_MS);
  return at.getTime() > now.getTime() ? at : null;
}

export function formatDateTimeFr(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Africa/Lubumbashi',
  }).format(d);
}

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
    private rateLimit: RateLimitService,
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
            payoutMethodChangedAt: Date | null;
          }[]
        >`SELECT "id", "payoutMethod", "payoutPhone", "payoutMethodChangedAt" FROM "seller_profiles" WHERE "id" = ${sellerProfileId}::uuid FOR UPDATE`;
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

        // S12 — the SAVED profile destination is the only source of truth and
        // is snapshotted on the payout. A body destination is accepted solely
        // for backward compatibility with clients that still send one, and
        // only when it is exactly the saved one: a stolen session cannot route
        // money elsewhere by typing a number into the request.
        const payoutMethod = sellerProfile.payoutMethod;
        const payoutPhone = sellerProfile.payoutPhone;
        if (!payoutMethod || !payoutPhone) {
          throw new BadRequestException(
            'Veuillez enregistrer votre destination de retrait (mobile money) dans votre profil avant de demander un retrait.',
          );
        }
        if (
          (dto.payoutMethod !== undefined &&
            dto.payoutMethod !== payoutMethod) ||
          (dto.payoutPhone !== undefined && dto.payoutPhone !== payoutPhone)
        ) {
          throw new ConflictException(
            'La destination indiquée ne correspond pas à celle enregistrée sur votre profil. Mettez d’abord à jour votre destination de retrait (mot de passe requis), puis réessayez.',
          );
        }
        const availableAt = payoutsAvailableAt(
          sellerProfile.payoutMethodChangedAt,
        );
        if (availableAt) {
          throw new ConflictException(
            `Votre destination de retrait a été modifiée récemment. Par sécurité, les retraits sont à nouveau possibles à partir du ${formatDateTimeFr(availableAt)}.`,
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
    // Only after the conditional transition committed (a retry that finds
    // count = 0 threw 409 above and never reaches this line). A PROCESSING
    // payout means the operator had started the transfer → « Virement
    // échoué » for the seller instead of « refusée ».
    this.sellerNotifications
      .notifyPayoutRejected(payoutId, {
        failedTransfer: updated.previousStatus === PayoutStatus.PROCESSING,
      })
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
  ): Promise<Payout & { previousStatus: PayoutStatus }> {
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
        // 409: the payout is not in a state that accepts this transition —
        // either it never was, or another admin moved it first. Clients
        // refresh and show the current state instead of assuming success.
        const now = await tx.payout.findUnique({
          where: { id: payoutId },
          select: { status: true },
        });
        const allowed = t.from.map((s) => `"${s}"`).join(' ou ');
        const de = /^[aeiouhéè]/i.test(t.verb) ? 'd’' : 'de ';
        throw new ConflictException(
          `Impossible ${de}${t.verb} un retrait avec le statut "${now?.status ?? before.status}" (${PAYOUT_LABEL[now?.status ?? before.status]}). Seuls les retraits ${allowed} peuvent être ${t.verb === 'rejeter' ? 'rejetés' : 'traités ainsi'}.`,
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
      return { ...(after as Payout), previousStatus: before.status };
    });
  }

  /** The seller's saved payout destination (prefill). */
  async getPayoutMethod(sellerProfileId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { id: sellerProfileId },
      select: {
        payoutMethod: true,
        payoutPhone: true,
        payoutMethodChangedAt: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Profil vendeur non trouvé');
    }
    return this.payoutMethodView(profile);
  }

  /** Public shape of the saved destination + the S12 cooling-off state. */
  private payoutMethodView(profile: {
    payoutMethod: string | null;
    payoutPhone: string | null;
    payoutMethodChangedAt: Date | null;
  }) {
    return {
      payoutMethod: profile.payoutMethod,
      payoutPhone: profile.payoutPhone,
      changedAt: profile.payoutMethodChangedAt,
      // null = payout requests are open now; a date = wait until then.
      payoutsAvailableAt: payoutsAvailableAt(profile.payoutMethodChangedAt),
    };
  }

  /**
   * Set/update the seller's reusable payout destination (mobile money).
   *
   * S12: a sensitive financial action — the seller re-authenticates with the
   * CURRENT password (verified against the stored hash; a wrong password
   * counts in the shared `login` lock bucket by email, exactly like a failed
   * login), the change is made under the same row lock `requestPayout` takes
   * (so a request racing the change sees either the old destination or the
   * new one + its cooling-off, never a mix), stamps `payoutMethodChangedAt`,
   * writes an audit row (phones masked) atomically, and notifies the seller
   * on every channel after commit. An identical destination is a no-op: no
   * timestamp, no audit, no notice.
   */
  async updatePayoutMethod(
    sellerProfileId: string,
    userId: string,
    dto: UpdatePayoutMethodDto,
  ) {
    // Unchanged destination → no-op without re-auth (backward compatibility:
    // the distributed seller-mobile build re-saves the prefilled destination
    // before every request). Re-checked under the row lock below.
    const current = await this.prisma.sellerProfile.findUnique({
      where: { id: sellerProfileId },
      select: {
        payoutMethod: true,
        payoutPhone: true,
        payoutMethodChangedAt: true,
      },
    });
    if (!current) {
      throw new NotFoundException('Profil vendeur non trouvé');
    }
    if (
      current.payoutMethod === dto.payoutMethod &&
      current.payoutPhone === dto.payoutPhone
    ) {
      return this.payoutMethodView(current);
    }
    if (!dto.password) {
      throw new BadRequestException(
        'Le mot de passe est requis pour modifier la destination de retrait.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    // Brute force through this route shares the login lock (10 failures /
    // 15 min → 15 min lock, keyed on the email — never the password).
    const loginKey = user.email ?? user.id;
    await this.rateLimit.assertNotBlocked('login', loginKey);
    if (!user.passwordHash) {
      throw new BadRequestException('Aucun mot de passe défini sur le compte.');
    }
    const ok = await verifyPassword(dto.password, user.passwordHash);
    if (!ok) {
      await this.rateLimit.enforce('login', loginKey);
      // 403, not 401: every Teka client treats a 401 as an expired session
      // (refresh + replay), which would silently double the attempt count and
      // rotate the refresh token for nothing. The message is deliberately
      // generic — it reveals nothing about the account.
      throw new ForbiddenException('Mot de passe invalide.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        {
          id: string;
          payoutMethod: string | null;
          payoutPhone: string | null;
          payoutMethodChangedAt: Date | null;
        }[]
      >`SELECT "id", "payoutMethod", "payoutPhone", "payoutMethodChangedAt" FROM "seller_profiles" WHERE "id" = ${sellerProfileId}::uuid FOR UPDATE`;
      const before = locked[0];
      if (!before) {
        throw new NotFoundException('Profil vendeur non trouvé');
      }
      if (
        before.payoutMethod === dto.payoutMethod &&
        before.payoutPhone === dto.payoutPhone
      ) {
        return { changed: false as const, profile: before };
      }
      const now = new Date();
      const profile = await tx.sellerProfile.update({
        where: { id: sellerProfileId },
        data: {
          payoutMethod: dto.payoutMethod,
          payoutPhone: dto.payoutPhone,
          payoutMethodChangedAt: now,
        },
        select: {
          payoutMethod: true,
          payoutPhone: true,
          payoutMethodChangedAt: true,
        },
      });
      await this.audit.record(tx, {
        actorId: userId,
        action: 'PAYOUT_METHOD_CHANGED',
        entityType: 'seller_profile',
        entityId: sellerProfileId,
        before: {
          payoutMethod: before.payoutMethod,
          payoutPhone: maskPayoutPhone(before.payoutPhone),
        },
        after: {
          payoutMethod: profile.payoutMethod,
          payoutPhone: maskPayoutPhone(profile.payoutPhone),
          payoutMethodChangedAt: now.toISOString(),
        },
        reason: null,
      });
      return { changed: true as const, profile };
    });

    if (result.changed) {
      const view = this.payoutMethodView(result.profile);
      this.logger.log(
        `Payout method changed: seller=${sellerProfileId}, method=${result.profile.payoutMethod}`,
      );
      this.sellerNotifications
        .notifyPayoutMethodChanged(userId, {
          payoutMethod: result.profile.payoutMethod ?? '',
          maskedPhone: maskPayoutPhone(result.profile.payoutPhone) ?? '•••',
          changedAt: result.profile.payoutMethodChangedAt ?? new Date(),
          availableAt:
            view.payoutsAvailableAt ??
            new Date(Date.now() + PAYOUT_METHOD_COOLING_OFF_MS),
        })
        .catch((err) =>
          this.logger.error(
            'Échec notification changement de destination de retrait',
            err,
          ),
        );
      return view;
    }
    return this.payoutMethodView(result.profile);
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

  /**
   * One payout for its OWNER. The `sellerProfileId` in the WHERE is the
   * authorization: a payout id taken from a notification / deep link is never
   * trusted on its own — another seller's id, a deleted id or garbage all
   * answer the same 404 (no existence leak).
   */
  async getSellerPayoutById(sellerProfileId: string, payoutId: string) {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, sellerProfileId },
    });
    if (!payout) {
      throw new NotFoundException(
        'Ce virement est introuvable ou ne vous appartient pas.',
      );
    }
    return payout;
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

    // Decision context for the operator: the seller's current balances (so a
    // rejection or a clawback can be weighed), who did what and when, and the
    // audit trail. Actor ids on the row are plain uuids → resolve names once.
    const actorIds: string[] = [
      payout.approvedById,
      payout.processingById,
      payout.completedById,
      payout.rejectedById,
    ].filter((id): id is string => !!id);
    const [balances, auditTrail] = await Promise.all([
      this.earningsService.getBalances(payout.sellerProfileId),
      this.audit.listForEntity('payout', payoutId),
    ]);
    for (const a of auditTrail) actorIds.push(a.actorId);
    const uniqueActorIds = Array.from(new Set(actorIds));
    const actorRows = uniqueActorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: uniqueActorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const actorName = (id: string | null) => {
      if (!id) return null;
      const u = actorRows.find((r) => r.id === id);
      return u ? { id, firstName: u.firstName, lastName: u.lastName } : { id, firstName: null, lastName: null };
    };

    return {
      ...payout,
      balances: {
        availableCDF: balances.availableCDF.toString(),
        pendingCDF: balances.pendingCDF.toString(),
        totalEarnedCDF: balances.totalEarnedCDF.toString(),
        totalCommissionCDF: balances.totalCommissionCDF.toString(),
      },
      actors: {
        approvedBy: actorName(payout.approvedById),
        processingBy: actorName(payout.processingById),
        completedBy: actorName(payout.completedById),
        rejectedBy: actorName(payout.rejectedById),
      },
      auditTrail: auditTrail.map((a) => ({
        id: a.id,
        action: a.action,
        actorId: a.actorId,
        actorName: actorName(a.actorId),
        before: a.before,
        after: a.after,
        reason: a.reason,
        createdAt: a.createdAt,
      })),
    };
  }
}
