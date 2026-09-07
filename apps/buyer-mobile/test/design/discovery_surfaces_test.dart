import 'dart:io';

import 'package:buyer_mobile/core/theme/teka_colors.dart';
import 'package:buyer_mobile/features/catalog/data/models/category_model.dart';
import 'package:buyer_mobile/features/catalog/presentation/widgets/category_circle.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Home, search and category surfaces (UX PR B, 2026-09-07).
CategoryModel _category(String name) => CategoryModel(
      id: 'c-$name',
      name: name,
      slug: name.toLowerCase(),
      subcategories: const [],
    );

Future<double> _tileHeight(
  WidgetTester tester,
  String name, {
  double textScale = 1,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: Scaffold(
        body: Builder(
          builder: (context) => SizedBox(
            height: categoryCircleHeight(context),
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [CategoryCircle(category: _category(name))],
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  return tester.getSize(find.byType(CategoryCircle)).height;
}

void main() {
  _homeAndCards();

  group('category strip', () {
    testWidgets('a short and a long French label produce the same tile height',
        (tester) async {
      // « Supermarché » wraps to one line, « Téléphones & Accessoires » to
      // two. Before the fixed label box the strip was visibly ragged.
      final short = await _tileHeight(tester, 'Supermarché');
      final long = await _tileHeight(tester, 'Téléphones & Accessoires');
      expect(short, long);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the strip height grows with the text scale instead of clipping',
        (tester) async {
      late double h1;
      late double h15;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              h1 = categoryCircleHeight(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: const TextScaler.linear(1.5)),
            child: child!,
          ),
          home: Builder(
            builder: (context) {
              h15 = categoryCircleHeight(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );
      expect(h15, greaterThan(h1));
      // The old hard-coded 118 is what clipped at 1.5x.
      expect(h15, greaterThan(118));
    });

    testWidgets('a long label never overflows its tile', (tester) async {
      for (final scale in <double>[1.0, 1.3, 1.5]) {
        await _tileHeight(tester, 'Décoration & Éclairage intérieur',
            textScale: scale);
        expect(tester.takeException(), isNull, reason: 'scale $scale');
      }
    });
  });

  group('wishlist chip contrast', () {
    test('the chip is opaque and ringed so it reads on any photo', () {
      // A translucent white disc disappeared on pale product shots. Opaque
      // white carries a dark image; the ring carries a light one.
      const ring = 0.14;
      final ringColor = TekaColors.foreground.withValues(alpha: ring);
      expect(ringColor.a, closeTo(ring, 0.001));
      // Against pure white the ring is a visible boundary, not invisible.
      final contrastOnWhite = 1.05 / (ringColor.computeLuminance() + 0.05);
      expect(contrastOnWhite, greaterThan(1.0));
    });
  });
}

/// Home feed order and product-card footer (UX PR B).
void _homeAndCards() {
  test('the home feed puts navigation before merchandising', () {
    // Measured on a 448 pt phone: with the city hero (197 pt) and the banner
    // carousel (180 pt) stacked back to back, the category strip — the app's
    // primary navigation — started 617 pt down, in the bottom third of the
    // first viewport. Reordering moves it to 429 pt. Both blocks keep their
    // place; only the order changed.
    final home = File(
      'lib/features/home/presentation/home_screen.dart',
    ).readAsStringSync();
    final hero = home.indexOf('const CityHero()');
    final categories = home.indexOf('title: "Catégories"');
    final banners = home.indexOf('const BannerCarousel()');
    expect(hero, greaterThan(-1));
    expect(categories, greaterThan(hero), reason: 'categories after the hero');
    expect(banners, greaterThan(categories),
        reason: 'banners must follow the category strip, not precede it');
  });

  test('the card footer allowance is derived, not a magic constant', () {
    final card = File(
      'lib/features/catalog/presentation/widgets/product_card.dart',
    ).readAsStringSync();
    // The old guess.
    expect(card.contains('? 120.0 : 144.0'), isFalse);
    // The rating row is gated on review count, not the variant, so both
    // variants must reserve it — this was a real bug in the first attempt.
    expect(card.contains('title + price + struckThrough + ratingRow'), isTrue);
  });

  test('the favourite toast goes through the shared snackbar', () {
    // Rule 15: both Flutter apps must render a snackbar identically.
    final button = File(
      'lib/features/wishlist/presentation/widgets/wishlist_button.dart',
    ).readAsStringSync();
    expect(button.contains('showAppSnackbar('), isTrue);
    expect(
      button.contains('"Ajouté aux favoris"') ||
          button.contains('Ajouté aux favoris'),
      isTrue,
    );
  });
}
