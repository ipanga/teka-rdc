import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/product_model.dart';
import '../../data/products_repository.dart';
import '../providers/products_provider.dart';
import '../widgets/image_upload_tile.dart';

class ProductImagesScreen extends ConsumerStatefulWidget {
  final String productId;

  const ProductImagesScreen({super.key, required this.productId});

  @override
  ConsumerState<ProductImagesScreen> createState() =>
      _ProductImagesScreenState();
}

class _ProductImagesScreenState extends ConsumerState<ProductImagesScreen> {
  static const int _maxImages = 8;
  final ImagePicker _picker = ImagePicker();
  bool _isUploading = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final productAsync = ref.watch(productDetailProvider(widget.productId));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.images),
      ),
      body: productAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline,
                  size: 48, color: TekaColors.destructive),
              const SizedBox(height: 12),
              Text(l10n.authGenericError),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.invalidate(productDetailProvider(widget.productId)),
                child: Text(l10n.loadMore),
              ),
            ],
          ),
        ),
        data: (product) => _buildContent(context, l10n, product),
      ),
    );
  }

  Widget _buildContent(
      BuildContext context, AppLocalizations l10n, SellerProductModel product) {
    final images = product.images;
    final canAdd = images.length < _maxImages;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Count indicator
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              Text(
                l10n.imagesCount(images.length, _maxImages),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
              if (images.length >= _maxImages) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: TekaColors.warning.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    l10n.maxImagesReached,
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
        ),

        // Grid
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(16),
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
                  onDelete: () => _confirmDeleteImage(
                      context, l10n, product.id, image),
                );
              }
              // Add tile
              return ImageUploadTile(
                isUploading: _isUploading,
                onTap: () => _pickAndUploadImage(context, l10n, product.id),
              );
            },
          ),
        ),
      ],
    );
  }

  Future<void> _pickAndUploadImage(
      BuildContext context, AppLocalizations l10n, String productId) async {
    try {
      final xFile = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1200,
        maxHeight: 1200,
        imageQuality: 80,
      );
      if (xFile == null || !mounted) return;

      setState(() => _isUploading = true);

      final file = File(xFile.path);
      await ref.read(productsRepositoryProvider).uploadImage(productId, file);

      // Refresh product detail
      ref.invalidate(productDetailProvider(widget.productId));

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.imageUploaded),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.authGenericError),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  Future<void> _confirmDeleteImage(BuildContext context, AppLocalizations l10n,
      String productId, ProductImageModel image) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.deleteImage),
        content: Text(l10n.deleteImage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: TekaColors.destructive,
            ),
            child: Text(l10n.deleteImage),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await ref
          .read(productsRepositoryProvider)
          .deleteImage(productId, image.id);

      // Refresh product detail
      ref.invalidate(productDetailProvider(widget.productId));

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.imageDeleted),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.authGenericError),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }
}
