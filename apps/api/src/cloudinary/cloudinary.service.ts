import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

export interface CloudinaryUploadResult {
  cloudinaryId: string;
  url: string;
  thumbnailUrl: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadImage(
    buffer: Buffer,
    folder: string = 'teka-rdc/products',
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          format: 'webp',
          transformation: [{ quality: 'auto', fetch_format: 'webp' }],
        },
        (error, result) => {
          if (error) {
            this.logger.error(`Cloudinary upload failed: ${error.message}`);
            reject(
              new BadRequestException("Échec du téléchargement de l'image"),
            );
            return;
          }
          if (!result) {
            reject(
              new BadRequestException("Échec du téléchargement de l'image"),
            );
            return;
          }

          // f_auto lets Cloudinary serve AVIF/WebP/JPEG based on the
          // requesting browser's Accept header — newer than f_webp which
          // forces WebP even when AVIF would be smaller.
          const thumbnailUrl = result.secure_url.replace(
            '/upload/',
            '/upload/w_300,h_300,c_fill,f_auto,q_auto/',
          );

          resolve({
            cloudinaryId: result.public_id,
            url: result.secure_url,
            thumbnailUrl,
          });
        },
      );

      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  /**
   * Upload a PRIVATE image (KYC documents). Unlike uploadImage, the asset is
   * stored with delivery type `authenticated` — it is NOT publicly accessible
   * by its URL; it can only be served through a signed URL (see
   * getSignedImageUrl). Original format is preserved (no WebP transform) so an
   * ID/RCCM photo stays legible. Returns only the public_id; no public URL.
   */
  async uploadPrivateImage(
    buffer: Buffer,
    folder: string = 'teka-rdc/seller-documents',
  ): Promise<{ cloudinaryId: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          type: 'authenticated',
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(
              `Cloudinary private upload failed: ${error?.message ?? 'no result'}`,
            );
            reject(
              new BadRequestException('Échec du téléchargement du document'),
            );
            return;
          }
          resolve({ cloudinaryId: result.public_id });
        },
      );

      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  /**
   * Generate a signed, time-limited delivery URL for a private (authenticated)
   * asset. Without the signature the asset 401s, so this is the only way to
   * view a KYC document — handed to admins on demand, never persisted.
   */
  /** @deprecated The `expires_at` of a signed DELIVERY URL is not enforced
   * on this account (probed 2026-09-05: an expired link still served 200).
   * Use `getPrivateDownloadUrl` for anything an admin must not keep. */
  getSignedImageUrl(cloudinaryId: string, expiresInSeconds = 600): string {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return cloudinary.url(cloudinaryId, {
      type: 'authenticated',
      resource_type: 'image',
      secure: true,
      sign_url: true,
      expires_at: expiresAt,
    });
  }

  /**
   * Upload a PRIVATE official document under an API-generated public_id
   * (seller verification, PR 2). `resourceType` is 'image' for JPEG/PNG and
   * 'raw' for PDF — a raw asset keeps its bytes untouched and its extension
   * in the public_id. `overwrite: false` + `unique_filename: false` mean a
   * retry with the same id cannot silently replace an earlier upload.
   * Returns the stored public_id only; no URL is ever produced here.
   */
  async uploadPrivateDocument(
    buffer: Buffer,
    opts: { publicId: string; resourceType: 'image' | 'raw' },
  ): Promise<{ cloudinaryId: string; bytes: number }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: opts.publicId,
          type: 'authenticated',
          resource_type: opts.resourceType,
          overwrite: false,
          unique_filename: false,
          use_filename: false,
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(
              `Cloudinary private document upload failed: ${error?.message ?? 'no result'}`,
            );
            reject(
              new BadRequestException('Échec du téléchargement du document'),
            );
            return;
          }
          resolve({ cloudinaryId: result.public_id, bytes: result.bytes });
        },
      );
      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  /**
   * Short-lived, EXPIRY-ENFORCED link to a private asset, for admins only.
   * Uses Cloudinary's private download endpoint (api.cloudinary.com/…/download,
   * signed with the API secret) rather than a signed delivery URL: probed on
   * 2026-09-05, a signed delivery URL with `expires_at` still answered 200
   * after expiry, while the download link answers 401 once expired. Works
   * for raw (PDF) and image assets alike. Generated on demand, never stored.
   */
  getPrivateDownloadUrl(
    cloudinaryId: string,
    opts: {
      resourceType: 'image' | 'raw';
      /** File extension for image assets (raw ids already carry theirs). */
      format?: string;
      expiresInSeconds: number;
    },
  ): string {
    const expiresAt = Math.floor(Date.now() / 1000) + opts.expiresInSeconds;
    return cloudinary.utils.private_download_url(
      cloudinaryId,
      opts.resourceType === 'raw' ? '' : (opts.format ?? ''),
      {
        resource_type: opts.resourceType,
        type: 'authenticated',
        expires_at: expiresAt,
      } as Record<string, unknown>,
    );
  }

  /** Stored format ('jpg', 'png', …) of a private image asset, or null. */
  async getPrivateAssetFormat(cloudinaryId: string): Promise<string | null> {
    try {
      const info = (await cloudinary.api.resource(cloudinaryId, {
        type: 'authenticated',
        resource_type: 'image',
      })) as { format?: string };
      return info?.format ?? null;
    } catch (error) {
      this.logger.warn(`Cloudinary resource lookup failed for ${cloudinaryId}: ${error}`);
      return null;
    }
  }

  /**
   * Destroy a private asset. `type` + `resource_type` are REQUIRED for
   * authenticated / raw assets — a bare `destroy(id)` reports "not found"
   * and leaves the file in place (probed 2026-09-05). Returns whether
   * Cloudinary reported the asset gone (deleted now, or already absent).
   */
  async deletePrivateAsset(
    cloudinaryId: string,
    resourceType: 'image' | 'raw',
  ): Promise<boolean> {
    try {
      const res = (await cloudinary.uploader.destroy(cloudinaryId, {
        type: 'authenticated',
        resource_type: resourceType,
        invalidate: true,
      })) as { result?: string };
      return res?.result === 'ok' || res?.result === 'not found';
    } catch (error) {
      this.logger.error(
        `Cloudinary private delete failed for ${cloudinaryId}: ${error}`,
      );
      return false;
    }
  }

  /** Cloud name the delivery URLs this service produces belong to. */
  get cloudName(): string | undefined {
    return this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
  }

  /**
   * Destroy a public image asset. Never throws — an orphaned asset is a cost
   * issue, not a correctness one, and the caller's DB write must stand.
   * `invalidate` also purges the CDN copy so a replaced avatar stops being
   * served under its old URL.
   */
  async deleteImage(
    cloudinaryId: string,
    opts: { invalidate?: boolean } = {},
  ): Promise<void> {
    try {
      await cloudinary.uploader.destroy(cloudinaryId, {
        invalidate: opts.invalidate === true,
      });
    } catch (error) {
      this.logger.error(
        `Cloudinary delete failed for ${cloudinaryId}: ${error}`,
      );
    }
  }

  /**
   * Bulk-destroy up to 100 Cloudinary assets in a single API call.
   * Used by cascade-deletion paths (hard-delete product, etc.) to keep
   * storage in sync with the DB. Logs partial failures but never throws
   * — orphaned Cloudinary assets are a cost issue, not a correctness one,
   * and the DB-side delete must complete regardless.
   */
  async deleteImages(cloudinaryIds: string[]): Promise<void> {
    if (cloudinaryIds.length === 0) return;
    // Cloudinary's delete_resources caps at 100 ids per call.
    const CHUNK = 100;
    for (let i = 0; i < cloudinaryIds.length; i += CHUNK) {
      const batch = cloudinaryIds.slice(i, i + CHUNK);
      try {
        await cloudinary.api.delete_resources(batch);
      } catch (error) {
        this.logger.error(
          `Cloudinary bulk delete failed for ${batch.length} ids: ${error}`,
        );
      }
    }
  }
}
