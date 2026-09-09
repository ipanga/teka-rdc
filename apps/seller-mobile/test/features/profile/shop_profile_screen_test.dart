import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/profile/data/profile_repository.dart';
import 'package:seller_mobile/features/profile/presentation/screens/personal_info_screen.dart'
    show FormSkeleton;
import 'package:seller_mobile/features/profile/presentation/screens/shop_profile_screen.dart';

import '../../support/seller_profile_fixtures.dart';

Future<void> _pump(WidgetTester tester, FixtureProfileRepository repo,
    {Size size = const Size(390, 900), double textScale = 1}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      key: ValueKey(repo),
      overrides: [profileRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: const ShopProfileScreen(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  await tester.pump();
}

Finder _field(String label) => find.ancestor(
    of: find.text(label), matching: find.byType(TextFormField));

Future<void> _reveal(WidgetTester tester, Finder f) async {
  await tester.dragUntilVisible(f, find.byType(ListView), const Offset(0, -150));
  await tester.pumpAndSettle();
}

Future<void> _save(WidgetTester tester) async {
  await tester.tap(find.text('Enregistrer'));
  await tester.pump();
  await tester.pump();
  await tester.pump();
  await tester.pump();
}

Future<void> _pickCity(WidgetTester tester, String label) async {
  await tester.tap(find.byType(DropdownButtonFormField<String>).first);
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('prefills the shop, the delivery phone, the saved town and commune',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    expect(find.text('Boutique Marie'), findsOneWidget);
    expect(find.text('+243970000001'), findsOneWidget);
    expect(find.text('Lubumbashi - Haut-Katanga'), findsOneWidget);
    expect(find.text('Kampemba'), findsOneWidget);
    expect(repo.communeRequests, ['city-lubumbashi']);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('loading is a skeleton; a failed load is a scoped error with retry',
      (tester) async {
    final gate = Completer<void>();
    final repo = FixtureProfileRepository()..hold = gate.future;
    await _pump(tester, repo);
    expect(find.byType(FormSkeleton), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    gate.complete();
    await tester.pump();
    await tester.pump();
    await tester.pump();
    expect(find.text('Boutique Marie'), findsOneWidget);

    final failing = FixtureProfileRepository()..failMe = true;
    await _pump(tester, failing);
    expect(find.text('Boutique indisponible'), findsOneWidget);
    expect(find.text('Enregistrer'), findsNothing);
  });

  testWidgets('the delivery phone and the shop name are validated with the API\'s words before any call',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    await tester.enterText(_field('Nom de la boutique'), 'B');
    await tester.enterText(_field('Téléphone de livraison'), '0970000001');
    await _save(tester);
    expect(find.text('Le nom de la boutique doit contenir au moins 2 caractères'),
        findsOneWidget);
    expect(find.textContaining('Numéro de téléphone invalide'), findsOneWidget);
    expect(repo.shopUpdates, isEmpty);
  });

  testWidgets(
      'changing the town reloads its communes, drops the old commune, and requires a new one before saving',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    await _pickCity(tester, 'Kolwezi - Lualaba');
    expect(repo.communeRequests, ['city-lubumbashi', 'city-kolwezi']);
    expect(find.text('Kampemba'), findsNothing);
    expect(find.text('Commune *'), findsOneWidget);
    await _reveal(tester, find.text('Enregistrer'));
    await _save(tester);
    expect(find.text('Choisissez votre commune pour cette ville.'), findsOneWidget);
    expect(repo.shopUpdates, isEmpty);

    await _reveal(tester, find.text('Commune *'));
    await tester.tap(find.byType(DropdownButtonFormField<String>).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manika').last);
    await tester.pumpAndSettle();
    await _reveal(tester, find.text('Enregistrer'));
    await _save(tester);
    expect(repo.shopUpdates, [
      {'cityId': 'city-kolwezi', 'communeId': 'commune-manika'}
    ]);
    expect(find.text('Boutique mise à jour'), findsOneWidget);
  });

  testWidgets('a town without communes yet is saveable on the town alone',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    await _pickCity(tester, 'Likasi - Haut-Katanga');
    expect(find.textContaining('Aucune commune enregistrée'), findsWidgets);
    await _reveal(tester, find.text('Enregistrer'));
    await _save(tester);
    expect(repo.shopUpdates, [
      {'cityId': 'city-likasi', 'communeId': null}
    ]);
  });

  testWidgets(
      'a saved town that is no longer offered is named and kept; other edits do not touch it',
      (tester) async {
    final repo = FixtureProfileRepository(
        me: meJson(cityId: 'city-goma', cityName: 'Goma', communeId: null, communeName: null));
    await _pump(tester, repo);
    expect(find.textContaining('Votre ville enregistrée, Goma, n’est plus proposée'),
        findsOneWidget);
    expect(find.text('Sélectionnez votre ville'), findsOneWidget);
    await tester.enterText(_field('Nom de la boutique'), 'Boutique Marie Goma');
    await _reveal(tester, find.text('Enregistrer'));
    await _save(tester);
    expect(repo.shopUpdates, [{'businessName': 'Boutique Marie Goma'}]);
  });

  testWidgets('an API refusal is shown verbatim and every value is kept',
      (tester) async {
    final repo = FixtureProfileRepository()
      ..nextShopUpdateError =
          apiError('/v1/sellers/profile', 400, 'Commune inactive');
    await _pump(tester, repo);
    await tester.enterText(_field('Adresse / quartier'), 'Avenue Sendwe 4');
    await _reveal(tester, find.text('Enregistrer'));
    await _save(tester);
    expect(find.text('Commune inactive'), findsOneWidget);
    expect(find.text('Avenue Sendwe 4'), findsOneWidget);
    expect(find.text('Boutique mise à jour'), findsNothing);
  });

  testWidgets('a failed commune list shows a retry that reloads it', (tester) async {
    final repo = FixtureProfileRepository()..failCommunes = true;
    await _pump(tester, repo);
    expect(find.text('Impossible de charger les communes.'), findsOneWidget);
    repo.failCommunes = false;
    await tester.tap(find.text('Réessayer'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Kampemba'), findsOneWidget);
  });

  testWidgets('a pending application keeps the form read-only with the reason',
      (tester) async {
    await _pump(tester,
        FixtureProfileRepository(me: meJson(applicationStatus: 'PENDING')));
    expect(find.textContaining('en cours de révision'), findsOneWidget);
    expect(tester.widget<TextFormField>(_field('Nom de la boutique')).enabled,
        isFalse);
    final button = tester.widget<ElevatedButton>(find.ancestor(
        of: find.text('Enregistrer'), matching: find.byType(ElevatedButton)));
    expect(button.enabled, isFalse);
  });

  for (final width in [320.0, 360.0, 390.0, 412.0]) {
    for (final scale in [1.0, 1.5]) {
      testWidgets('shop form fits $width at $scale×', (tester) async {
        await _pump(
            tester,
            FixtureProfileRepository(
                me: meJson(
                    businessName:
                        'Quincaillerie Générale de la Grande Avenue Kasavubu',
                    cityId: 'city-goma',
                    cityName: 'Goma',
                    communeId: null,
                    communeName: null)),
            size: Size(width, 740),
            textScale: scale);
        await _reveal(tester, find.text('Enregistrer'));
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('tablet 1024×768: the form stays in a readable column', (tester) async {
    await _pump(tester, FixtureProfileRepository(), size: const Size(1024, 768));
    expect(tester.getSize(_field('Nom de la boutique')).width, lessThan(800));
    expect(tester.takeException(), isNull);
  });
}
