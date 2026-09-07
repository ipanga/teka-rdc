import 'package:buyer_mobile/core/layout/responsive.dart';
import 'package:buyer_mobile/core/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Sheets and dialogs are constrained through the THEME rather than at each
/// call site, so a new sheet added later is a panel on a tablet without its
/// author having to know the number. These tests pin that, and pin that a
/// phone is unaffected.
void main() {
  test('the theme carries the shared sheet and dialog constraints', () {
    final theme = AppTheme.lightTheme;
    expect(theme.bottomSheetTheme.constraints, kSheetConstraints);
    expect(theme.dialogTheme.constraints, kSheetConstraints);
  });

  Future<double> sheetWidth(WidgetTester tester, double windowWidth) async {
    tester.view.physicalSize = Size(windowWidth, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.lightTheme,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => const SizedBox(
                    key: Key('sheet-body'),
                    height: 200,
                    width: double.infinity,
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    return tester.getSize(find.byKey(const Key('sheet-body'))).width;
  }

  testWidgets('a sheet still fills a phone', (tester) async {
    expect(await sheetWidth(tester, 390), 390);
  });

  testWidgets('a sheet becomes a centered panel on a tablet', (tester) async {
    expect(await sheetWidth(tester, 1024), kSheetConstraints.maxWidth);
  });

  testWidgets('a dialog is a panel, not a full-width bar', (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.lightTheme,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => const AlertDialog(
                    title: Text('Supprimer'),
                    content: Text('Supprimer tous les produits du panier ?'),
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    // The AlertDialog element covers the whole barrier area; the panel is the
    // Material surface inside it.
    final panel = find
        .descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(Material),
        )
        .first;
    final width = tester.getSize(panel).width;
    expect(width, lessThanOrEqualTo(kSheetConstraints.maxWidth));
    expect(width, greaterThan(0));
  });
}
