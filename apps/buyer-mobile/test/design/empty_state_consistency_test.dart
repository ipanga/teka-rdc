import 'dart:io';

import 'package:buyer_mobile/core/widgets/app_states.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// One empty-state language (UX/UI polish phase, 2026-09-07).
///
/// Search's zero-result screen used to hand-roll its own layout — bare icon,
/// no card, different spacing — so the app showed two different "nothing
/// here" looks depending on where you were. It now rides the shared shell
/// with its popular terms in the footer slot.
void main() {
  testWidgets('the footer slot renders below the action', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppEmptyState(
            icon: Icons.search_off,
            title: 'Aucun résultat',
            message: 'Essayez un autre mot-clé :',
            actionLabel: 'Réessayer',
            onAction: () {},
            footer: const Text('recherches populaires'),
          ),
        ),
      ),
    );

    expect(find.text('Aucun résultat'), findsOneWidget);
    expect(find.text('Essayez un autre mot-clé :'), findsOneWidget);
    expect(find.text('recherches populaires'), findsOneWidget);
    final action = tester.getTopLeft(find.text('Réessayer'));
    final footer = tester.getTopLeft(find.text('recherches populaires'));
    expect(footer.dy, greaterThan(action.dy));
  });

  testWidgets('a footer is optional and costs nothing when absent',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AppEmptyState(icon: Icons.inbox, title: 'Rien ici'),
        ),
      ),
    );
    expect(find.text('Rien ici'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('no screen hand-rolls a zero-result layout any more', () {
    // A cheap structural guard: the search screen must reach for the shared
    // shell rather than rebuilding an icon-plus-two-Texts empty state.
    final search = File(
      'lib/features/catalog/presentation/screens/search_screen.dart',
    ).readAsStringSync();
    expect(search.contains('AppEmptyState('), isTrue,
        reason: 'search zero-result should use the shared empty state');
    expect(search.contains('Icon(Icons.search_off,\n              size: 56'),
        isFalse,
        reason: 'the hand-rolled empty state is back');
  });
}
