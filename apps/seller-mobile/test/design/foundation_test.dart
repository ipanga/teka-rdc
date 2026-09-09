import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/core/theme/teka_colors.dart';
import 'package:seller_mobile/core/theme/teka_spacing.dart';

/// Seller UX PR A (2026-09-08) — the visual foundation.
///
/// Seller had no type scale, no spacing/radius scale, six raw hex colours and
/// dialogs painted a pink tint derived from the red seed. These tests pin the
/// foundation so a later screen PR cannot quietly undo it.
void main() {
  final theme = AppTheme.lightTheme;

  group('type scale', () {
    // Read the LOCALIZED theme, the one widgets actually render with:
    // `ThemeData.textTheme` carries colours only until `Theme.of` merges the
    // geometry, so unresized steps report a null fontSize there.
    Future<TextTheme> rendered(WidgetTester tester) async {
      late TextTheme t;
      await tester.pumpWidget(MaterialApp(
        theme: theme,
        home: Builder(builder: (context) {
          t = Theme.of(context).textTheme;
          return const SizedBox.shrink();
        }),
      ));
      return t;
    }

    testWidgets('exists and steps down monotonically', (tester) async {
      final t = await rendered(tester);
      final sizes = [
        t.headlineSmall!.fontSize!,
        t.titleLarge!.fontSize!,
        t.titleMedium!.fontSize!,
        t.titleSmall!.fontSize!,
        t.bodyMedium!.fontSize!,
        t.bodySmall!.fontSize!,
        t.labelSmall!.fontSize!,
      ];
      for (var i = 1; i < sizes.length; i++) {
        expect(sizes[i], lessThan(sizes[i - 1]), reason: 'step $i: $sizes');
      }
    });

    testWidgets('titleMedium gains weight but keeps Material geometry',
        (tester) async {
      // Bisected: resizing it (17 / 1.3) reflowed an unstyled consumer above
      // the product and order lists at the 320 px / 2x guard fixtures.
      final t = await rendered(tester);
      expect(t.titleMedium!.fontSize, 16);
      expect(t.titleMedium!.fontWeight, FontWeight.w600);
      // Button labels are not resized either: 68 CTAs would change at once.
      expect(t.labelLarge!.fontSize, 14);
    });

    testWidgets('body text keeps Material geometry so nothing reflows',
        (tester) async {
      final t = await rendered(tester);
      expect(t.bodyMedium!.fontSize, 14);
      expect(t.bodyMedium!.color, TekaColors.foreground);
    });
  });

  group('surfaces', () {
    test('dialogs and sheets are explicitly white, not seed-tinted', () {
      expect(theme.dialogTheme.backgroundColor, TekaColors.background);
      expect(theme.bottomSheetTheme.backgroundColor, TekaColors.background);
      expect(theme.dialogTheme.surfaceTintColor, Colors.transparent);
      expect(theme.bottomSheetTheme.surfaceTintColor, Colors.transparent);
    });

    testWidgets('a rendered dialog is white', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: theme,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => const AlertDialog(title: Text('Rejeter ?')),
                ),
                child: const Text('ouvrir'),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('ouvrir'));
      await tester.pumpAndSettle();
      final panel = tester.widget<Material>(find
          .descendant(of: find.byType(Dialog), matching: find.byType(Material))
          .first);
      expect(panel.color, TekaColors.background);
    });
  });

  group('buttons', () {
    test('FilledButton and ElevatedButton are the same primary', () {
      // 44 screens use ElevatedButton and 24 use FilledButton; before this
      // theme the second group had no styling at all.
      Color? bg(ButtonStyle? s) =>
          s?.backgroundColor?.resolve(<WidgetState>{});
      expect(bg(theme.filledButtonTheme.style), TekaColors.tekaRed);
      expect(bg(theme.elevatedButtonTheme.style), TekaColors.tekaRed);
      expect(
        theme.filledButtonTheme.style!.padding!.resolve(<WidgetState>{}),
        theme.elevatedButtonTheme.style!.padding!.resolve(<WidgetState>{}),
      );
    });
  });

  group('tokens', () {
    test('spacing is a 4 pt ladder and radius a short one', () {
      for (final v in [TekaSpacing.xs, TekaSpacing.sm, TekaSpacing.md, TekaSpacing.lg, TekaSpacing.xl]) {
        expect(v % 4, 0);
      }
      expect(TekaRadius.md, 8); // what the theme already rounds at
      expect(TekaRadius.pill, greaterThan(100));
    });

    test('process-state colours are distinct from the brand red', () {
      for (final c in [TekaColors.processing, TekaColors.inTransit, TekaColors.inactive]) {
        expect(c, isNot(TekaColors.tekaRed));
        expect(c, isNot(TekaColors.destructive));
      }
    });

    test('no raw hex colour outside the token file', () {
      final offenders = <String>[];
      for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
        if (!f.path.endsWith('.dart') || f.path.endsWith('core/theme/teka_colors.dart')) continue;
        for (final line in f.readAsStringSync().split('\n')) {
          final t = line.trimLeft();
          if (t.startsWith('//')) continue;
          if (t.contains('Color(0x')) offenders.add('${f.path}: ${t.trim()}');
        }
      }
      expect(offenders, isEmpty);
    });
  });

  group('splash assets', () {
    test('the Android 12 icon keeps its glyph inside the safe zone', () {
      // The generator source is 1024 px; Android masks it to a circle whose
      // safe zone is the inner 66%. The launcher foreground broke that (65%
      // tall); the splash-only render must stay well inside.
      final f = File('assets/brand/splash_icon_android12.png');
      expect(f.existsSync(), isTrue);
      expect(f.lengthSync(), greaterThan(1000));
    });

    test('the wordmark source is sized for ~200 dp, not 300', () {
      final f = File('assets/brand/splash_wordmark_200dp.png');
      expect(f.existsSync(), isTrue);
      final pubspec = File('pubspec.yaml').readAsStringSync();
      expect(pubspec.contains('image: assets/brand/splash_wordmark_200dp.png'), isTrue);
      expect(pubspec.contains('image: assets/brand/splash_icon_android12.png'), isTrue);
      // The white wordmark must never be the splash image on a white splash.
      expect(RegExp(r'image: assets/brand/splash_wordmark\.png').hasMatch(pubspec), isFalse);
    });
  });
}
