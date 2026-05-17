import imageCompression from 'browser-image-compression';

const TARGET_MAX_BYTES = 500 * 1024; // 500 KB
const MAX_DIMENSION = 1920;

/**
 * Browser-side compression for product image uploads. Targets ≤500 KB
 * WebP. Used by the seller-web image-uploader before POSTing to
 * `/v1/sellers/products/:id/images` — cuts upload time on 2G/3G in DRC
 * (the dominant connection profile) and shrinks Cloudinary bandwidth.
 *
 * Skips compression when:
 * - the file is already ≤500 KB (re-encoding loses quality for nothing)
 * - the source is a GIF (would lose animation — Cloudinary handles GIF
 *   delivery via f_auto on the URL anyway)
 *
 * Falls back to the original file on any compression error so a flaky
 * canvas / web-worker environment can never block the upload entirely.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (file.size <= TARGET_MAX_BYTES) return file;
  if (file.type === 'image/gif') return file;

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: TARGET_MAX_BYTES / (1024 * 1024),
      maxWidthOrHeight: MAX_DIMENSION,
      useWebWorker: true,
      fileType: 'image/webp',
    });
    // If for any reason the lib returned something *larger* than the
    // original (rare — happens on tiny low-entropy images that resist
    // WebP), keep the original.
    return compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  }
}
