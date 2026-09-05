import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:buyer_mobile/features/address/presentation/widgets/address_form_sheet.dart';
import 'package:buyer_mobile/features/checkout/data/models/checkout_model.dart';
import 'package:buyer_mobile/features/city/data/city_repository.dart';
import 'package:buyer_mobile/features/city/data/models/city_model.dart';
import 'package:buyer_mobile/features/city/data/models/commune_model.dart';

/// Guards the payload the address form actually sends.
///
/// This was untestable until the form was lifted out of checkout_screen.dart:
/// it was a private widget, which is how it shipped posting `details`/`phone`
/// while the API accepts `reference`/`recipientPhone`. Under
/// `forbidNonWhitelisted` those are a 400, so saving an address failed outright
/// whenever the buyer filled in the landmark or the recipient phone.

class _FakeCityRepository extends CityRepository {
  _FakeCityRepository() : super(Dio());

  @override
  Future<List<CityModel>> getCities() async => const [
        CityModel(
          id: 'city-1',
          name: 'Lubumbashi',
          province: 'Haut-Katanga',
          isActive: true,
          sortOrder: 0,
        ),
        CityModel(
          id: 'city-2',
          name: 'Kolwezi',
          province: 'Lualaba',
          isActive: true,
          sortOrder: 1,
        ),
      ];

  @override
  Future<List<CommuneModel>> getCommunes(String cityId) async => [
        CommuneModel(id: '$cityId-c1', cityId: cityId, name: 'Kampemba'),
        CommuneModel(id: '$cityId-c2', cityId: cityId, name: 'Katuba'),
      ];
}

