import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/media/source_photo.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../home/presentation/widgets/dashboard_rows.dart';
import '../../data/models/product_model.dart';
import '../../data/products_repository.dart';
import '../providers/products_provider.dart';
import 'image_upload_tile.dart';

/// Add / remove product images for a single product. The one implementation
/// shared by the standalone `ProductImagesScreen` and the inline image section
/// of `ProductFormScreen` (edit path) — so both surfaces enforce the same rules
/// (≤8 images, compress-to-WebP on upload, owner-scoped delete on the API).
///
/// Reorder / cover selection are intentionally absent: the API exposes only
/// add + delete (no reorder endpoint). The first image by `displayOrder` is
/// the cover, and the tile says so.
///
/// Shrink-wrapped (no internal scroll) so it embeds inside a ListView/Column.
class ProductImageManager extends ConsumerStatefulWidget {
  final String productId;

  const ProductImageManager({super.key, required this.productId});

  @override
  ConsumerState<ProductImageManager> createState() =>
      _ProductImageManagerState();
}

class _ProductImageManagerState extends ConsumerState<ProductImageManager> {
  static const int _maxImages = 8;
  bool _isUploading = false;

  /// A confirmed crop whose upload failed, kept for « Réessayer ».
  File? _failedCrop;

  @override
  void dispose() {
    // Leaving the screen abandons an unsent crop: remove the local file.
    unawaited(discardCropFile(_failedCrop));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final productAsync = ref.watch(productDetailProvider(widget.productId));

    return productAsync.when(
      skipLoadingOnRefresh: true,
      loading: () => Semantics(
        label: 'Chargement des photos',
        liveRegion: true,
        child: const ExcludeSemantics(
          child: Wrap(
              spacing: TekaSpacing.xs,
              runSpacing: TekaSpacing.xs,
              children: [
                SkeletonBlock(width: 96, height: 96),
                SkeletonBlock(width: 96, height: 96),
                SkeletonBlock(width: 96, height: 96),
              ]),
        ),
      ),
      error: (e, _) => DashboardErrorRow(
        title: 'Photos indisponibles',
        onRetry: () => ref.invalidate(productDetailProvider(widget.productId)),
      ),
      data: (product) => _buildContent(context, product),
    );
  }

