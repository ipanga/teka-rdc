import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatus, PayoutStatus, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { BuyerOtpService } from '../auth/buyer-otp.service';
import { verifyPassword } from '../auth/utils/password.util';
import { DeviceTokensService } from '../push/device-tokens.service';
import { EmailService } from '../email/email.service';
import { RequestAccountDeletionDto } from './dto/account-deletion.dto';

/** Days between a deletion request and permanent anonymization. */
const GRACE_PERIOD_DAYS = 30;

/**
 * Order statuses that block deletion — anything not yet terminal. Terminal =
 * DELIVERED / CANCELLED / RETURNED (see docs/order-workflow.md).
 */
const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_TEKA_PICKUP,
  OrderStatus.RECEIVED_AT_TEKA,
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
];

export interface DeletionStatus {
  pending: boolean;
  requestedAt: Date | null;
  scheduledAt: Date | null;
}

/**
 * Owns the 30-day pending-deletion lifecycle: request (with role-specific
 * re-auth + business safeguards), cancel, status, and the daily purge that
 * anonymizes accounts past their scheduled date.
 *
 * Reactivation (logging back in within the window) is handled at the two login
 * sites — AuthService.loginWithEmail + BuyerOtpService.verifyOtp — because those
 * live in AuthModule and clearing the two timestamps there avoids a module cycle.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly buyerOtpService: BuyerOtpService,
    private readonly deviceTokens: DeviceTokensService,
    private readonly emailService: EmailService,
  ) {}

  async getStatus(userId: string): Promise<DeletionStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletionRequestedAt: true, deletionScheduledAt: true },
    });
    return {
      pending: user?.deletionRequestedAt != null,
      requestedAt: user?.deletionRequestedAt ?? null,
      scheduledAt: user?.deletionScheduledAt ?? null,
    };
  }

  /**
   * Requests account deletion: re-auth → safeguards → schedule + revoke access.
   * The account stays usable only via a fresh login (which reactivates it);
   * everything else is signed out immediately.
   */
  async requestDeletion(
    userId: string,
    dto: RequestAccountDeletionDto,
  ): Promise<DeletionStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        role: true,
        phone: true,
        email: true,
        passwordHash: true,
        deletionRequestedAt: true,
        deletionScheduledAt: true,
        sellerProfile: { select: { id: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Compte introuvable.');
    }

    // Idempotent: an already-pending request just returns its status.
    if (user.deletionRequestedAt) {
      return {
        pending: true,
        requestedAt: user.deletionRequestedAt,
        scheduledAt: user.deletionScheduledAt,
      };
    }

    // Only buyers and sellers self-delete. Staff/admin accounts are managed
    // out-of-band and must not be removed through the app.
    if (user.role !== 'BUYER' && user.role !== 'SELLER') {
      throw new ForbiddenException(
        'Ce type de compte ne peut pas être supprimé depuis l’application.',
      );
    }

    await this.reauthenticate(user, dto);
    await this.assertNoBlockers(user);

    const now = new Date();
    const scheduledAt = new Date(
      now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { deletionRequestedAt: now, deletionScheduledAt: scheduledAt },
    });

    // Sign the account out everywhere + stop push. Reactivation happens on the
    // next successful login within the window.
    await this.authService.logout(user.id).catch((e) =>
      this.logger.warn(`revoke-all on deletion failed for ${user.id}: ${e}`),
    );
    await this.deviceTokens
      .deactivateAll(user.id)
      .catch((e) =>
        this.logger.warn(`device-token deactivate failed for ${user.id}: ${e}`),
      );

    if (user.email) {
      const formatted = scheduledAt.toLocaleDateString('fr-FR');
      this.emailService
        .sendAccountDeletionScheduled(user.email, formatted)
        .catch((e) =>
          this.logger.warn(`deletion email failed for ${user.id}: ${e}`),
        );
    }

    this.logger.log(
      `Account ${user.id} (${user.role}) scheduled for deletion on ${scheduledAt.toISOString()}`,
    );
    return { pending: true, requestedAt: now, scheduledAt };
  }

  /** Cancels a pending deletion (also implicitly done on next login). */
  async cancelDeletion(userId: string): Promise<DeletionStatus> {
    await this.prisma.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: { deletionRequestedAt: null, deletionScheduledAt: null },
    });
    return { pending: false, requestedAt: null, scheduledAt: null };
  }

  // ---------------------------------------------------------------------------
  // Re-authentication
  // ---------------------------------------------------------------------------

  private async reauthenticate(
    user: { role: string; phone: string | null; passwordHash: string | null },
    dto: RequestAccountDeletionDto,
  ): Promise<void> {
    if (user.role === 'BUYER') {
      if (!user.phone) {
        throw new BadRequestException(
          'Numéro de téléphone manquant sur le compte.',
        );
      }
      if (!dto.otpCode) {
        throw new BadRequestException(
          'Un code de confirmation WhatsApp est requis.',
        );
      }
      const ok = await this.buyerOtpService.verifyOtpInternal(
        user.phone,
        dto.otpCode,
      );
      if (!ok) {
        throw new UnauthorizedException('Code de confirmation invalide ou expiré.');
      }
      return;
    }

    // SELLER (and any password-based account): current password.
    if (!user.passwordHash) {
      throw new BadRequestException('Aucun mot de passe défini sur le compte.');
    }
    if (!dto.password) {
      throw new BadRequestException('Mot de passe requis pour confirmer.');
    }
    const ok = await verifyPassword(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Mot de passe invalide.');
    }
  }

  // ---------------------------------------------------------------------------
  // Business safeguards
  // ---------------------------------------------------------------------------

  /**
   * Blocks deletion while the account still has obligations: in-flight orders
   * (either side), open return requests, or — for sellers — unpaid earnings or a
   * pending payout. Throws a French, user-facing reason.
   */
  private async assertNoBlockers(user: {
    id: string;
    sellerProfile: { id: string } | null;
  }): Promise<void> {
    const activeOrder = await this.prisma.order.findFirst({
      where: {
        status: { in: ACTIVE_ORDER_STATUSES },
        OR: [{ buyerId: user.id }, { sellerId: user.id }],
      },
      select: { id: true },
    });
    if (activeOrder) {
      throw new BadRequestException(
        'Vous avez des commandes en cours. Attendez leur livraison ou leur annulation avant de supprimer votre compte.',
      );
    }

    const openReturn = await this.prisma.returnRequest.findFirst({
      where: {
        status: ReturnStatus.REQUESTED,
        deletedAt: null,
        OR: [{ buyerId: user.id }, { order: { sellerId: user.id } }],
      },
      select: { id: true },
    });
    if (openReturn) {
      throw new BadRequestException(
        'Une demande de retour est en cours de traitement. Elle doit être résolue avant la suppression.',
      );
    }

    if (user.sellerProfile) {
      const unpaidEarning = await this.prisma.sellerEarning.findFirst({
        where: { sellerProfileId: user.sellerProfile.id, isPaid: false },
        select: { id: true },
      });
      const pendingPayout = await this.prisma.payout.findFirst({
        where: {
          sellerProfileId: user.sellerProfile.id,
          status: { in: [PayoutStatus.REQUESTED, PayoutStatus.APPROVED] },
        },
        select: { id: true },
      });
      if (unpaidEarning || pendingPayout) {
        throw new BadRequestException(
          'Votre solde vendeur n’est pas encore réglé. Demandez et recevez votre virement avant de supprimer votre compte.',
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Purge / anonymize
  // ---------------------------------------------------------------------------

  /**
   * Daily purge: anonymizes accounts whose grace period has elapsed. Idempotent
   * and safe to run on multiple instances — each account is only touched while
   * `deletedAt IS NULL`. Accounts that regained a blocker (e.g. a late order)
   * are skipped and retried next run.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgePending(): Promise<void> {
    const due = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        deletionScheduledAt: { lte: new Date() },
        deletionRequestedAt: { not: null },
      },
      select: { id: true, sellerProfile: { select: { id: true } } },
      take: 500,
    });
    if (due.length === 0) return;

    this.logger.log(`Purge: ${due.length} account(s) due for anonymization`);
    let purged = 0;
    for (const user of due) {
      try {
        await this.assertNoBlockers(user);
      } catch {
        this.logger.warn(
          `Purge skipped for ${user.id} — outstanding obligation; will retry`,
        );
        continue;
      }
      await this.anonymize(user.id, user.sellerProfile?.id ?? null);
      purged++;
    }
    this.logger.log(`Purge complete: ${purged}/${due.length} anonymized`);
  }

  /**
   * Irreversibly anonymizes a user: releases the unique phone/email, scrubs PII,
   * soft-deletes the seller profile, and revokes all access. Orders, reviews and
   * financial records are RETAINED (anonymized by reference) for legal/accounting
   * obligations — never hard-deleted.
   */
  private async anonymize(
    userId: string,
    sellerProfileId: string | null,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          deletionRequestedAt: null,
          deletionScheduledAt: null,
          // Release unique constraints + scrub PII.
          email: null,
          phone: null,
          googleId: null,
          passwordHash: null,
          avatar: null,
          firstName: 'Compte',
          lastName: 'supprimé',
        },
      });
      if (sellerProfileId) {
        await tx.sellerProfile.update({
          where: { id: sellerProfileId },
          data: { deletedAt: now },
        });
      }
      await tx.deviceToken.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    this.logger.log(`Account ${userId} anonymized`);
  }
}
