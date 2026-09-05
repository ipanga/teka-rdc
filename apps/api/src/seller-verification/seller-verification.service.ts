import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SellerDocument,
  SellerDocumentStatus,
  SellerDocumentType,
  SellerVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { SellerNotificationService } from '../notifications/seller-notification.service';
import { SellerDocumentStorageService } from './seller-document-storage.service';
import { UploadSellerDocumentDto } from './dto/upload-seller-document.dto';
import { isMaterialType, missingDocumentTypes, requiredDocumentTypes } from './requirements';

/** What a SELLER (or SUPPORT) may see about one document — no storage ids. */
export interface SellerDocumentView {
  id: string;
  type: SellerDocumentType;
  label: string | null;
  status: SellerDocumentStatus;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
}

export function toSellerDocumentView(d: SellerDocument): SellerDocumentView {
  return {
    id: d.id,
    type: d.type,
    label: d.label,
    status: d.status,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    originalName: d.originalName,
    submittedAt: d.submittedAt,
    reviewedAt: d.reviewedAt,
    rejectionReason: d.rejectionReason,
  };
}

const LIVE_STATUSES: SellerDocumentStatus[] = [
  SellerDocumentStatus.PENDING,
  SellerDocumentStatus.ACCEPTED,
];

const VERIFICATION_SELECT = {
  id: true,
  userId: true,
  businessName: true,
  businessType: true,
  verificationStatus: true,
  verificationSubmittedAt: true,
  verifiedAt: true,
  verifiedById: true,
  verificationRejectedAt: true,
  verificationRevokedAt: true,
  verificationNote: true,
} as const;

/**
 * Seller verification lifecycle (D1/D5):
 *   NOT_SUBMITTED → PENDING_REVIEW (seller: required document set complete)
 *   PENDING_REVIEW → VERIFIED | REJECTED (admin)
 *   REJECTED → PENDING_REVIEW (seller re-submits) | VERIFIED (admin re-review)
 *   VERIFIED → REJECTED (admin revoke, `verificationRevokedAt`)
 *   VERIFIED → PENDING_REVIEW (seller replaces a material document)
 * Separate from `applicationStatus`; nothing here touches the account.
 * Every admin transition is a conditional `updateMany` + audit row in ONE
 * transaction (409 on a stale request); notifications run after commit and
 * never affect the outcome.
 */
@Injectable()
export class SellerVerificationService {
  private readonly logger = new Logger(SellerVerificationService.name);

