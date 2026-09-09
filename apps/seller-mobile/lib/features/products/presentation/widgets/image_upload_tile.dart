import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../data/models/product_model.dart';

/// One tile of the image manager: a product photo (with its delete control
/// and, for the first one, a « Couverture » tag) or the « add » tile, which
/// shows progress in place while an upload runs.
class ImageUploadTile extends StatelessWidget {
  final ProductImageModel? image;
  final VoidCallback? onTap;
  final VoidCallback? onDelete;
  final bool isUploading;
  final bool isCover;

  const ImageUploadTile({
    super.key,
    this.image,
    this.onTap,
    this.onDelete,
    this.isUploading = false,
    this.isCover = false,
  });

  @override
  Widget build(BuildContext context) {
    if (image != null) return _buildImageTile(context);
    return _buildAddTile(context);
  }

  Widget _buildImageTile(BuildContext context) {
    const placeholder = ColoredBox(
      color: TekaColors.muted,
      child: Icon(Icons.image_outlined, color: TekaColors.mutedForeground),
    );
    return Semantics(
      image: true,
      label: isCover ? 'Photo de couverture' : 'Photo du produit',
      child: ClipRRect(
        borderRadius: TekaRadius.mdAll,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(
              image!.thumbnailUrl ?? image!.url,
              fit: BoxFit.cover,
              excludeFromSemantics: true,
              errorBuilder: (_, __, ___) => const ColoredBox(
                color: TekaColors.muted,
                child: Icon(Icons.broken_image_outlined,
                    color: TekaColors.mutedForeground),
              ),
              // Static placeholder while the bytes arrive: no spinner per
              // tile, cheap on a slow connection.
              loadingBuilder: (_, child, progress) =>
                  progress == null ? child : placeholder,
            ),
            if (isCover)
              Positioned(
                left: TekaSpacing.xxs,
                bottom: TekaSpacing.xxs,
                right: TekaSpacing.xxs,
                child: ExcludeSemantics(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: TekaSpacing.xs, vertical: 2),
                        decoration: BoxDecoration(
                          color: TekaColors.foreground.withValues(alpha: 0.75),
                          borderRadius: TekaRadius.pillAll,
                        ),
                        child: Text('Couverture',
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ),
                ),
              ),
            if (onDelete != null)
              Positioned(
                top: 2,
                right: 2,
                child: IconButton(
                  tooltip: 'Supprimer la photo',
                  onPressed: onDelete,
                  style: IconButton.styleFrom(
                    foregroundColor: Colors.white,
                    backgroundColor: Colors.black.withValues(alpha: 0.6),
                    minimumSize: const Size(44, 44),
                  ),
                  icon: const Icon(Icons.close, color: Colors.white, size: 20),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildAddTile(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      label: isUploading ? 'Envoi de la photo en cours' : 'Ajouter une photo',
      child: ExcludeSemantics(
        child: InkWell(
          onTap: isUploading ? null : onTap,
          borderRadius: TekaRadius.mdAll,
          child: Container(
            decoration: BoxDecoration(
              color: TekaColors.muted,
              borderRadius: TekaRadius.mdAll,
              border: Border.all(color: TekaColors.border),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: isUploading
                  ? [
                      const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2)),
                      const SizedBox(height: TekaSpacing.xs),
                      Text('Envoi…',
                          style: theme.labelSmall
                              ?.copyWith(color: TekaColors.neutralForeground)),
                    ]
                  : [
                      const Icon(Icons.add_photo_alternate_outlined,
                          color: TekaColors.neutralForeground, size: 28),
                      const SizedBox(height: TekaSpacing.xxs),
                      Text('Ajouter',
                          style: theme.labelSmall
                              ?.copyWith(color: TekaColors.neutralForeground)),
                    ],
            ),
          ),
        ),
      ),
    );
  }
}
