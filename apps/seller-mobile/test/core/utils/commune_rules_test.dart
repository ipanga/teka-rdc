import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/utils/commune_rules.dart';

void main() {
  group('communeRequired — mirrors the API rule', () {
    test('required only once a non-empty library has loaded', () {
      expect(communeRequired(loaded: true, communeCount: 6), isTrue);
      expect(communeRequired(loaded: true, communeCount: 0), isFalse,
          reason:
              'a city without communes (e.g. Likasi today) accepts the city alone');
      expect(communeRequired(loaded: false, communeCount: 0), isFalse,
          reason: 'never claim optional while loading — the API decides');
    });
  });

  group('retainedCommuneId — city change clears an invalid commune', () {
    const lubumbashi = ['c-kampemba', 'c-kenya', 'c-katuba'];
    test('keeps a commune that belongs to the new list', () {
      expect(retainedCommuneId('c-kenya', lubumbashi), 'c-kenya');
    });
    test('clears a commune of another city, an empty or null selection', () {
      expect(retainedCommuneId('c-dilala', lubumbashi), isNull);
      expect(retainedCommuneId('', lubumbashi), isNull);
      expect(retainedCommuneId(null, lubumbashi), isNull);
      expect(retainedCommuneId('c-kenya', const <String>[]), isNull);
    });
  });

  group('communeHint', () {
    test('walks the states in order', () {
      expect(
          communeHint(
              cityChosen: false,
              loading: false,
              loaded: false,
              communeCount: 0),
          'Sélectionnez d’abord une ville');
      expect(
          communeHint(
              cityChosen: true, loading: true, loaded: false, communeCount: 0),
          'Chargement des communes…');
      expect(
          communeHint(
              cityChosen: true, loading: false, loaded: true, communeCount: 0),
          'Aucune commune enregistrée pour cette ville pour le moment');
      expect(
          communeHint(
              cityChosen: true, loading: false, loaded: true, communeCount: 3),
          'Sélectionnez votre commune');
    });
  });
}