  constructor(
    private prisma: PrismaService,
    private storage: SellerDocumentStorageService,
    private audit: AdminAuditService,
    private notifications: SellerNotificationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Seller side
  // ---------------------------------------------------------------------------

  private async ownProfile(userId: string) {
    const profile = await this.prisma.sellerProfile.findFirst({
      where: { userId, deletedAt: null },
      select: VERIFICATION_SELECT,
    });
    if (!profile) throw new NotFoundException('Profil vendeur non trouvé');
    return profile;
  }

  /** The seller's own status + current (non-superseded) documents. */
  async getOwnStatus(userId: string) {
    const profile = await this.ownProfile(userId);
    const docs = await this.prisma.sellerDocument.findMany({
      where: { sellerProfileId: profile.id, status: { not: SellerDocumentStatus.SUPERSEDED } },
      orderBy: { submittedAt: 'desc' },
    });
    const live = docs.filter((d) => LIVE_STATUSES.includes(d.status)).map((d) => d.type);
    return {
      verificationStatus: profile.verificationStatus,
      verificationSubmittedAt: profile.verificationSubmittedAt,
      verifiedAt: profile.verifiedAt,
      verificationRejectedAt: profile.verificationRejectedAt,
      verificationRevokedAt: profile.verificationRevokedAt,
      // The admin's reason is shown to the seller only for reject/revoke.
      verificationNote:
        profile.verificationStatus === SellerVerificationStatus.REJECTED ? profile.verificationNote : null,
      businessType: profile.businessType,
      requiredTypes: requiredDocumentTypes(profile.businessType),
      missingTypes: missingDocumentTypes(profile.businessType, live),
      // Authoritative upload limits so clients never advertise a rule that
      // drifts from the server (PR 3 contract).
      limits: {
        maxSizeBytes: this.storage.maxBytes,
        acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      },
      documents: docs.map(toSellerDocumentView),
    };
  }

  /**
   * Upload one document for the caller's OWN profile (ownership is the
   * userId → profile lookup; a client can never name another seller).
   * Replaces any live document of the same type (SUPERSEDED, retention
   * clock started). Moves the seller to PENDING_REVIEW when the required set
   * is complete, or back to PENDING_REVIEW when a VERIFIED seller replaces
   * material evidence (D5). A seller can never reach VERIFIED here.
   */
  async submitDocument(userId: string, dto: UploadSellerDocumentDto, file: Express.Multer.File) {
    const profile = await this.ownProfile(userId);
    if (dto.type === SellerDocumentType.OTHER && !dto.label?.trim()) {
      throw new BadRequestException('Précisez le type de document');
    }
    const label = dto.label?.trim() || null;

    const doc = await this.storage.createAndUpload({
      sellerProfileId: profile.id,
      type: dto.type,
      label,
      file,
    });

    let outcome: { statusChanged: boolean; next: SellerVerificationStatus };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const previous = await tx.sellerDocument.findMany({
          where: {
            sellerProfileId: profile.id,
            type: dto.type,
            id: { not: doc.id },
            status: { in: [SellerDocumentStatus.PENDING, SellerDocumentStatus.ACCEPTED, SellerDocumentStatus.REJECTED] },
          },
          select: { id: true, status: true },
        });
        if (previous.length > 0) {
          await tx.sellerDocument.updateMany({
            where: { id: { in: previous.map((p) => p.id) } },
            data: {
              status: SellerDocumentStatus.SUPERSEDED,
              supersededAt: now,
              supersededById: doc.id,
              purgeAfter: this.storage.retentionDeadline(now),
            },
          });
        }
        await tx.sellerDocument.update({ where: { id: doc.id }, data: { uploadedAt: now } });

        const live = await tx.sellerDocument.findMany({
          where: { sellerProfileId: profile.id, status: { in: LIVE_STATUSES } },
          select: { type: true },
        });
        const missing = missingDocumentTypes(profile.businessType, live.map((l) => l.type));
        const replacedAccepted = previous.some((p) => p.status === SellerDocumentStatus.ACCEPTED);
        let next = profile.verificationStatus;
        if (
          profile.verificationStatus === SellerVerificationStatus.VERIFIED &&
          replacedAccepted &&
          isMaterialType(profile.businessType, dto.type)
        ) {
          next = SellerVerificationStatus.PENDING_REVIEW;
        } else if (
          (profile.verificationStatus === SellerVerificationStatus.NOT_SUBMITTED ||
            profile.verificationStatus === SellerVerificationStatus.REJECTED) &&
          missing.length === 0
        ) {
          next = SellerVerificationStatus.PENDING_REVIEW;
        }

        await this.audit.record(tx, {
          actorId: userId,
          action: previous.length > 0 ? 'SELLER_DOCUMENT_REPLACED' : 'SELLER_DOCUMENT_SUBMITTED',
          entityType: 'seller_profile',
          entityId: profile.id,
          after: { documentId: doc.id, type: dto.type, label, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, replaced: previous.map((p) => p.id) },
        });

        const statusChanged = next !== profile.verificationStatus;
        if (statusChanged) {
          await tx.sellerProfile.update({
            where: { id: profile.id },
            data: { verificationStatus: next, verificationSubmittedAt: now },
          });
          await this.audit.record(tx, {
            actorId: userId,
            action: 'SELLER_VERIFICATION_SUBMITTED',
            entityType: 'seller_profile',
            entityId: profile.id,
            before: { verificationStatus: profile.verificationStatus },
            after: { verificationStatus: next },
          });
        }
        return { statusChanged, next };
      });
    } catch (error) {
      // Domain write failed after a successful upload: no asset without a
      // committed row. The row itself is deleted by discard().
      await this.storage.discard(doc);
      throw error;
    }

    if (outcome.statusChanged) {
      void this.notifications
        .notifyVerification(profile.userId, 'submitted')
        .catch((e) => this.logger.error(`verification notify failed: ${e}`));
    }
    return this.getOwnStatus(userId);
  }

  // ---------------------------------------------------------------------------
  // Admin side
  // ---------------------------------------------------------------------------

  private async adminProfile(sellerProfileId: string) {
    const profile = await this.prisma.sellerProfile.findFirst({
      where: { id: sellerProfileId, deletedAt: null },
      select: VERIFICATION_SELECT,
    });
    if (!profile) throw new NotFoundException('Vendeur non trouvé');
    return profile;
  }

  /**
   * Status, every document (incl. superseded, with retention stamps) and the
   * audit history. Safe for SUPPORT too: no storage id, no URL.
   */
  async getForAdmin(sellerProfileId: string) {
    const profile = await this.adminProfile(sellerProfileId);
    const [docs, history] = await Promise.all([
      this.prisma.sellerDocument.findMany({
        where: { sellerProfileId },
        orderBy: { submittedAt: 'desc' },
      }),
      this.audit.listForEntity('seller_profile', sellerProfileId),
    ]);
    const live = docs.filter((d) => LIVE_STATUSES.includes(d.status)).map((d) => d.type);
    return {
      sellerProfileId,
      businessName: profile.businessName,
      businessType: profile.businessType,
      verificationStatus: profile.verificationStatus,
      verificationSubmittedAt: profile.verificationSubmittedAt,
      verifiedAt: profile.verifiedAt,
      verifiedById: profile.verifiedById,
      verificationRejectedAt: profile.verificationRejectedAt,
      verificationRevokedAt: profile.verificationRevokedAt,
      verificationNote: profile.verificationNote,
      requiredTypes: requiredDocumentTypes(profile.businessType),
      missingTypes: missingDocumentTypes(profile.businessType, live),
      documents: docs.map((d) => ({
        ...toSellerDocumentView(d),
        reviewedById: d.reviewedById,
        supersededAt: d.supersededAt,
        supersededById: d.supersededById,
        purgeAfter: d.purgeAfter,
        purgedAt: d.purgedAt,
        uploadedAt: d.uploadedAt,
      })),
      history: history.filter((h) => h.action.startsWith('SELLER_')),
    };
  }

  /**
   * ADMIN only: on-demand, expiry-enforced download link + audit row. Never
   * persisted, never returned to any other role.
   */
  async documentAccessUrl(adminId: string, sellerProfileId: string, documentId: string) {
    await this.adminProfile(sellerProfileId);
    const doc = await this.prisma.sellerDocument.findFirst({
      where: { id: documentId, sellerProfileId },
    });
    if (!doc || !doc.uploadedAt) throw new NotFoundException('Document non trouvé');
    if (doc.purgedAt) throw new GoneException('Document supprimé (rétention expirée)');
    const link = this.storage.downloadUrl(doc);
    await this.audit.record(this.prisma, {
      actorId: adminId,
      action: 'SELLER_DOCUMENT_VIEWED',
      entityType: 'seller_profile',
      entityId: sellerProfileId,
      after: { documentId: doc.id, type: doc.type, expiresInSeconds: link.expiresInSeconds },
    });
    return { ...link, mimeType: doc.mimeType, originalName: doc.originalName };
  }

  async approve(adminId: string, sellerProfileId: string, note?: string) {
    return this.transition(adminId, sellerProfileId, {
      from: [SellerVerificationStatus.PENDING_REVIEW, SellerVerificationStatus.REJECTED],
      to: SellerVerificationStatus.VERIFIED,
      action: 'SELLER_VERIFICATION_APPROVED',
      reason: note ?? null,
      data: (now) => ({ verifiedAt: now, verifiedById: adminId, verificationNote: note ?? null }),
      documents: async (tx, now) => {
        await tx.sellerDocument.updateMany({
          where: { sellerProfileId, status: SellerDocumentStatus.PENDING },
          data: { status: SellerDocumentStatus.ACCEPTED, reviewedAt: now, reviewedById: adminId },
        });
      },
      event: 'verified',
    });
  }

  async reject(adminId: string, sellerProfileId: string, reason?: string) {
    if (!reason?.trim()) throw new BadRequestException('La raison du refus est requise');
    return this.transition(adminId, sellerProfileId, {
      from: [SellerVerificationStatus.PENDING_REVIEW],
      to: SellerVerificationStatus.REJECTED,
      action: 'SELLER_VERIFICATION_REJECTED',
      reason,
      data: (now) => ({ verificationRejectedAt: now, verificationNote: reason }),
      documents: async (tx, now) => {
        await tx.sellerDocument.updateMany({
          where: { sellerProfileId, status: SellerDocumentStatus.PENDING },
          data: {
            status: SellerDocumentStatus.REJECTED,
            rejectionReason: reason,
            reviewedAt: now,
            reviewedById: adminId,
            purgeAfter: this.storage.retentionDeadline(now),
          },
        });
      },
      event: 'rejected',
    });
  }

  /** Badge removed; the account and the accepted evidence are untouched (D1/D7). */
  async revoke(adminId: string, sellerProfileId: string, reason?: string) {
    if (!reason?.trim()) throw new BadRequestException('La raison de la révocation est requise');
    return this.transition(adminId, sellerProfileId, {
      from: [SellerVerificationStatus.VERIFIED],
      to: SellerVerificationStatus.REJECTED,
      action: 'SELLER_VERIFICATION_REVOKED',
      reason,
      data: (now) => ({ verificationRevokedAt: now, verificationNote: reason }),
      event: 'revoked',
    });
  }

  private async transition(
    adminId: string,
    sellerProfileId: string,
    t: {
      from: SellerVerificationStatus[];
      to: SellerVerificationStatus;
      action: 'SELLER_VERIFICATION_APPROVED' | 'SELLER_VERIFICATION_REJECTED' | 'SELLER_VERIFICATION_REVOKED';
      reason: string | null;
      data: (now: Date) => Prisma.SellerProfileUpdateManyMutationInput;
      documents?: (tx: Prisma.TransactionClient, now: Date) => Promise<void>;
      event: 'verified' | 'rejected' | 'revoked';
    },
  ) {
    const profile = await this.adminProfile(sellerProfileId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.sellerProfile.updateMany({
        where: { id: sellerProfileId, deletedAt: null, verificationStatus: { in: t.from } },
        data: { verificationStatus: t.to, ...t.data(now) },
      });
      if (res.count !== 1) {
        throw new ConflictException(
          `Transition impossible depuis l'état ${profile.verificationStatus}`,
        );
      }
      if (t.documents) await t.documents(tx, now);
      await this.audit.record(tx, {
        actorId: adminId,
        action: t.action,
        entityType: 'seller_profile',
        entityId: sellerProfileId,
        before: { verificationStatus: profile.verificationStatus },
        after: { verificationStatus: t.to },
        reason: t.reason,
      });
    });
    this.logger.log(`verification ${profile.verificationStatus} → ${t.to}: seller=${sellerProfileId} admin=${adminId}`);
    void this.notifications
      .notifyVerification(profile.userId, t.event, t.reason ?? undefined)
      .catch((e) => this.logger.error(`verification notify failed: ${e}`));
    return this.getForAdmin(sellerProfileId);
  }
}
