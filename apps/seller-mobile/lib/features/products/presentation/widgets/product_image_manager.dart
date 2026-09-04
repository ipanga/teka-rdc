import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
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
/// add + delete (no reorder endpoint), matching seller-web's inline uploader.
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
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          children: [
            Text(
              friendlyErrorMessage(e),
              textAlign: TextAlign.center,
              style: const TextStyle(color: TekaColors.mutedForeground),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () =>
                  ref.invalidate(productDetailProvider(widget.productId)),
              icon: const Icon(Icons.refresh, size: 18),
              label: Text("Réessayer"),
            ),
          ],
        ),
      ),
      data: (product) => _buildContent(context, product),
    );
  }

  Widget _buildContent(BuildContext context, SellerProductModel product) {
    final images = product.images;
    final canAdd = images.length < _maxImages;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              "${images.length}/$_maxImages images",
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            if (images.length >= _maxImages) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: TekaColors.warning.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  "Maximum atteint",
                  style: const TextStyle(
                    fontSize: 11,
                    color: TekaColors.warning,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
          ),
          itemCount: images.length + (canAdd ? 1 : 0),
          itemBuilder: (context, index) {
            if (index < images.length) {
              final image = images[index];
              return ImageUploadTile(
                image: image,
                onDelete: () => _confirmDeleteImage(context, product.id, image),
              );
            }
            return ImageUploadTile(
              isUploading: _isUploading,
              onTap: () => _chooseSourceAndUpload(context, product.id),
            );
          },
        ),
      ],
    );
  }

  /// Bottom sheet letting the seller take a new photo or pick from the gallery.
  /// French labels; reuses the same upload pipeline for both sources.
  Future<void> _chooseSourceAndUpload(
      BuildContext context, String productId) async {
    if (_isUploading) return; // guard against duplicate taps
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: TekaColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined,
                    color: TekaColors.tekaRed),
                title: Text("Prendre une photo"),
                onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined,
                    color: TekaColors.tekaRed),
                title: Text("Choisir dans la galerie"),
                onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
    if (source == null || !mounted) return;
    await _pickAndUploadImage(context, productId, source);
  }

  Future<void> _pickAndUploadImage(
      BuildContext context, String productId, ImageSource source) async {
    if (_isUploading) return; // guard against duplicate uploads
    try {
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Image ajoutée"),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } on PlatformException catch (e) {
      // Camera / photo-library permission denied at the OS level. image_picker
      // surfaces these as PlatformException codes — map to a clear French hint.
      if (mounted) {
        final denied = e.code == 'camera_access_denied' ||
            e.code == 'photo_access_denied';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(denied
                ? "Accès refusé. Autorisez l'appareil photo ou les photos "
                    'dans les réglages de votre téléphone.'
                : friendlyErrorMessage(e)),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(friendlyErrorMessage(e)),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  Future<void> _confirmDeleteImage(
      BuildContext context, String productId, ProductImageModel image) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text("Supprimer l'image"),
        content: Text("Voulez-vous supprimer cette image ?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text("Annuler"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: TekaColors.destructive,
            ),
            child: Text("Supprimer"),
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Image supprimée"),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(friendlyErrorMessage(e)),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }
}
