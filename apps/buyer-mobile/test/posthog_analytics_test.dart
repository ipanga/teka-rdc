import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/analytics/posthog_analytics.dart';

void main() {
  group('scrubAnalyticsText (search query free-text — parity sweep P3)', () {
    test('strips DRC phone numbers from free text (Rule 13)', () {
      expect(scrubAnalyticsText('appelez +243812345678 svp'),
          'appelez [phone] svp');
    });

    test('leaves ordinary search terms untouched', () {
      expect(scrubAnalyticsText('iphone 15 pro'), 'iphone 15 pro');
      expect(scrubAnalyticsText(''), '');
    });
  });

  group('buildIdentityProperties', () {
    test('includes role only', () {
      final props = buildIdentityProperties({'id': 'u1', 'role': 'BUYER'});
      expect(props, {'role': 'BUYER'});
    });

    test('NEVER leaks phone / email / names (Rule 13)', () {
      final props = buildIdentityProperties({
        'id': 'u1',
        'role': 'BUYER',
        'phone': '+243812345678',
        'email': 'buyer@example.cd',
        'firstName': 'Jean',
        'lastName': 'Mukendi',
      });
      expect(props.keys.toSet(), {'role'});
      expect(props.containsKey('phone'), isFalse);
      expect(props.containsKey('email'), isFalse);
      expect(props.containsKey('firstName'), isFalse);
      expect(props.containsKey('lastName'), isFalse);
      expect(props.containsKey('id'), isFalse);
    });

    test('omits role when absent or empty', () {
      expect(buildIdentityProperties({'id': 'u1'}), <String, Object>{});
      expect(buildIdentityProperties({'id': 'u1', 'role': ''}),
          <String, Object>{});
    });
  });
}
