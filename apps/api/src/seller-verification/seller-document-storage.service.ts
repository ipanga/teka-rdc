import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import {
  Prisma,
  SellerDocument,
  SellerDocumentStatus,
  SellerDocumentType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import {
  declaredTypeMatches,
  sanitizeFilename,
  SniffedDocument,
  sniffDocument,
  stripImageMetadata,
} from './document-validation';

/** Private Cloudinary folder; the API generates every public_id under it. */
export const SELLER_DOCUMENTS_FOLDER = 'teka-rdc/seller-documents';

/** Kinds accepted for verification evidence (D8 §5): PDF, JPEG, PNG only. */
const VERIFICATION_KINDS = new Set<SniffedDocument['kind']>(['pdf', 'jpeg', 'png']);

export function documentMaxBytesFromEnv(): number {
  const mb = Number(process.env.SELLER_DOCUMENT_MAX_MB ?? '5');
  return (Number.isFinite(mb) && mb > 0 ? mb : 5) * 1024 * 1024;
}

/**
 * Storage-layer half of seller verification: validates the bytes, owns the
 * DB row ↔ Cloudinary asset relationship, issues admin download links and
 * runs retention. Knows nothing about verification status or notifications
 * (that is `SellerVerificationService`), so `UsersModule` can import it for
 * account anonymisation without a dependency cycle.
 *
 * Ownership order (D8 §6): the DB row is created FIRST with the public_id the
 * asset will get, then the asset is uploaded, then `uploadedAt` is stamped by
 * the caller's transaction. Every failure path is compensated:
 *   - upload fails            → the row is deleted (no orphan row)
 *   - later DB write fails    → `discard()` destroys the asset + deletes the row
 *   - process dies in between → `uploadedAt IS NULL` rows older than an hour
 *                               are reconciled by the daily sweep
 */
@Injectable()
export class SellerDocumentStorageService {
  private readonly logger = new Logger(SellerDocumentStorageService.name);
  readonly maxBytes: number;
  readonly retentionDays: number;
  readonly urlTtlSeconds: number;

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    config: ConfigService,
  ) {
    this.maxBytes = (config.get<number>('SELLER_DOCUMENT_MAX_MB') ?? 5) * 1024 * 1024;
    this.retentionDays = config.get<number>('SELLER_DOCUMENT_RETENTION_DAYS') ?? 90;
    this.urlTtlSeconds = config.get<number>('SELLER_DOCUMENT_URL_TTL_SECONDS') ?? 120;
  }

  /**
   * Content validation: size (defence in depth behind the multer limit),
   * magic bytes, declared-type agreement, allowed kinds, metadata stripping.
   * Every message is French — it goes straight to the seller.
   */
  validate(file: Express.Multer.File | undefined): {
    sniffed: SniffedDocument;
    bytes: Buffer;
    originalName: string | null;
  } {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Aucun fichier fourni');
    }
    if (file.size > this.maxBytes || file.buffer.length > this.maxBytes) {
      throw new BadRequestException(
        `Le document ne doit pas dépasser ${Math.round(this.maxBytes / (1024 * 1024))} Mo`,
      );
    }
    const sniffed = sniffDocument(file.buffer);
    if (!sniffed || !VERIFICATION_KINDS.has(sniffed.kind)) {
      throw new BadRequestException(
        'Format non supporté. Formats acceptés : PDF, JPEG, PNG.',
      );
    }
    if (!declaredTypeMatches(file.mimetype, sniffed)) {
      throw new BadRequestException(
        'Le contenu du fichier ne correspond pas à son format déclaré',
      );
    }
    const bytes = stripImageMetadata(file.buffer, sniffed.kind);
    return { sniffed, bytes, originalName: sanitizeFilename(file.originalname) };
  }

  /**
   * Create the ownership row, then upload. Returns the row with the asset
   * in place but `uploadedAt` still NULL — the domain transaction stamps it
   * together with the supersede/status changes so nothing can drift.
   */
  async createAndUpload(params: {
    sellerProfileId: string;
    type: SellerDocumentType;
    label: string | null;
    file: Express.Multer.File;
  }): Promise<SellerDocument> {
    const { sniffed, bytes, originalName } = this.validate(params.file);
    const id = randomUUID();
    const publicId =
      `${SELLER_DOCUMENTS_FOLDER}/${params.sellerProfileId}/${id}` +
      (sniffed.resourceType === 'raw' ? `.${sniffed.extension}` : '');

    const row = await this.prisma.sellerDocument.create({
      data: {
        id,
        sellerProfileId: params.sellerProfileId,
        type: params.type,
        label: params.label,
        cloudinaryId: publicId,
        resourceType: sniffed.resourceType,
        mimeType: sniffed.mimeType,
        sizeBytes: bytes.length,
        originalName,
        status: SellerDocumentStatus.PENDING,
      },
    });

    try {
      await this.cloudinary.uploadPrivateDocument(bytes, {
        publicId,
        resourceType: sniffed.resourceType,
      });
    } catch (error) {
      // No asset → no row. The delete cannot throw past this point.
      await this.prisma.sellerDocument
        .delete({ where: { id } })
        .catch((e) => this.logger.error(`Row cleanup failed for ${id}: ${e}`));
      throw error;
    }
    return row;
  }

  /** Compensation after the upload succeeded but the domain write failed. */
  async discard(doc: Pick<SellerDocument, 'id' | 'cloudinaryId' | 'resourceType'>): Promise<void> {
    const gone = await this.cloudinary.deletePrivateAsset(
      doc.cloudinaryId,
      doc.resourceType as 'image' | 'raw',
    );
    if (!gone) {
      // Keep the row (uploadedAt NULL) so the sweep retries the destroy.
      this.logger.warn(`Asset ${doc.cloudinaryId} not destroyed; left for the sweep`);
      return;
    }
    await this.prisma.sellerDocument
      .delete({ where: { id: doc.id } })
      .catch((e) => this.logger.error(`Row cleanup failed for ${doc.id}: ${e}`));
  }

  /** Admin-only, expiry-enforced link (see CloudinaryService.getPrivateDownloadUrl). */
  downloadUrl(doc: Pick<SellerDocument, 'cloudinaryId' | 'resourceType' | 'mimeType'>): {
    url: string;
    expiresInSeconds: number;
  } {
    const format = doc.mimeType === 'image/png' ? 'png' : doc.mimeType === 'image/jpeg' ? 'jpg' : undefined;
    return {
      url: this.cloudinary.getPrivateDownloadUrl(doc.cloudinaryId, {
        resourceType: doc.resourceType as 'image' | 'raw',
        format,
        expiresInSeconds: this.urlTtlSeconds,
      }),
      expiresInSeconds: this.urlTtlSeconds,
    };
  }

  /** When a rejected / superseded binary may be destroyed (D7). */
  retentionDeadline(from = new Date()): Date {
    return new Date(from.getTime() + this.retentionDays * 24 * 60 * 60 * 1000);
  }

  /**
   * Destroy one binary and stamp the row. The metadata row stays forever
   * (audit); only the file goes. Idempotent.
   */
  async purgeBinary(
    doc: Pick<SellerDocument, 'id' | 'cloudinaryId' | 'resourceType' | 'purgedAt'>,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    if (doc.purgedAt) return true;
    const gone = await this.cloudinary.deletePrivateAsset(
      doc.cloudinaryId,
      doc.resourceType as 'image' | 'raw',
    );
    if (!gone) return false;
    await db.sellerDocument.update({
      where: { id: doc.id },
      data: { purgedAt: new Date() },
    });
    return true;
  }

  /**
   * Account anonymisation / deletion (D7): every binary of the seller goes,
   * whatever its status. Rows are kept (stamped `purgedAt`). Best-effort per
   * document; failures are retried by the daily sweep because `purgeAfter`
   * is set to "now" here.
   */
  async purgeAllForSeller(sellerProfileId: string): Promise<{ purged: number; failed: number }> {
    const docs = await this.prisma.sellerDocument.findMany({
      where: { sellerProfileId, purgedAt: null },
      select: { id: true, cloudinaryId: true, resourceType: true, purgedAt: true },
    });
    let purged = 0;
    let failed = 0;
    for (const doc of docs) {
      const ok = await this.purgeBinary(doc);
      if (ok) purged++;
      else {
        failed++;
        await this.prisma.sellerDocument.update({
          where: { id: doc.id },
          data: { purgeAfter: new Date() },
        });
      }
    }
    return { purged, failed };
  }

  /**
   * Daily retention sweep: (1) binaries past their retention deadline;
   * (2) rows whose upload never completed (`uploadedAt IS NULL` for > 1 h)
   * — the asset is destroyed if it exists and the row removed, so DB and
   * Cloudinary cannot drift silently. Bounded batches; safe on several
   * instances (each step is idempotent).
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async retentionSweep(): Promise<{ purged: number; reconciled: number }> {
    const now = new Date();
    const due = await this.prisma.sellerDocument.findMany({
      where: { purgedAt: null, uploadedAt: { not: null }, purgeAfter: { lte: now } },
      select: { id: true, cloudinaryId: true, resourceType: true, purgedAt: true },
      take: 200,
    });
    let purged = 0;
    for (const doc of due) if (await this.purgeBinary(doc)) purged++;

    const stale = await this.prisma.sellerDocument.findMany({
      where: { uploadedAt: null, createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
      select: { id: true, cloudinaryId: true, resourceType: true },
      take: 200,
    });
    let reconciled = 0;
    for (const doc of stale) {
      const gone = await this.cloudinary.deletePrivateAsset(
        doc.cloudinaryId,
        doc.resourceType as 'image' | 'raw',
      );
      if (!gone) continue;
      await this.prisma.sellerDocument.delete({ where: { id: doc.id } });
      reconciled++;
    }
    if (purged || reconciled || due.length || stale.length) {
      this.logger.log(
        `Seller documents sweep: ${purged}/${due.length} purged, ${reconciled}/${stale.length} orphans reconciled`,
      );
    }
    return { purged, reconciled };
  }
}
