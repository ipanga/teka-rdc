import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/layout/responsive.dart';
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
  final ImagePicker _picker = ImagePicker();
  bool _isUploading = false;

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

  /// Source sheet (PR A white sheet theme): camera or gallery, one upload
  /// pipeline for both.
  Future<void> _chooseSourceAndUpload(String productId) async {
    if (_isUploading) return; // guard against duplicate taps
    final source = await showModalBottomSheet<ImageSource>(
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
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Prendre une photo'),
                onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Choisir dans la galerie'),
                onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
              ),
              const SizedBox(height: TekaSpacing.xs),
            ],
          ),
        );
      },
    );
    if (source == null || !mounted) return;
    await _pickAndUploadImage(productId, source);
  }

  Future<void> _pickAndUploadImage(String productId, ImageSource source) async {
    if (_isUploading) return; // guard against duplicate uploads
    try {
      // Capture size is a deliberate constant (Rule: not changed for a
      // bigger screen); the repository compresses to ≤ 500 KB WebP after.
      final xFile = await _picker.pickImage(
        source: source,
        maxWidth: 1200,
        maxHeight: 1200,
        imageQuality: 80,
      );
      if (xFile == null || !mounted) return;

      setState(() => _isUploading = true);

      final file = File(xFile.path);
      await ref.read(productsRepositoryProvider).uploadImage(productId, file);

      // Refresh the product (this widget) + the list thumbnails.
      ref.invalidate(productDetailProvider(widget.productId));
      ref.read(sellerProductsProvider.notifier).loadProducts();

      if (mounted) {
        showAppSnackbar(context,
            message: 'Photo ajoutée.', tone: AppSnackbarTone.success);
      }
    } on PlatformException catch (e) {
      // Camera / photo-library permission denied at the OS level.
      if (mounted) {
        final denied =
            e.code == 'camera_access_denied' || e.code == 'photo_access_denied';
        showAppSnackbar(context,
            message: denied
                ? 'Accès refusé. Autorisez l’appareil photo ou les photos dans les réglages de votre téléphone.'
                : friendlyErrorMessage(e),
            tone: AppSnackbarTone.error);
      }
    } catch (e) {
      if (mounted) {
        // The photo stays on the device: tapping « Ajouter » again retries.
        showAppSnackbar(context,
            message: friendlyErrorMessage(e), tone: AppSnackbarTone.error);
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
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
