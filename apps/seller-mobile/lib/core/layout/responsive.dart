/// Responsive layout foundation (tablet phase, 2026-09-07).
///
/// Before this file both apps assumed a phone: product grids were hardcoded to
/// two columns, the card height was derived from the WINDOW width divided by
/// two, forms ran edge to edge, and bottom sheets and dialogs took the full
/// tablet width. Everything here works from the width a widget is actually
/// given — never from a device name, a platform check or a shortest-side
/// heuristic — so it behaves identically on an Android tablet, an iPad, a
/// phone in landscape and a split-screen window.
///
/// Kept byte-identical between buyer-mobile and seller-mobile (like
/// `core/connectivity` and `core/network`): `diff` the two files before
/// calling a change done.
library;

import 'dart:math' as math;

import 'package:flutter/widgets.dart';

/// Material 3 window width classes, measured on the layout width in logical
/// pixels. The boundaries are the platform's own and match what was tested:
/// 360–390 phones and 400-wide split view stay compact; 600 (7" tablet
/// portrait, phone landscape) and 768 are medium; 834 iPad portrait sits at
/// the top of medium; 1024+ (tablet landscape, 12.9" iPad) is expanded.
enum LayoutWidthClass {
  /// < 600 — phones, narrow split-screen windows.
  compact,

  /// 600–839 — small tablets in portrait, large phones in landscape.
  medium,

  /// ≥ 840 — tablets in landscape, large tablets in portrait.
  expanded;

  bool get isCompact => this == LayoutWidthClass.compact;
  bool get isAtLeastMedium => this != LayoutWidthClass.compact;
  bool get isExpanded => this == LayoutWidthClass.expanded;
}

const double kMediumWidthBreakpoint = 600;
const double kExpandedWidthBreakpoint = 840;

LayoutWidthClass widthClassFor(double width) {
  if (width >= kExpandedWidthBreakpoint) return LayoutWidthClass.expanded;
  if (width >= kMediumWidthBreakpoint) return LayoutWidthClass.medium;
  return LayoutWidthClass.compact;
}

/// Width class of the whole window. Use [widthClassFor] with a
/// `LayoutBuilder`'s constraints when a widget only owns part of the screen.
LayoutWidthClass windowWidthClass(BuildContext context) =>
    widthClassFor(MediaQuery.sizeOf(context).width);

/// How wide a column of text, form fields or a summary should ever get.
///
/// A form stretched across a 1024 pt tablet is unreadable: the eye travels
/// too far and every field looks like a page-wide bar. Cards and grids are
/// NOT constrained by this — they use the full width and gain columns
/// instead (see [gridColumnsFor]).
double readableMaxWidth(LayoutWidthClass widthClass) {
  switch (widthClass) {
    case LayoutWidthClass.compact:
      return double.infinity;
    case LayoutWidthClass.medium:
      return 640;
    case LayoutWidthClass.expanded:
      return 720;
  }
}

/// Horizontal page padding. Slightly wider on tablets so content does not
/// touch the bezel, without inventing a new spacing scale.
double pagePadding(LayoutWidthClass widthClass) =>
    widthClass.isCompact ? 16 : 24;

/// Columns for a card grid, from the width actually available.
///
/// Driven by a minimum readable card width rather than a device class, so a
/// 600 pt window gets 3 columns and a 1024 pt one gets 5 — and a phone stays
/// at 2 whatever its density. [minCellWidth] is the smallest a product card
/// may become before its title and price stop fitting.
int gridColumnsFor(
  double availableWidth, {
  double minCellWidth = 168,
  double spacing = 12,
  int minColumns = 2,
  int maxColumns = 5,
}) {
  if (availableWidth <= 0) return minColumns;
  final fit = ((availableWidth + spacing) / (minCellWidth + spacing)).floor();
  return fit.clamp(minColumns, maxColumns);
}

/// Width of one cell in a grid of [columns] columns.
double gridCellWidth(
  double availableWidth, {
  required int columns,
  double spacing = 12,
}) {
  if (columns <= 0) return availableWidth;
  return (availableWidth - spacing * (columns - 1)) / columns;
}

/// Centers [child] in a column no wider than [maxWidth] (defaults to the
/// readable width for the current window) and applies the page padding.
///
/// On a phone this is exactly the previous layout: the constraint is infinite
/// and the padding unchanged.
class ReadableColumn extends StatelessWidget {
  final Widget child;
  final double? maxWidth;
  final EdgeInsetsGeometry? padding;

  const ReadableColumn({
    super.key,
    required this.child,
    this.maxWidth,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final widthClass = widthClassFor(constraints.maxWidth);
        final limit = maxWidth ?? readableMaxWidth(widthClass);
        final resolvedPadding = padding ??
            EdgeInsets.symmetric(horizontal: pagePadding(widthClass));
        return Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: limit),
            child: Padding(padding: resolvedPadding, child: child),
          ),
        );
      },
    );
  }
}

/// Same idea for a bar pinned to the bottom (cart total, checkout CTA): the
/// button should not span a whole tablet.
class ReadableBottomBar extends StatelessWidget {
  final Widget child;
  final double? maxWidth;

  const ReadableBottomBar({super.key, required this.child, this.maxWidth});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final limit =
            maxWidth ?? readableMaxWidth(widthClassFor(constraints.maxWidth));
        return Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: limit),
            child: child,
          ),
        );
      },
    );
  }
}

/// Bottom sheets and dialogs: full width on a phone, a centered panel on a
/// tablet. Applied through the theme so every sheet and dialog in the app
/// inherits it instead of each call site repeating a number.
const BoxConstraints kSheetConstraints = BoxConstraints(maxWidth: 640);

/// Height for a hero/gallery image of [availableWidth].
///
/// A product gallery is 0.8 of its width; across a 1024 pt tablet that is an
/// 819 pt wall of photo with the title pushed off screen. On a phone the
/// natural height is kept exactly as before; on a tablet it is capped so the
/// image stays a header and the buying information stays visible.
/// [aspectRatio] is width / height (1.0 = square).
double heroImageHeight(double availableWidth, {double aspectRatio = 1.0}) {
  final natural = availableWidth / aspectRatio;
  switch (widthClassFor(availableWidth)) {
    case LayoutWidthClass.compact:
      return natural; // unchanged from the phone layout
    case LayoutWidthClass.medium:
      return math.min(natural, 420);
    case LayoutWidthClass.expanded:
      return math.min(natural, 480);
  }
}
