import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_image_compress/flutter_image_compress.dart';

const int _targetMaxBytes = 500 * 1024; // 500 KB
const int _maxDimension = 1920;
const int _quality = 85;

class CompressedImage {
  final Uint8List bytes;
  final String filename;
  final String mimeType;

  const CompressedImage({
    required this.bytes,
    required this.filename,
    required this.mimeType,
  });
}

/// Mobile-side compression for product image uploads. Targets ≤500 KB
/// WebP. Used by ProductsRepository before POSTing to
/// `/v1/sellers/products/:id/images` — image_picker already does a coarse
/// resize (1200×1200, q=80) but the output can still exceed 500 KB on
/// modern phone cameras (especially on the 2G/3G DRC network we're
/// shipping for, every kilobyte matters).
///
/// Skips compression when:
/// - the source is already ≤500 KB (re-encoding loses quality for nothing)
/// - the file is a GIF (would lose animation — Cloudinary serves GIF
///   via f_auto on the URL anyway)
///
/// On any compression failure, returns the original bytes unchanged so a
/// missing platform binary / OOM / unsupported format never blocks the
/// upload entirely.
Future<CompressedImage> compressImageForUpload(File file) async {
  final originalBytes = await file.readAsBytes();
  final originalName = file.path.split('/').last;

  if (originalBytes.lengthInBytes <= _targetMaxBytes) {
    return CompressedImage(
      bytes: originalBytes,
      filename: originalName,
      mimeType: _mimeFromPath(originalName),
    );
  }

  if (originalName.toLowerCase().endsWith('.gif')) {
    return CompressedImage(
      bytes: originalBytes,
      filename: originalName,
      mimeType: 'image/gif',
    );
  }

  try {
    final compressed = await FlutterImageCompress.compressWithList(
      originalBytes,
      minWidth: _maxDimension,
      minHeight: _maxDimension,
      quality: _quality,
      format: CompressFormat.webp,
    );

    if (compressed.isEmpty || compressed.lengthInBytes >= originalBytes.lengthInBytes) {
      return CompressedImage(
        bytes: originalBytes,
        filename: originalName,
        mimeType: _mimeFromPath(originalName),
      );
    }

    final webpName = originalName.replaceAll(RegExp(r'\.[^.]+$'), '.webp');
    return CompressedImage(
      bytes: compressed,
      filename: webpName,
      mimeType: 'image/webp',
    );
  } catch (_) {
    return CompressedImage(
      bytes: originalBytes,
      filename: originalName,
      mimeType: _mimeFromPath(originalName),
    );
  }
}

String _mimeFromPath(String path) {
  final lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}
