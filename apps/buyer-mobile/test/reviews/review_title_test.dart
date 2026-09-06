// Review titles (2026-07-28).
//
// The column is nullable so reviews written before that date keep working.
// The rule these tests pin: a legacy review renders with NO title line at all
// — not an empty one — while a new review shows its title above the comment.

import 'package:buyer_mobile/features/reviews/data/models/review_model.dart';
import 'package:buyer_mobile/features/reviews/presentation/widgets/review_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

ReviewModel _review({String? title, String? text}) => ReviewModel(
      id: 'rev1',
      productId: 'prod1',
      buyerId: 'buyer1',
      orderId: 'order1',
      rating: 4,
      title: title,
      text: text,
      status: 'ACTIVE',
      createdAt: '2026-07-28T10:00:00.000Z',
    );

Future<void> _pump(WidgetTester tester, ReviewModel review,
    {VoidCallback? onEdit}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ReviewTile(review: review, isOwn: onEdit != null, onEdit: onEdit),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  // « Achat vérifié » (2026-09-06): every review is written against the
  // reviewer's own DELIVERED order (server rule), so every tile — legacy or
  // new, own or someone else's — carries the badge.
  testWidgets('every review tile shows the « Achat vérifié » badge', (tester) async {
    await _pump(tester, _review(title: null, text: 'Ancien avis'));
    expect(find.text(VerifiedPurchaseBadge.label), findsOneWidget);
    expect(find.byIcon(Icons.verified_rounded), findsOneWidget);
    await _pump(tester, _review(title: 'Nouveau', text: 'Récent'), onEdit: () {});
    expect(find.text('Achat vérifié'), findsOneWidget);
  });

  group('ReviewModel.fromJson', () {
    test('parses a title when present', () {
      final r = ReviewModel.fromJson({
        'id': 'rev1',
        'rating': 5,
        'title': 'Excellent produit',
        'text': 'Conforme.',
        'status': 'ACTIVE',
        'createdAt': '2026-07-28T10:00:00.000Z',
      });
      expect(r.title, 'Excellent produit');
    });

    test('leaves title null for a legacy review that has none', () {
      final r = ReviewModel.fromJson({
        'id': 'rev1',
        'rating': 5,
        'text': 'Avis écrit avant les titres.',
        'status': 'ACTIVE',
        'createdAt': '2026-01-01T10:00:00.000Z',
      });
      expect(r.title, isNull);
    });
  });

  group('ReviewTile', () {
    testWidgets('shows the title above the comment', (tester) async {
      await _pump(
        tester,
        _review(title: 'Excellent produit', text: 'Conforme à la description.'),
      );

      expect(find.text('Excellent produit'), findsOneWidget);
      expect(find.text('Conforme à la description.'), findsOneWidget);
    });

    testWidgets('legacy review renders no title line at all', (tester) async {
      await _pump(tester, _review(text: 'Avis écrit avant les titres.'));

      expect(find.text('Avis écrit avant les titres.'), findsOneWidget);
      // An empty Text('') would still be found — assert there is no stray
      // empty text node where the title would sit.
      expect(find.text(''), findsNothing);
    });

    testWidgets('title without a comment renders and does not crash',
        (tester) async {
      await _pump(tester, _review(title: 'Rapide'));

      expect(find.text('Rapide'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the edit affordance is owner-only', (tester) async {
      await _pump(tester, _review(title: 'Bon produit'));
      expect(find.byTooltip('Modifier mon avis'), findsNothing);

      var taps = 0;
      await _pump(tester, _review(title: 'Bon produit'), onEdit: () => taps++);
      expect(find.byTooltip('Modifier mon avis'), findsOneWidget);

      await tester.tap(find.byTooltip('Modifier mon avis'));
      expect(taps, 1);
    });
  });
}
