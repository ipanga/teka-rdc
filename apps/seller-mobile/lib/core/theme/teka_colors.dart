import 'package:flutter/material.dart';

class TekaColors {
  TekaColors._();
  static const Color tekaRed = Color(0xFFC8102E);
  static const Color tekaRedDark = Color(0xFF8F0B21);
  static const Color success = Color(0xFF16A34A);
  static const Color warning = Color(0xFFF59E0B);
  static const Color destructive = Color(0xFFEF4444);
  static const Color info = Color(0xFF2563EB);
  // Dark semantic foregrounds for readable text on pale status surfaces.
  // Existing bright colors remain available for non-text accents.
  static const Color neutralForeground = Color(0xFF475569);
  static const Color successForeground = Color(0xFF166534);
  static const Color warningForeground = Color(0xFF92400E);
  static const Color destructiveForeground = Color(0xFFB91C1C);
  static const Color infoForeground = Color(0xFF1E40AF);
  static const Color pageBackground = Color(0xFFF8FAFC);
  static const Color background = Color(0xFFFFFFFF);
  static const Color foreground = Color(0xFF1E293B);
  static const Color muted = Color(0xFFF1F5F9);
  static const Color mutedForeground = Color(0xFF64748B);
  static const Color border = Color(0xFFE2E8F0);

  // === Pale status surfaces (Seller UX PR A) ============================
  // The dark *Foreground variants above are for text on these. Chips and
  // notices used to blend the bright colour at 8% alpha ad hoc; naming the
  // surfaces keeps every status card the same tint.
  static const Color successSubtle = Color(0xFFDCFCE7);
  static const Color warningSubtle = Color(0xFFFEF3C7);
  static const Color destructiveSubtle = Color(0xFFFEE2E2);
  static const Color infoSubtle = Color(0xFFDBEAFE);

  // === Process states (Seller UX PR A) =================================
  // Three colours lived as raw hex in the payout and promotion badges. Named
  // for the state they mark, not the hue, so a redesign changes one line.
  /// A payout that has been requested/approved and is moving — blue-500.
  static const Color processing = Color(0xFF3B82F6);
  /// A payout in transit between Teka and the seller's account — violet-500.
  static const Color inTransit = Color(0xFF8B5CF6);
  /// An ended or inactive item (expired promotion) — gray-400.
  static const Color inactive = Color(0xFF9CA3AF);

  // === Elevation ========================================================
  // Seller uses borders, not shadows, for hierarchy. The one sanctioned shadow
  // is the soft lift under a floating header; mirrors buyer-mobile's pair.
  static const Color shadowSoft = Color(0x14000000);
  static const Color shadowMedium = Color(0x1A000000);
}
