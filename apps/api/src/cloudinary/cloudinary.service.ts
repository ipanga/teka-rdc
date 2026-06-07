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

  async deleteImage(cloudinaryId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(cloudinaryId);
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
