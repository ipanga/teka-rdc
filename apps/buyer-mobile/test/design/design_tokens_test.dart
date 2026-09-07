import 'package:buyer_mobile/core/theme/app_theme.dart';
import 'package:buyer_mobile/core/theme/teka_colors.dart';
import 'package:buyer_mobile/core/theme/teka_spacing.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Design-token guards (UX/UI polish phase, 2026-09-07).
///
/// The app's problem was never a missing design system — it was a design
/// system nothing referenced. These tests pin the scales and the semantic
/// colours so a later screen cannot quietly reintroduce a raw hex or a
/// thirteenth corner radius.
void main() {
  group('spacing scale', () {
    test('is a 4-based ladder with no duplicates', () {
      const scale = <double>[
        TekaSpacing.xxs,
        TekaSpacing.xs,
        TekaSpacing.sm,
        TekaSpacing.md,
        TekaSpacing.lg,
        TekaSpacing.xl,
        TekaSpacing.xxl,
      ];
      expect(scale.toSet().length, scale.length, reason: 'duplicate step');
      for (var i = 1; i < scale.length; i++) {
        expect(scale[i], greaterThan(scale[i - 1]), reason: 'not ascending');
      }
      for (final step in scale) {
        expect(step % 4, 0, reason: '$step is off the 4 pt grid');
      }
    });

    test('the screen gutter matches the base step', () {
      expect(TekaSpacing.screen.left, TekaSpacing.md);
      expect(TekaSpacing.screen.right, TekaSpacing.md);
    });
  });

  group('radius scale', () {
    test('is small, ascending and ends in a pill', () {
      const scale = <double>[
        TekaRadius.sm,
        TekaRadius.md,
        TekaRadius.lg,
        TekaRadius.xl,
      ];
      expect(scale.toSet().length, scale.length);
      for (var i = 1; i < scale.length; i++) {
        expect(scale[i], greaterThan(scale[i - 1]));
      }
      expect(TekaRadius.pill, greaterThan(TekaRadius.xl * 10));
    });

    test('the default step is the one the theme already uses', () {
      // AppTheme rounds buttons, inputs and cards at 8; the scale must agree,
      // otherwise "use the token" would silently restyle the whole app.
      final shape = AppTheme.lightTheme.cardTheme.shape;
      expect(shape, isA<RoundedRectangleBorder>());
      final radius = (shape! as RoundedRectangleBorder).borderRadius
          .resolve(TextDirection.ltr)
          .topLeft
          .x;
      expect(radius, TekaRadius.md);
    });
  });

  group('semantic colours', () {
    test('the rating star is named for what it is', () {
      // Same amber as `warning` today, but a distinct token: a star is not a
      // warning and the two must be free to diverge.
      expect(TekaColors.ratingStar, isNot(same(TekaColors.destructive)));
      expect(TekaColors.ratingStar.a, 1.0);
    });

    test('the notice text weights are darker than the fill', () {
      double luminance(Color c) => c.computeLuminance();
      expect(luminance(TekaColors.warningStrong),
          lessThan(luminance(TekaColors.warning)));
      expect(luminance(TekaColors.warningText),
          lessThan(luminance(TekaColors.warningStrong)));
    });

    test('both sanctioned shadows are translucent black', () {
      for (final shadow in [TekaColors.shadowSoft, TekaColors.shadowMedium]) {
        expect(shadow.a, lessThan(0.2));
        expect(shadow.r, 0);
        expect(shadow.g, 0);
        expect(shadow.b, 0);
      }
      expect(TekaColors.shadowMedium.a,
          greaterThan(TekaColors.shadowSoft.a));
    });

    test('white text on the brand red stays AA-legible', () {
      // The primary CTA is white on tekaRed everywhere; if the brand step is
      // ever lightened this fails before a designer notices.
      final ratio = (1.05) /
          (TekaColors.tekaRed.computeLuminance() + 0.05);
      expect(ratio, greaterThanOrEqualTo(4.5));
    });
  });
}