  Widget _buildContent(BuildContext context, SellerProductModel product) {
    final theme = Theme.of(context).textTheme;
    final images = List<ProductImageModel>.from(product.images)
      ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
    final canAdd = images.length < _maxImages;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(
            child: Text('${images.length} / $_maxImages photos',
                style: theme.titleSmall),
          ),
          if (!canAdd)
            Text('Maximum atteint',
                style: theme.labelSmall
                    ?.copyWith(color: TekaColors.warningForeground)),
        ]),
        const SizedBox(height: TekaSpacing.xxs),
        Text(
          images.isEmpty
              ? 'Ajoutez au moins une photo nette sur fond clair. La première sert de couverture.'
              : 'La première photo sert de couverture.',
          style: theme.bodySmall?.copyWith(color: TekaColors.neutralForeground),
        ),
        if (_failedCrop != null) ...[
          const SizedBox(height: TekaSpacing.xs),
          _FailedUploadNotice(
            onRetry: _isUploading
                ? null
                : () => _uploadCrop(product.id, _failedCrop!),
            onDiscard: _isUploading ? null : _discardFailedCrop,
          ),
        ],
        const SizedBox(height: TekaSpacing.xs),
        // Tablet phase (2026-09-07): tile count from the width the manager is
        // given, minimum three; the image_picker capture size is untouched.
        LayoutBuilder(
          builder: (context, constraints) => GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: gridColumnsFor(
                constraints.maxWidth,
                minCellWidth: 110,
                spacing: TekaSpacing.xs,
                minColumns: 3,
                maxColumns: 6,
              ),
              crossAxisSpacing: TekaSpacing.xs,
              mainAxisSpacing: TekaSpacing.xs,
            ),
            itemCount: images.length + (canAdd ? 1 : 0),
            itemBuilder: (context, index) {
              if (index < images.length) {
                final image = images[index];
                return ImageUploadTile(
                  image: image,
                  isCover: index == 0,
                  onDelete: () => _confirmDeleteImage(product.id, image),
                );
              }
              return ImageUploadTile(
                isUploading: _isUploading,
                onTap: () => _chooseSourceAndUpload(product.id),
              );
            },
          ),
        ),
      ],
    );
  }

  /// Source sheet (PR A white sheet theme). Camera, gallery, and — while a
  /// shelf photo is kept — « Recadrer à nouveau la photo précédente », so one
  /// photo of several products feeds several product listings.
  Future<void> _chooseSourceAndUpload(String productId) async {
    if (_isUploading) return; // guard against duplicate taps
    final session = ref.read(sourcePhotoSessionProvider.notifier);
    final hasSource = await session.isAvailable();
    if (!mounted) return;
    final source = ref.read(sourcePhotoSessionProvider);

    final choice = await showModalBottomSheet<_PhotoChoice>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) {
        final theme = Theme.of(sheetContext).textTheme;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: TekaSpacing.xs),
              Container(
                width: 40,
                height: 4,
                decoration: const BoxDecoration(
                    color: TekaColors.border, borderRadius: TekaRadius.pillAll),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                    TekaSpacing.md, TekaSpacing.sm, TekaSpacing.md, 0),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Ajouter une photo', style: theme.titleMedium),
                ),
              ),
              if (hasSource && source != null) ...[
                ListTile(
                  leading: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Image.file(
                      source,
                      width: 40,
                      height: 40,
                      fit: BoxFit.cover,
                      // Decode a thumbnail, never the full shelf photo.
                      cacheWidth: 120,
                      errorBuilder: (_, __, ___) =>
                          const Icon(Icons.crop_outlined),
                    ),
                  ),
                  title: const Text('Recadrer à nouveau la photo précédente'),
                  subtitle: const Text('Pour un autre produit de la même photo'),
                  onTap: () => Navigator.pop(sheetContext, _PhotoChoice.reuse),
                ),
                ListTile(
                  leading: const Icon(Icons.done_all_outlined),
                  title: const Text('Terminer avec cette photo'),
                  subtitle: const Text('Elle est retirée de votre téléphone'),
                  onTap: () =>
                      Navigator.pop(sheetContext, _PhotoChoice.finishSource),
                ),
                const Divider(height: 1),
              ],
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Prendre une photo'),
                onTap: () => Navigator.pop(sheetContext, _PhotoChoice.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Choisir dans la galerie'),
                onTap: () => Navigator.pop(sheetContext, _PhotoChoice.gallery),
              ),
              const SizedBox(height: TekaSpacing.xs),
            ],
          ),
        );
      },
    );
    if (choice == null || !mounted) return;
    if (choice == _PhotoChoice.finishSource) {
      await session.clear();
      if (mounted) {
        showAppSnackbar(context,
            message: 'Photo précédente retirée.',
            tone: AppSnackbarTone.neutral);
      }
      return;
    }
    await _pickCropAndUpload(productId, choice);
  }

  /// pick (or reuse) → crop into a NEW file → upload. Nothing is uploaded
  /// before the seller confirms the crop, so a cancelled crop costs nothing
  /// on Cloudinary.
  Future<void> _pickCropAndUpload(String productId, _PhotoChoice choice) async {
    if (_isUploading) return; // guard against duplicate uploads
    final session = ref.read(sourcePhotoSessionProvider.notifier);
    try {
      final String sourcePath;
      if (choice == _PhotoChoice.reuse) {
        if (!await session.isAvailable()) {
          if (mounted) {
            showAppSnackbar(context,
                message:
                    'La photo précédente n’est plus disponible. Reprenez une photo.',
                tone: AppSnackbarTone.warning);
          }
          return;
        }
        sourcePath = ref.read(sourcePhotoSessionProvider)!.path;
      } else {
        final picked = await ref.read(sourcePhotoPickerProvider).pick(
            choice == _PhotoChoice.camera
                ? ImageSource.camera
                : ImageSource.gallery);
        if (picked == null || !mounted) return;
        sourcePath = (await session.adopt(picked)).path;
      }
      if (!mounted) return;

      final cropped = await ref.read(photoCropperProvider).crop(sourcePath);
      if (cropped == null) {
        const PosthogAnalytics().capture('seller_image_crop_cancelled');
        return; // the source is kept for the next attempt
      }
      const PosthogAnalytics().capture('seller_image_crop_completed',
          properties: {'source': choice.name});
      if (!mounted) {
        await discardCropFile(cropped);
        return;
      }
      await _uploadCrop(productId, cropped);
    } on PlatformException catch (e, stack) {
      // Camera / photo-library permission denied at the OS level.
      if (mounted) {
        final denied =
            e.code == 'camera_access_denied' || e.code == 'photo_access_denied';
        showAppSnackbar(context,
            message: denied
                ? 'Accès refusé. Autorisez l’appareil photo ou les photos dans les réglages de votre téléphone.'
                : friendlyErrorMessage(e, stack),
            tone: AppSnackbarTone.error);
      }
    } catch (e, stack) {
      if (mounted) {
        showAppSnackbar(context,
            message: friendlyErrorMessage(e, stack),
            tone: AppSnackbarTone.error);
      }
    }
  }

  /// Uploads one confirmed crop. On failure the crop is KEPT and offered
  /// back as « Réessayer » — an explicit tap, never an automatic replay: the
  /// upload creates an image row and is not idempotent.
  Future<void> _uploadCrop(String productId, File cropped) async {
    if (_isUploading) return;
    setState(() {
      _isUploading = true;
      _failedCrop = null;
    });
    try {
      await ref.read(productsRepositoryProvider).uploadImage(productId, cropped);
      await discardCropFile(cropped);

      // Refresh the product (this widget) + the list thumbnails.
      ref.invalidate(productDetailProvider(widget.productId));
      ref.read(sellerProductsProvider.notifier).loadProducts();

      if (mounted) {
        final keepsSource = ref.read(sourcePhotoSessionProvider) != null;
        showAppSnackbar(context,
            message: keepsSource
                ? 'Photo ajoutée. La photo d’origine reste disponible pour un autre produit.'
                : 'Photo ajoutée.',
            tone: AppSnackbarTone.success);
      }
    } catch (e, stack) {
      if (mounted) {
        setState(() => _failedCrop = cropped);
        showAppSnackbar(context,
            message: friendlyErrorMessage(e, stack),
            tone: AppSnackbarTone.error);
      } else {
        await discardCropFile(cropped);
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  Future<void> _discardFailedCrop() async {
    final failed = _failedCrop;
    setState(() => _failedCrop = null);
    await discardCropFile(failed);
  }

  Future<void> _confirmDeleteImage(
      String productId, ProductImageModel image) async {
    var popped = false;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer cette photo ?'),
        content: const Text(
            'Elle sera retirée définitivement de la fiche et de nos serveurs.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () {
              if (popped) return;
              popped = true;
              Navigator.pop(ctx, true);
            },
            style: ElevatedButton.styleFrom(
                backgroundColor: TekaColors.destructive),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await ref
          .read(productsRepositoryProvider)
          .deleteImage(productId, image.id);

      ref.invalidate(productDetailProvider(widget.productId));
      ref.read(sellerProductsProvider.notifier).loadProducts();

      if (mounted) {
        showAppSnackbar(context,
            message: 'Photo supprimée.', tone: AppSnackbarTone.neutral);
      }
    } catch (e) {
      if (mounted) {
        showAppSnackbar(context,
            message: friendlyErrorMessage(e), tone: AppSnackbarTone.error);
      }
    }
  }
}

enum _PhotoChoice { camera, gallery, reuse, finishSource }

class _FailedUploadNotice extends StatelessWidget {
  final VoidCallback? onRetry;
  final VoidCallback? onDiscard;

  const _FailedUploadNotice({required this.onRetry, required this.onDiscard});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(
          TekaSpacing.sm, TekaSpacing.xs, TekaSpacing.xs, TekaSpacing.xs),
      decoration: BoxDecoration(
        color: TekaColors.warningSubtle,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(children: [
        const Icon(Icons.cloud_off_outlined,
            size: 20, color: TekaColors.warningForeground),
        const SizedBox(width: TekaSpacing.xs),
        Expanded(
          child: Text('Une photo recadrée n’a pas été envoyée.',
              style: theme.bodySmall
                  ?.copyWith(color: TekaColors.warningForeground)),
        ),
        TextButton(onPressed: onDiscard, child: const Text('Abandonner')),
        TextButton(onPressed: onRetry, child: const Text('Réessayer')),
      ]),
    );
  }
}
