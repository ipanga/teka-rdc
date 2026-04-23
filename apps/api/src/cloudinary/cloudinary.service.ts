import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
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

          const thumbnailUrl = result.secure_url.replace(
            '/upload/',
            '/upload/w_300,h_300,c_fill,f_webp/',
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

  async deleteImage(cloudinaryId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(cloudinaryId);
    } catch (error) {
      this.logger.error(
        `Cloudinary delete failed for ${cloudinaryId}: ${error}`,
      );
    }
  }
}
