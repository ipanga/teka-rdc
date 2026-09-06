import { BadRequestException } from '@nestjs/common';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  imageUploadLimits,
  validateImageUpload,
} from './image-upload';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(10)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(8)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
/** SOI, APP1 (Exif, 6 bytes payload), SOS + a few entropy bytes. */
const JPEG_WITH_EXIF = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  Buffer.from([0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]),
  Buffer.from([0xff, 0xda, 0x00, 0x02, 0x01, 0x02, 0x03, 0xff, 0xd9]),
]);

const file = (buffer: Buffer, mimetype: string) => ({ buffer, mimetype, size: buffer.length });
const opts = { allowGif: false, unsupportedMessage: 'Format non supporté' };

describe('validateImageUpload', () => {
  it('exposes streaming multer limits at the 5 MB ceiling, one file', () => {
    expect(imageUploadLimits.fileSize).toBe(IMAGE_UPLOAD_MAX_BYTES);
    expect(imageUploadLimits.files).toBe(1);
  });

  it('rejects an SVG declared as PNG (bytes, not the declared type, decide)', () => {
    expect(() => validateImageUpload(file(SVG, 'image/png'), opts)).toThrow(BadRequestException);
    expect(() => validateImageUpload(file(SVG, 'image/svg+xml'), opts)).toThrow('Format non supporté');
  });

  it('rejects a PDF and a declared-type mismatch', () => {
    expect(() => validateImageUpload(file(PDF, 'application/pdf'), opts)).toThrow('Format non supporté');
    expect(() => validateImageUpload(file(PNG, 'image/jpeg'), opts)).toThrow(
      'Le contenu du fichier ne correspond pas à son format déclaré',
    );
  });

  it('accepts PNG and WebP that agree with their declared type', () => {
    expect(validateImageUpload(file(PNG, 'image/png'), opts).kind).toBe('png');
    expect(validateImageUpload(file(WEBP, 'image/webp'), opts).mimeType).toBe('image/webp');
  });

  it('strips the EXIF (APP1) segment from a JPEG before upload', () => {
    const out = validateImageUpload(file(JPEG_WITH_EXIF, 'image/jpeg'), opts);
    expect(out.kind).toBe('jpeg');
    expect(out.buffer.includes(Buffer.from('Exif'))).toBe(false);
    expect(out.buffer.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(out.buffer.includes(Buffer.from([0xff, 0xda]))).toBe(true);
  });

  it('accepts GIF only when the caller allows it, and only when declared as GIF', () => {
    expect(() => validateImageUpload(file(GIF, 'image/gif'), opts)).toThrow('Format non supporté');
    expect(validateImageUpload(file(GIF, 'image/gif'), { ...opts, allowGif: true }).kind).toBe('gif');
    expect(() => validateImageUpload(file(GIF, 'image/png'), { ...opts, allowGif: true })).toThrow(
      'Le contenu du fichier ne correspond pas à son format déclaré',
    );
  });

  it('rejects an oversized or missing file', () => {
    const big = { buffer: PNG, mimetype: 'image/png', size: IMAGE_UPLOAD_MAX_BYTES + 1 };
    expect(() => validateImageUpload(big, opts)).toThrow('5 Mo');
    expect(() => validateImageUpload(undefined, opts)).toThrow('Aucun fichier reçu');
  });
});