Future<void> pumpSheet(
  WidgetTester tester, {
  AddressModel? initial,
  required void Function(Map<String, dynamic>) capture,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: AddressFormSheet(
          cityRepository: _FakeCityRepository(),
          initial: initial,
          onSave: (data) async {
            capture(data);
            return true;
          },
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Scrolls a control into view, then taps it.
///
/// `warnIfMissed: false` because DropdownButton renders its items into an
/// overlay route whose geometry the hit-test warning misjudges; the taps do
/// land, which the payload assertions below prove (cityId/communeId come back
/// as the exact ids of the tapped items).
Future<void> _tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder, warnIfMissed: false);
  await tester.pumpAndSettle();
}

Future<void> pickCityAndCommune(WidgetTester tester) async {
  await _tapVisible(tester, find.text('Selectionnez une ville'));
  await _tapVisible(tester, find.text('Lubumbashi (Haut-Katanga)').last);
  await _tapVisible(tester, find.text('Selectionnez une commune'));
  await _tapVisible(tester, find.text('Kampemba').last);
}

void main() {
  group('AddressFormSheet — create', () {
    testWidgets('sends reference and recipientPhone, never details/phone',
        (tester) async {
      Map<String, dynamic>? sent;
      await pumpSheet(tester, capture: (d) => sent = d);
      await pickCityAndCommune(tester);

      await tester.enterText(
        find.widgetWithText(TextField, 'Point de repere'),
        'En face de la pharmacie',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Telephone du destinataire'),
        '+243990000001',
      );

      await _tapVisible(tester, find.text('Enregistrer'));

      expect(sent, isNotNull);
      expect(sent!['reference'], 'En face de la pharmacie');
      expect(sent!['recipientPhone'], '+243990000001');
      // The exact keys that used to 400.
      expect(sent!.containsKey('details'), isFalse);
      expect(sent!.containsKey('phone'), isFalse);
    });

    testWidgets('sends the town/commune taxonomy ids alongside the names',
        (tester) async {
      Map<String, dynamic>? sent;
      await pumpSheet(tester, capture: (d) => sent = d);
      await pickCityAndCommune(tester);

      await _tapVisible(tester, find.text('Enregistrer'));

      expect(sent!['town'], 'Lubumbashi');
      expect(sent!['province'], 'Haut-Katanga');
      expect(sent!['neighborhood'], 'Kampemba');
      expect(sent!['cityId'], 'city-1');
      expect(sent!['communeId'], 'city-1-c1');
    });

    testWidgets('omits blank optionals rather than sending empty strings',
        (tester) async {
      Map<String, dynamic>? sent;
      await pumpSheet(tester, capture: (d) => sent = d);
      await pickCityAndCommune(tester);

      await _tapVisible(tester, find.text('Enregistrer'));

      expect(sent!.containsKey('reference'), isFalse);
      expect(sent!.containsKey('avenue'), isFalse);
    });

    testWidgets('titles itself for creation and blocks save until city+commune',
        (tester) async {
      await pumpSheet(tester, capture: (_) {});

      expect(find.text('Mon adresse'), findsOneWidget);
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Enregistrer'),
      );
      expect(button.onPressed, isNull);
    });
  });

  group(
      'AddressFormSheet — Ville → Commune cascade (server validates the pair)',
      () {
    FilledButton saveButton(WidgetTester tester) => tester
        .widget<FilledButton>(find.widgetWithText(FilledButton, 'Enregistrer'));

    testWidgets('offers no commune until a city is chosen', (tester) async {
      await pumpSheet(tester, capture: (_) {});
      expect(find.text('Commune *'), findsNothing);
      expect(find.text('Selectionnez une commune'), findsNothing);
      await _tapVisible(tester, find.text('Selectionnez une ville'));
      await _tapVisible(tester, find.text('Lubumbashi (Haut-Katanga)').last);
      expect(find.text('Commune *'), findsOneWidget);
      expect(find.text('Selectionnez une commune'), findsOneWidget);
    });

    testWidgets(
        'changing the city clears the chosen commune, reloads the new city’s list and blocks save',
        (tester) async {
      Map<String, dynamic>? sent;
      await pumpSheet(tester, capture: (d) => sent = d);
      await pickCityAndCommune(tester);
      expect(find.text('Selectionnez une commune'), findsNothing);
      expect(saveButton(tester).onPressed, isNotNull);

      await _tapVisible(tester, find.text('Lubumbashi (Haut-Katanga)').first);
      await _tapVisible(tester, find.text('Kolwezi (Lualaba)').last);
      expect(find.text('Selectionnez une commune'), findsOneWidget,
          reason: 'the previous commune belongs to another town');
      expect(saveButton(tester).onPressed, isNull);

      await _tapVisible(tester, find.text('Selectionnez une commune'));
      await _tapVisible(tester, find.text('Kampemba').last);
      await _tapVisible(
          tester, find.widgetWithText(FilledButton, 'Enregistrer'));
      expect(sent, isNotNull);
      expect(sent!['cityId'], 'city-2');
      expect(sent!['communeId'], 'city-2-c1',
          reason: 'the commune comes from the new city’s list');
    });

    testWidgets(
        'editing an address whose commune is no longer offered leaves the commune unselected and blocks save',
        (tester) async {
      const retired = AddressModel(
        id: 'addr-1',
        province: 'Haut-Katanga',
        town: 'Lubumbashi',
        neighborhood: 'Ancienne commune',
        avenue: 'Av. Lumumba 24',
        cityId: 'city-1',
        communeId: 'city-1-retired',
        isDefault: true,
      );
      await pumpSheet(tester, initial: retired, capture: (_) {});
      expect(find.text('Selectionnez une ville'), findsNothing);
      expect(find.text('Selectionnez une commune'), findsOneWidget);
      expect(saveButton(tester).onPressed, isNull);
    });
  });

  group('AddressFormSheet — edit', () {
    const existing = AddressModel(
      id: 'addr-1',
      province: 'Lualaba',
      town: 'Kolwezi',
      neighborhood: 'Katuba',
      avenue: 'Av. Lumumba 24',
      reference: 'Ancien repère',
      recipientName: 'Jean Kabila',
      recipientPhone: '+243990000001',
      cityId: 'city-2',
      communeId: 'city-2-c2',
      isDefault: true,
    );

    testWidgets('prefills from the existing address', (tester) async {
      await pumpSheet(tester, initial: existing, capture: (_) {});

      expect(find.text('Modifier mon adresse'), findsOneWidget);
      expect(find.text('Av. Lumumba 24'), findsOneWidget);
      expect(find.text('Ancien repère'), findsOneWidget);
      expect(find.text('Jean Kabila'), findsOneWidget);
      // Preselected from cityId/communeId, so the hints are gone.
      expect(find.text('Selectionnez une ville'), findsNothing);
      expect(find.text('Selectionnez une commune'), findsNothing);
    });

    testWidgets('keeps unchanged values on save', (tester) async {
      Map<String, dynamic>? sent;
      await pumpSheet(tester, initial: existing, capture: (d) => sent = d);

      await _tapVisible(tester, find.text('Enregistrer'));

      expect(sent!['town'], 'Kolwezi');
      expect(sent!['neighborhood'], 'Katuba');
      expect(sent!['reference'], 'Ancien repère');
      expect(sent!['recipientPhone'], '+243990000001');
    });

    testWidgets('sends an explicit null when a field is cleared',
        (tester) async {
      // On create a blank field is simply omitted, but on edit the key must be
      // present — otherwise Prisma ignores the `undefined` and the old landmark
      // survives, so clearing it would silently do nothing.
      Map<String, dynamic>? sent;
      await pumpSheet(tester, initial: existing, capture: (d) => sent = d);

      await tester.enterText(
        find.widgetWithText(TextField, 'Point de repere'),
        '',
      );
      await _tapVisible(tester, find.text('Enregistrer'));

      expect(sent!.containsKey('reference'), isTrue);
      expect(sent!['reference'], isNull);
    });
  });
}
