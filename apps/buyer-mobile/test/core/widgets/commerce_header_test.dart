import 'dart:ui' show SemanticsAction;

import 'package:buyer_mobile/core/widgets/commerce_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _headerHarness({
  required VoidCallback onSearch,
  double textScale = 1,
}) {
  return MaterialApp(
    home: MediaQuery(
      data: MediaQueryData(
        size: const Size(360, 640),
        textScaler: TextScaler.linear(textScale),
      ),
      child: Scaffold(
        body: CustomScrollView(
          slivers: [
            HomeCommerceHeader(
              expandedContent: const Text('En-tête Teka'),
              onSearchPressed: onSearch,
              compactAction: IconButton(
                onPressed: () {},
                tooltip: 'Panier',
                icon: const Icon(Icons.shopping_cart_outlined),
              ),
            ),
            const SliverToBoxAdapter(
              child: SizedBox(height: 1200),
            ),
          ],
        ),
      ),
    ),
  );
}

void main() {
  group('HomeCommerceHeader', () {
    testWidgets('keeps search pinned and invokes the existing search action',
        (tester) async {
      var searchTaps = 0;
      await tester.pumpWidget(
        _headerHarness(onSearch: () => searchTaps++),
      );

      final searchLabel = find.text('Rechercher des produits...');
      expect(searchLabel, findsOneWidget);
      expect(find.text('En-tête Teka'), findsOneWidget);

      await tester.tap(searchLabel);
      await tester.pump();
      expect(searchTaps, 1);

      await tester.drag(
        find.byType(CustomScrollView),
        const Offset(0, -240),
      );
      await tester.pumpAndSettle();

      expect(searchLabel, findsOneWidget);
      expect(tester.getTopLeft(searchLabel).dy, lessThan(90));
      expect(find.byTooltip('Panier'), findsOneWidget);
    });

    testWidgets('collapses expanded context without a large-text overflow',
        (tester) async {
      await tester.pumpWidget(
        _headerHarness(onSearch: () {}, textScale: 2),
      );

      final expandedOpacityFinder = find.ancestor(
        of: find.text('En-tête Teka'),
        matching: find.byType(Opacity),
      );
      expect(
        tester.widget<Opacity>(expandedOpacityFinder).opacity,
        1,
      );

      await tester.drag(
        find.byType(CustomScrollView),
        const Offset(0, -240),
      );
      await tester.pumpAndSettle();

      expect(
        tester.widget<Opacity>(expandedOpacityFinder).opacity,
        0,
      );
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('CommerceSearchButton exposes a button semantic', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CommerceSearchButton(onPressed: () {}),
        ),
      ),
    );

    final semantics = tester.getSemantics(
      find.byType(CommerceSearchButton),
    );
    expect(
      semantics.getSemanticsData().hasAction(SemanticsAction.tap),
      isTrue,
    );
    expect(semantics.label, 'Rechercher des produits...');
  });
}
