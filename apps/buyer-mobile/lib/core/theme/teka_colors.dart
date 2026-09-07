import 'package:flutter/material.dart';

/// Teka design tokens — mirrors the web `@theme inline` block at
/// `apps/buyer-web/src/app/globals.css`. The brand red is "Modern Ruby"
/// (#C8102E — cleaner/brighter than the old #BF0000, AA-safe for white text,
/// used as accent not flood), aligned 2026-06-21. Keep web and mobile in sync
/// when adjusting.
///
/// Payments are Cash on Delivery only (2026-05-26), so the Mobile Money
/// provider colours that lived here were removed in the UX polish phase —
/// they had no call site left.
class TekaColors {
  TekaColors._();

  // === Brand red — Teka "Modern Ruby" tonal scale ======================
  static const Color tekaRed50 = Color(0xFFFFF1F2);
  static const Color tekaRed100 = Color(0xFFFFE0E2);
  static const Color tekaRed200 = Color(0xFFFFC5CA);
  static const Color tekaRed300 = Color(0xFFFB7A85);
  static const Color tekaRed400 = Color(0xFFF24A5A);
  static const Color tekaRed500 = Color(0xFFE11D33); // bright accent
  static const Color tekaRed600 = Color(0xFFC8102E); // canonical brand red
  static const Color tekaRed700 = Color(0xFFA60D26);
  static const Color tekaRed800 = Color(0xFF850A1F);
  static const Color tekaRed900 = Color(0xFF6B0A1A);
  static const Color tekaRed = tekaRed600;
  static const Color tekaRedHover = tekaRed700;
  static const Color tekaRedPressed = tekaRed800;
  static const Color tekaRedSubtle = tekaRed50;

  // === Town accents — copper (Lubumbashi) / cobalt (Kolwezi) ===========
  // Subtle, for city badge/chips only — the global brand stays unified.
  // Mirrors web `lib/city-accent.ts`.
  static const Color accentCopper = Color(0xFFB87333);
  static const Color accentCopperSubtle = Color(0xFFF7EEE4);
  static const Color accentCobalt = Color(0xFF1A56DB);
  static const Color accentCobaltSubtle = Color(0xFFE8EEFD);

  /// Town accent for a city's data-driven accent key (Town Architecture
  /// Refactor): 'copper' / 'cobalt' come from `City.accentColor`, so future
  /// towns are config-only — no hardcoded slug switch. Anything else (incl.
  /// null) falls back to the brand red. Returns the (accent, subtle) pair.
  static (Color, Color) cityAccent(String? accentColor) {
    switch (accentColor) {
      case 'copper':
        return (accentCopper, accentCopperSubtle);
      case 'cobalt':
        return (accentCobalt, accentCobaltSubtle);
      default:
        return (tekaRed, tekaRedSubtle);
    }
  }

  // === Neutrals (slate scale) ==========================================
  static const Color background = Color(0xFFFFFFFF);
  static const Color foreground = Color(0xFF172033);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF6F7F9);
  static const Color surfaceHover = Color(0xFFF7F7F8);
  static const Color muted = Color(0xFFF3F4F6);
  static const Color mutedForeground = Color(0xFF667085);
  static const Color border = Color(0xFFE5E7EB);
  static const Color borderStrong = Color(0xFFD1D5DB);

  // === Semantic status colors ==========================================
  static const Color success = Color(0xFF16A34A);
  static const Color successSubtle = Color(0xFFDCFCE7);
  static const Color warning = Color(0xFFF59E0B);
  static const Color warningSubtle = Color(0xFFFEF3C7);
  static const Color destructive = Color(0xFFEF4444);
  static const Color destructiveSubtle = Color(0xFFFEE2E2);
  static const Color info = Color(0xFF2563EB);
  static const Color infoSubtle = Color(0xFFDBEAFE);

  // === Order status semantic colors ====================================
  // Single source of truth for order-status colors. Mirrors the web
  // `<OrderStatusBadge>` mapping at apps/buyer-web/src/components/orders/.
  static Color orderStatusColor(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return warning;
      case 'CONFIRMED':
      case 'PROCESSING':
        return info;
      case 'READY_FOR_TEKA_PICKUP':
      case 'RECEIVED_AT_TEKA':
        return const Color(0xFF6366F1); // indigo-500 — Teka custody
      case 'SHIPPED':
      case 'OUT_FOR_DELIVERY':
        return const Color(0xFF8B5CF6); // purple-500 — keeps SHIPPED visual
      case 'DELIVERED':
        return success;
      case 'CANCELLED':
      case 'RETURNED':
        return destructive;
      default:
        return mutedForeground;
    }
  }

  // === Amber / notice ==================================================
  // `warning` is the fill; these two are the readable text weights on a pale
  // amber surface (checkout's COD notice) and the review star. They existed as
  // raw hex literals in four files before the UX polish phase.
  static const Color warningStrong = Color(0xFFB45309);
  static const Color warningText = Color(0xFF92400E);

  /// Review and rating stars. Same amber as `warning` by design, but named for
  /// what it is: a star is not a warning, and the two must be free to diverge.
  static const Color ratingStar = Color(0xFFF59E0B);

  // === Elevation ========================================================
  // The app uses borders, not shadows, for hierarchy. These two are the only
  // sanctioned shadows: a soft edge under a bar and a slightly deeper one
  // under a floating header.
  static const Color shadowSoft = Color(0x14000000);
  static const Color shadowMedium = Color(0x1A000000);
}
