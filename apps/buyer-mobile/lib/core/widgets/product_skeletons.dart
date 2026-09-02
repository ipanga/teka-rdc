import 'package:flutter/material.dart';
import '../theme/teka_colors.dart';

const double kProductGridSpacing = 12;
const double kProductDetailGalleryAspectRatio = 1.25;

/// A lightweight shimmer placeholder block — a muted rounded rectangle with a
/// sliding highlight. Dependency-free (no `shimmer` package); used to build the
/// content-shaped skeletons below. Critical on DRC 2G/3G where bare spinners
/// give no sense of what's loading.
class ShimmerBox extends StatefulWidget {
  final double? width;
  final double height;
  final double radius;

  const ShimmerBox({
    super.key,
    this.width,
    required this.height,
    this.radius = 8,
  });

  @override
  State<ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<ShimmerBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) {
      return Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: TekaColors.surfaceMuted,
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      );
    }

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = _controller.value; // 0 → 1
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radius),
            gradient: LinearGradient(
              // Slide the highlight band left→right across the box.
              begin: Alignment(-1.0 + 3 * t, 0),
              end: Alignment(-0.4 + 3 * t, 0),
              colors: const [
                TekaColors.surfaceMuted,
                TekaColors.surfaceHover,
                TekaColors.surfaceMuted,
              ],
            ),
          ),
        );
      },
    );
  }
}

/// A content-shaped Product Detail placeholder. It preserves the gallery and
/// summary geometry while the product request is in flight, preventing the
/// bare-spinner-to-full-page layout jump that is especially noticeable on
/// slower mobile connections.
class ProductDetailSkeleton extends StatelessWidget {
  const ProductDetailSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: 'Chargement du produit',
      child: ExcludeSemantics(
        child: SingleChildScrollView(
          physics: const NeverScrollableScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AspectRatio(
                aspectRatio: kProductDetailGalleryAspectRatio,
                child: ShimmerBox(height: double.infinity, radius: 0),
              ),
              Container(
                width: double.infinity,
                color: TekaColors.surface,
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ShimmerBox(height: 20, radius: 5),
                    SizedBox(height: 8),
                    ShimmerBox(width: 230, height: 20, radius: 5),
                    SizedBox(height: 18),
                    Row(
                      children: [
                        ShimmerBox(width: 120, height: 16, radius: 5),
                        Spacer(),
                        ShimmerBox(width: 44, height: 44, radius: 22),
                        SizedBox(width: 8),
                        ShimmerBox(width: 44, height: 44, radius: 22),
                      ],
                    ),
                    SizedBox(height: 18),
                    ShimmerBox(width: 170, height: 28, radius: 6),
                    SizedBox(height: 12),
                    ShimmerBox(width: 110, height: 16, radius: 5),
                    SizedBox(height: 20),
                    ShimmerBox(height: 72, radius: 10),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Skeleton matching [ProductCard]'s shape: square image block + two title
/// lines + a price bar, inside the same bordered card.
class ProductCardSkeleton extends StatelessWidget {
  const ProductCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: TekaColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: TekaColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AspectRatio(
            aspectRatio: 1,
            child: ShimmerBox(height: double.infinity, radius: 0),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                ShimmerBox(height: 12, radius: 4),
                SizedBox(height: 6),
                ShimmerBox(width: 90, height: 12, radius: 4),
                SizedBox(height: 12),
                ShimmerBox(width: 70, height: 16, radius: 4),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A non-scrolling grid of [ProductCardSkeleton] for a loading product grid
/// (drop-in where the real GridView renders). Mirrors the shared grid metrics.
class ProductGridSkeleton extends StatelessWidget {
  final int count;
  final EdgeInsetsGeometry padding;
  final double? mainAxisExtent;

  const ProductGridSkeleton({
    super.key,
    this.count = 6,
    this.padding = const EdgeInsets.symmetric(horizontal: 16),
    this.mainAxisExtent,
  });

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: padding,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisExtent: mainAxisExtent,
        childAspectRatio: mainAxisExtent == null ? 0.58 : 1,
        crossAxisSpacing: kProductGridSpacing,
        mainAxisSpacing: kProductGridSpacing,
      ),
      itemCount: count,
      itemBuilder: (_, __) => const ProductCardSkeleton(),
    );
  }
}

/// A horizontal strip of skeleton cards for a loading horizontal product list
/// (e.g. the home "Produits populaires" row). [itemWidth]/[height] should match
/// the real row.
class ProductRowSkeleton extends StatelessWidget {
  final double height;
  final double itemWidth;
  final int count;

  const ProductRowSkeleton({
    super.key,
    this.height = 280,
    this.itemWidth = 160,
    this.count = 4,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: count,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, __) => SizedBox(
          width: itemWidth,
          child: const ProductCardSkeleton(),
        ),
      ),
    );
  }
}
