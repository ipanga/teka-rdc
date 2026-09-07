import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/product_skeletons.dart';
import '../../data/models/product_model.dart';
import '../../../../core/widgets/teka_network_image.dart';

class ImageGallery extends StatefulWidget {
  final List<ProductImageModel> images;

  const ImageGallery({super.key, required this.images});

  @override
  State<ImageGallery> createState() => _ImageGalleryState();
}

class _ImageGalleryState extends State<ImageGallery> {
  int _currentPage = 0;
  late final PageController _pageController;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  /// Sizes the gallery for the width it is given (tablet phase, 2026-09-07).
  ///
  /// It used to be a bare `AspectRatio`, so on a 1024 pt tablet the photo
  /// became an 819 pt wall and the title, price and « Ajouter au panier » all
  /// fell below the fold. On a phone this renders exactly the previous box;
  /// above 600 pt the height is capped and the image (already
  /// `BoxFit.contain`) letterboxes instead of being cropped. The decode width
  /// follows the frame rather than the window, so a constrained gallery no
  /// longer decodes a full-tablet-width bitmap.
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) =>
          _buildGallery(context, constraints.maxWidth),
    );
  }

  Widget _buildGallery(BuildContext context, double frameWidth) {
    final frameHeight = heroImageHeight(
      frameWidth,
      aspectRatio: kProductDetailGalleryAspectRatio,
    );

    if (widget.images.isEmpty) {
      return SizedBox(
        width: frameWidth,
        height: frameHeight,
        child: Container(
          color: TekaColors.surface,
          child: Semantics(
            label: 'Aucune image disponible pour ce produit',
            child: const Center(
              child: Icon(
                Icons.image_outlined,
                size: 56,
                color: TekaColors.mutedForeground,
              ),
            ),
          ),
        ),
      );
    }

    return SizedBox(
      width: frameWidth,
      height: frameHeight,
      child: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: widget.images.length,
            onPageChanged: (page) {
              setState(() => _currentPage = page);
            },
            itemBuilder: (context, index) {
              final image = widget.images[index];
              return Semantics(
                button: true,
                label:
                    'Image ${index + 1} sur ${widget.images.length}. Ouvrir en plein écran.',
                excludeSemantics: true,
                child: GestureDetector(
                  onTap: () => _showFullScreenImage(context, index),
                  child: ColoredBox(
                    color: TekaColors.surface,
                    child: TekaNetworkImage(
                      url: image.url,
                      fit: BoxFit.contain,
                      fallbackIcon: Icons.image_not_supported_outlined,
                      fallbackIconSize: 44,
                      fallbackLabel: 'Image indisponible',
                    ),
                  ),
                ),
              );
            },
          ),
          if (widget.images.length > 1)
            Positioned(
              right: 12,
              bottom: 12,
              child: Semantics(
                liveRegion: true,
                label: 'Image ${_currentPage + 1} sur ${widget.images.length}',
                child: ExcludeSemantics(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: TekaColors.foreground.withValues(alpha: 0.72),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      '${_currentPage + 1} / ${widget.images.length}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _showFullScreenImage(BuildContext context, int initialIndex) {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (context) => _FullScreenGallery(
          images: widget.images,
          initialIndex: initialIndex,
        ),
      ),
    );
  }
}

class _FullScreenGallery extends StatefulWidget {
  final List<ProductImageModel> images;
  final int initialIndex;

  const _FullScreenGallery({
    required this.images,
    required this.initialIndex,
  });

  @override
  State<_FullScreenGallery> createState() => _FullScreenGalleryState();
}

class _FullScreenGalleryState extends State<_FullScreenGallery> {
  late int _currentPage;
  late final PageController _pageController;

  @override
  void initState() {
    super.initState();
    _currentPage = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      // No AppBar — a clean full-screen viewer with a floating top-right close
      // button (clearer than an AppBar back arrow). Swipe + zoom preserved.
      body: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: widget.images.length,
            onPageChanged: (page) {
              setState(() => _currentPage = page);
            },
            itemBuilder: (context, index) {
              return InteractiveViewer(
                child: Center(
                  child: CachedNetworkImage(
                    imageUrl: widget.images[index].url,
                    fit: BoxFit.contain,
                    placeholder: (context, url) => const Center(
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    ),
                    errorWidget: (context, url, error) => const Icon(
                      Icons.image_not_supported_outlined,
                      size: 64,
                      color: Colors.white54,
                    ),
                  ),
                ),
              );
            },
          ),
          // Top overlay (safe-area aware): page counter + close button.
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  if (widget.images.length > 1)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.45),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        '${_currentPage + 1} / ${widget.images.length}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    )
                  else
                    const SizedBox.shrink(),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    tooltip: 'Fermer',
                    icon: const Icon(Icons.close),
                    color: Colors.white,
                    iconSize: 26,
                    style: IconButton.styleFrom(
                      backgroundColor: Colors.black.withValues(alpha: 0.45),
                      minimumSize: const Size(44, 44),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
