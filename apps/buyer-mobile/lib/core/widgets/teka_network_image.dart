import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme/teka_colors.dart';
import '../theme/teka_spacing.dart';
import 'product_skeletons.dart';

/// The one way Buyer Mobile renders a remote image (UX/UI polish phase,
/// 2026-09-07).
///
/// Before this widget there were seven network-image call sites and six
/// different loading/error treatments: a spinner here, a bare icon there, a
/// grey block with no affordance on the home banners — which is exactly what
/// a buyer saw when an admin banner's URL 404'd. Two of the seven used raw
/// `Image.network`, so banners and flash deals bypassed the cache and decoded
/// at full resolution on a 2 GB phone.
///
/// This widget fixes all three at once:
///  * **one loading state** — the same shimmer the skeletons use, so a
///    loading image reads as "content on the way" rather than a dead panel;
///  * **one failure state** — a muted surface, a neutral icon and a French
///    semantic label, identical everywhere, so a broken image never looks
///    like a broken screen;
///  * **one pipeline** — `CachedNetworkImage` with a decode width derived
///    from the box it is given, so nothing decodes a 2000 px bitmap into a
///    56 px thumbnail.
///
/// It intentionally does NOT round its own corners: callers clip (a `Card`
/// with `Clip.antiAlias`, a `ClipRRect`) so the radius stays owned by the
/// surface, not by the image.
class TekaNetworkImage extends StatelessWidget {
  /// Remote URL. `null` or empty renders the same fallback as a failure —
  /// a product with no photo and a product whose photo is gone look alike to
  /// a buyer, and both are "no image", not "an error".
  final String? url;

  final BoxFit fit;

  /// Icon shown when there is no image. Defaults to a neutral photo glyph;
  /// pass a domain icon where it reads better (a package for an order line).
  final IconData fallbackIcon;

  /// Size of the fallback icon. Small thumbnails need a smaller glyph than a
  /// full-width banner.
  final double fallbackIconSize;

  /// Surface painted behind the fallback. Defaults to the muted neutral,
  /// which is right for a thumbnail on a white card. A banner overlays white
  /// text on a dark scrim, so it passes a dark surface instead — otherwise a
  /// missing image drops that text to 2.8:1 contrast. The icon flips to a
  /// light tint automatically on a dark background.
  final Color? fallbackBackground;

  /// Optional visible caption under the fallback icon. Off by default: a
  /// 56 pt thumbnail has no room for it. Turned on for the large images where
  /// a bare icon is ambiguous (the product gallery).
  final String? fallbackLabel;

  /// Announced to screen readers. Null keeps the image out of the semantics
  /// tree entirely, which is right for decorative thumbnails whose product
  /// name is already read out beside them.
  final String? semanticLabel;

  const TekaNetworkImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.fallbackIcon = Icons.image_outlined,
    this.fallbackIconSize = 28,
    this.fallbackBackground,
    this.fallbackLabel,
    this.semanticLabel,
  });

  @override
  Widget build(BuildContext context) {
    final source = url?.trim();
    if (source == null || source.isEmpty) return _fallback();

    return LayoutBuilder(
      builder: (context, constraints) {
        // Decode at the size actually painted. `maxWidth` is unbounded in a
        // horizontally scrolling row, so fall back to the window width rather
        // than asking for an infinite bitmap.
        final logicalWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : MediaQuery.sizeOf(context).width;
        final ratio = MediaQuery.devicePixelRatioOf(context);
        final decodeWidth = (logicalWidth * ratio).round().clamp(1, 4096);

        final image = CachedNetworkImage(
          imageUrl: source,
          fit: fit,
          memCacheWidth: decodeWidth,
          fadeInDuration: const Duration(milliseconds: 150),
          placeholder: (_, __) => const ShimmerBox(
            height: double.infinity,
            radius: 0,
          ),
          errorWidget: (_, __, ___) => _fallback(),
        );

        if (semanticLabel == null) {
          return ExcludeSemantics(child: image);
        }
        return Semantics(image: true, label: semanticLabel, child: image);
      },
    );
  }

  Widget _fallback() {
    final background = fallbackBackground ?? TekaColors.surfaceMuted;
    // Keep the glyph and caption legible whichever surface they land on.
    final onBackground = background.computeLuminance() > 0.5
        ? TekaColors.mutedForeground
        : Colors.white.withValues(alpha: 0.72);
    final box = ColoredBox(
      color: background,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              fallbackIcon,
              size: fallbackIconSize,
              color: onBackground,
            ),
            if (fallbackLabel != null) ...[
              const SizedBox(height: TekaSpacing.xs),
              Text(
                fallbackLabel!,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: onBackground,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
    );
    return Semantics(
      label: semanticLabel == null ? 'Image indisponible' : null,
      excludeSemantics: true,
      child: box,
    );
  }
}
