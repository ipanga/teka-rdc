import { BadRequestException } from '@nestjs/common';
import {
  declaredTypeMatches,
  sniffDocument,
  stripImageMetadata,
} from '../../seller-verification/document-validation';

/**
 * Hardening shared by the two PUBLIC image uploads (product images, avatars),
 * reusing the primitives the KYC path already proved (S8, 2026-09-06):
 *
 *  - `imageUploadLimits` is handed to multer so an oversized body is refused
 *    while it streams — nothing above the cap is ever buffered in memory;
 *  - the content is identified from its bytes, never from the declared MIME
 *    type, and the declared type must agree with the bytes;
 *  - embedded metadata (EXIF / XMP — GPS of a phone photo) is stripped before
 *    the asset reaches a publicly addressable URL.
 *
 * GIF is accepted only where the caller asks for it (product images keep
 * their historical format list); it carries no EXIF so it is passed through.
 * SVG, HTML, PDF and executables can never pass: they do not sniff as one of
 * the four raster containers.
 */
export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Field-name hardening shared by EVERY multipart endpoint (product images,
 * avatars, KYC / verification documents).
 *
 * multer parses bracket notation in text-field names (`items[3]` builds an
 * array of length 4). GHSA-535w-7cp7-47q4: a crafted index such as
 * `items[4294967294]` materialises a maximum-length sparse array and a second
 * field on the same base then converts it to an object by walking its whole
 * length — one request pins the event loop for minutes. multer ≥ 2.3.0 ships
 * the guard as the OPT-IN `limits.fieldArrayIndexLimit`; the advisory asks
 * applications to set it to the smallest index they need. No Teka client
 * sends bracketed field names at all (`image` / `document` + flat text
 * fields), so the minimum is 0. Rejection surfaces as a French 400 through
 * `HttpExceptionFilter`.
 */
export const multipartFieldNameLimits = {
  fieldArrayIndexLimit: 0,
} as const;

export const imageUploadLimits = {
  fileSize: IMAGE_UPLOAD_MAX_BYTES,
  files: 1,
  fields: 4,
  ...multipartFieldNameLimits,
} as const;

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif';

export interface ValidatedImage {
  kind: ImageKind;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  /** Bytes to upload: metadata-stripped for JPEG/PNG/WebP, verbatim for GIF. */
  buffer: Buffer;
}

function sniffGif(buffer: Buffer): boolean {
  if (buffer.length < 6) return false;
  const head = buffer.subarray(0, 6).toString('latin1');
  return head === 'GIF87a' || head === 'GIF89a';
}

export function validateImageUpload(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'size'> | undefined,
  opts: { allowGif: boolean; unsupportedMessage: string },
): ValidatedImage {
  if (!file || !file.buffer) {
    throw new BadRequestException('Aucun fichier reçu');
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES || file.buffer.length > IMAGE_UPLOAD_MAX_BYTES) {
    throw new BadRequestException("La taille de l'image ne doit pas dépasser 5 Mo");
  }
  const declared = (file.mimetype ?? '').split(';')[0].trim().toLowerCase();

  if (sniffGif(file.buffer)) {
    if (!opts.allowGif) throw new BadRequestException(opts.unsupportedMessage);
    if (declared !== 'image/gif') {
      throw new BadRequestException(
        'Le contenu du fichier ne correspond pas à son format déclaré',
      );
    }
    return { kind: 'gif', mimeType: 'image/gif', buffer: file.buffer };
  }

  const sniffed = sniffDocument(file.buffer);
  if (!sniffed || sniffed.kind === 'pdf') {
    throw new BadRequestException(opts.unsupportedMessage);
  }
  if (!declaredTypeMatches(declared, sniffed)) {
    throw new BadRequestException(
      'Le contenu du fichier ne correspond pas à son format déclaré',
    );
  }
  return {
    kind: sniffed.kind as Exclude<ImageKind, 'gif'>,
    mimeType: sniffed.mimeType as Exclude<ValidatedImage['mimeType'], 'image/gif'>,
    buffer: stripImageMetadata(file.buffer, sniffed.kind),
  };
}
