import 'package:flutter/widgets.dart';

/// Spacing and radius scales (Seller UX PR A, 2026-09-08).
///
/// Ported from buyer-mobile: the ladders are app-agnostic. Seller keeps its
/// own theme, so this is a copy by design, not a shared file — only
/// `core/layout/responsive.dart` is held byte-identical across the apps.
///
/// Seller had neither a type scale nor a spacing/radius scale: 151 raw
/// `fontSize` literals and nine distinct `BorderRadius.circular` values, so
/// two cards built a week apart never quite matched.
///
/// These are deliberately small, 4-based scales — enough to be consistent,
/// not so many that "which one?" becomes a decision. New code uses them;
/// existing screens are migrated as each screen is touched rather than in one
/// mechanical sweep, so a diff always stays reviewable.
class TekaSpacing {
  TekaSpacing._();

  /// 4 — hairline gaps inside a single line of content (icon to its label).
  static const double xxs = 4;

  /// 8 — related elements in the same block.
  static const double xs = 8;

  /// 12 — inside a card or a list row.
  static const double sm = 12;

  /// 16 — the default screen gutter and the gap between cards.
  static const double md = 16;

  /// 20 — a block and the next heading.
  static const double lg = 20;

  /// 24 — between sections of the same screen.
  static const double xl = 24;

  /// 32 — around a centred empty or error state.
  static const double xxl = 32;

  /// Default horizontal screen gutter on a phone. Tablets widen it through
  /// `pagePadding` in `core/layout/responsive.dart`.
  static const EdgeInsets screen = EdgeInsets.symmetric(horizontal: md);
}

/// Corner radii. Four steps plus a pill; anything else is a mistake.
class TekaRadius {
  TekaRadius._();

  /// 6 — pills, badges and small chips.
  static const double sm = 6;

  /// 8 — the default: buttons, inputs, cards. Matches `AppTheme`.
  static const double md = 8;

  /// 12 — containers that hold other cards (empty states, sheets' inner panels).
  static const double lg = 12;

  /// 16 — the largest surfaces: bottom sheets, hero blocks.
  static const double xl = 16;

  /// Fully rounded. Use for circular avatars and true pills only.
  static const double pill = 999;

  static const BorderRadius smAll = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius xlAll = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius pillAll = BorderRadius.all(Radius.circular(pill));
}
