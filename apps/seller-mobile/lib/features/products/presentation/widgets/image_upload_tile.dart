import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/product_model.dart';

class ImageUploadTile extends StatelessWidget {
  final ProductImageModel? image;
  final VoidCallback? onTap;
  final VoidCallback? onDelete;
  final bool isUploading;

  const ImageUploadTile({
    super.key,
    this.image,
    this.onTap,
    this.onDelete,
    this.isUploading = false,
  });

  @override
  Widget build(BuildContext context) {
    if (image != null) {
      return _buildImageTile(context);
    }
    return _buildAddTile(context);
  }

  Widget _buildImageTile(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.network(
            image!.thumbnailUrl ?? image!.url,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(
              color: TekaColors.muted,
              child: const Icon(Icons.broken_image, color: TekaColors.mutedForeground),
            ),
            loadingBuilder: (_, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return Container(
                color: TekaColors.muted,
                child: const Center(
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              );
            },
          ),
          if (onDelete != null)
            Positioned(
              top: 4,
              right: 4,
              child: GestureDetector(
                onTap: onDelete,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.6),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.close,
                    color: Colors.white,
                    size: 16,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildAddTile(BuildContext context) {
    return GestureDetector(
      onTap: isUploading ? null : onTap,
      child: Container(
        decoration: BoxDecoration(
          color: TekaColors.muted,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: TekaColors.border,
            style: BorderStyle.solid,
          ),
        ),
        child: isUploading
            ? const Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              )
            : const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.add_photo_alternate_outlined,
                    color: TekaColors.mutedForeground,
                    size: 32,
                  ),
                ],
              ),
      ),
    );
  }
}
