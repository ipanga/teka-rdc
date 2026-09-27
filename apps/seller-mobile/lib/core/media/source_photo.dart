import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

import '../theme/teka_colors.dart';

/// Seller photo pipeline for shelf photography (Seller Catalogue Speed-up).
///
/// A seller photographs a shelf once, then crops Product A, Product B, … out
/// of that single photo. The pipeline is deliberately LOCAL until the seller
/// confirms a crop:
///
///   pick (camera/gallery) → copy into our own temp dir (the SOURCE)
///     → native crop → a NEW file per crop (the source is never overwritten)
///     → the existing compress-to-WebP + upload to an existing product.
///
/// Nothing reaches Cloudinary before a crop is confirmed, so an abandoned or
/// cancelled crop cannot leave an orphaned asset. The source lives only on the
/// device: it is replaced when the seller picks a new photo, removed when they
/// tap « Terminer avec cette photo », and swept after [_staleAfter] at start.

const _sourceDirName = 'teka_source';
const _staleAfter = Duration(hours: 24);

/// Picks a photo and returns its local path, or null when the seller backs
/// out. Injectable so widget tests never reach the platform channel.
abstract class SourcePhotoPicker {
  Future<String?> pick(ImageSource source);
}

class NativeSourcePhotoPicker implements SourcePhotoPicker {
  final ImagePicker _picker = ImagePicker();

  @override
  Future<String?> pick(ImageSource source) async {
    // Higher than the old direct-upload capture (1200 px, q80): a single
    // product may fill only a small part of a shelf photo, and each crop is
    // re-compressed to ≤ 500 KB WebP before upload anyway. The native side
    // downsamples, so Dart never holds the full camera bitmap.
    final file = await _picker.pickImage(
      source: source,
      maxWidth: 4096,
      maxHeight: 4096,
      imageQuality: 92,
    );
    return file?.path;
  }
}

/// Crops a local image into a NEW file and returns it, or null when the
/// seller cancels. Never writes to [sourcePath].
abstract class PhotoCropper {
  Future<File?> crop(String sourcePath);
}

class NativePhotoCropper implements PhotoCropper {
  @override
  Future<File?> crop(String sourcePath) async {
    final cropped = await ImageCropper().cropImage(
      sourcePath: sourcePath,
      // Product photos are shown square on cards; 1920 matches the upload
      // compressor's ceiling so no resolution is thrown away twice.
      maxWidth: 1920,
      maxHeight: 1920,
      compressFormat: ImageCompressFormat.jpg,
      compressQuality: 92,
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: 'Recadrer le produit',
          toolbarColor: Colors.white,
          toolbarWidgetColor: TekaColors.foreground,
          statusBarLight: true,
          activeControlsWidgetColor: TekaColors.tekaRed,
          lockAspectRatio: false,
          initAspectRatio: CropAspectRatioPreset.square,
          aspectRatioPresets: const [
            CropAspectRatioPreset.square,
            CropAspectRatioPreset.ratio4x3,
            CropAspectRatioPreset.original,
          ],
        ),
        IOSUiSettings(
          title: 'Recadrer le produit',
          doneButtonTitle: 'Valider',
          cancelButtonTitle: 'Annuler',
          aspectRatioPresets: const [
            CropAspectRatioPreset.square,
            CropAspectRatioPreset.ratio4x3,
            CropAspectRatioPreset.original,
          ],
        ),
      ],
    );
    return cropped == null ? null : File(cropped.path);
  }
}

/// Where the reusable source copy lives. Overridable in tests.
abstract class SourcePhotoStore {
  Future<Directory> directory();
}

class TempSourcePhotoStore implements SourcePhotoStore {
  @override
  Future<Directory> directory() async {
    final tmp = await getTemporaryDirectory();
    final dir = Directory('${tmp.path}/$_sourceDirName');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }
}

final sourcePhotoPickerProvider =
    Provider<SourcePhotoPicker>((_) => NativeSourcePhotoPicker());
final photoCropperProvider = Provider<PhotoCropper>((_) => NativePhotoCropper());
final sourcePhotoStoreProvider =
    Provider<SourcePhotoStore>((_) => TempSourcePhotoStore());

/// The one shelf photo the seller is currently cropping from, or null.
///
/// App-scoped (not autoDispose) on purpose: it must survive leaving product
/// A's screen and opening product B's, which is the whole point.
class SourcePhotoSession extends Notifier<File?> {
  @override
  File? build() => null;

  /// Takes ownership of a freshly picked photo: copies it into our own temp
  /// directory (the picker's cache file may be reclaimed by the OS) and drops
  /// the previous source. Returns the owned copy.
  Future<File> adopt(String pickedPath) async {
    final dir = await ref.read(sourcePhotoStoreProvider).directory();
    final ext = pickedPath.contains('.')
        ? pickedPath.substring(pickedPath.lastIndexOf('.'))
        : '.jpg';
    final owned = await File(pickedPath).copy(
        '${dir.path}/source_${DateTime.now().microsecondsSinceEpoch}$ext');
    await _deleteQuietly(state);
    state = owned;
    return owned;
  }

  /// « Terminer avec cette photo » — the seller is done with this shelf.
  Future<void> clear() async {
    final current = state;
    state = null;
    await _deleteQuietly(current);
  }

  /// The source file may vanish underneath us (OS cache sweep). Report
  /// whether it is still usable and forget it if not.
  Future<bool> isAvailable() async {
    final current = state;
    if (current == null) return false;
    if (await current.exists()) return true;
    state = null;
    return false;
  }
}

final sourcePhotoSessionProvider =
    NotifierProvider<SourcePhotoSession, File?>(SourcePhotoSession.new);

/// Start-up sweep: removes source copies left by a previous run (killed app,
/// crash) older than [_staleAfter]. Never throws.
Future<void> purgeStaleSourcePhotos({SourcePhotoStore? store}) async {
  try {
    final dir = await (store ?? TempSourcePhotoStore()).directory();
    final cutoff = DateTime.now().subtract(_staleAfter);
    await for (final entity in dir.list()) {
      if (entity is File && (await entity.lastModified()).isBefore(cutoff)) {
        await _deleteQuietly(entity);
      }
    }
  } catch (_) {
    // Temp-dir housekeeping must never block start-up.
  }
}

Future<void> _deleteQuietly(File? file) async {
  if (file == null) return;
  try {
    if (await file.exists()) await file.delete();
  } catch (_) {
    // A temp file we cannot delete is swept by the OS or the next start.
  }
}

/// Deletes a single crop output once it is uploaded or abandoned.
Future<void> discardCropFile(File? file) => _deleteQuietly(file);
