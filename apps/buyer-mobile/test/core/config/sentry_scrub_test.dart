// MS6 — the mobile Sentry scrubber had NO test in either app, despite being
// the single control that keeps user input out of telemetry and despite its
// own doc comment saying "keep all four in sync".
//
// These tests assert the rules directly rather than mocking the SDK, so they
// fail on a rule regression however Sentry is wired.

import 'package:buyer_mobile/core/config/sentry_scrub.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

void main() {
  group('scrubText — phone forms actually written in the DRC', () {
    test('matches E.164, unprefixed, local and spaced/dashed forms', () {
      for (final raw in <String>[
        '+243812345678',
        '243812345678',
        '0812345678',
        '081 234 5678',
        '+243 812 345 678',
        '+243-81-234-5678',
      ]) {
        expect(scrubText('appel $raw recu'), 'appel [phone] recu',
            reason: '"$raw" must be scrubbed');
      }
    });

    test('a longer digit run is not half-matched into [phone]789', () {
      // The old pattern was `\+243\d{9}` with no right boundary.
      expect(scrubText('+2438123456789'), isNot(contains('789')));
    });

    test('ordinary numbers and French copy are left alone', () {
      expect(scrubText('Commande 12345 introuvable a Lubumbashi'),
          'Commande 12345 introuvable a Lubumbashi');
      expect(scrubText('statusCode=500 errorCode=P2002'),
          'statusCode=500 errorCode=P2002');
    });
  });

  group('scrubText — other value classes', () {
    test('emails, JWTs, bearer tokens and Cloudinary document links', () {
      expect(scrubText('de marie@example.cd'), 'de [email]');
      expect(
        scrubText(
            'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N'),
        filtered,
      );
      expect(scrubText('jeton Bearer abcdef1234567890 recu'),
          'jeton Bearer $filtered recu');
      expect(
        scrubText('https://res.cloudinary.com/teka/image/private/doc.jpg'),
        '[document-link]',
      );
    });

    test('inline key=value secrets, which is how this codebase logs', () {
      expect(scrubText('debug password=SuperSecret123'),
          'debug password=$filtered');
      expect(scrubText('otp=123456'), 'otp=$filtered');
      expect(scrubText('Authorization: Bearer abcdef1234567890'),
          isNot(contains('abcdef1234567890')));
    });

    test('scrubbing is idempotent', () {
      final once = scrubText('password=SuperSecret123 tel +243812345678');
      expect(scrubText(once), once);
    });
  });

  group('scrubBeforeSend — the fields the old scrubber never walked', () {
    SentryEvent send(SentryEvent e) => scrubBeforeSend(e, Hint())!;

    test('exceptions are walked (a raw DioException can embed response detail)',
        () {
      final out = send(SentryEvent(
        exceptions: [
          SentryException(
            type: 'DioException',
            value: 'failed for +243812345678 with password=Secret123',
          ),
        ],
      ));
      final v = out.exceptions!.single.value!;
      expect(v, contains('[phone]'));
      expect(v, isNot(contains('Secret123')));
      expect(out.exceptions!.single.type, 'DioException',
          reason: 'the exception type stays — it is what groups the issue');
    });

    test('tags are walked (dio_error_messages writes an endpoint tag)', () {
      final out = send(SentryEvent(
        tags: const {
          'endpoint': 'GET /v1/orders?phone=+243812345678',
          'city': 'lubumbashi',
        },
      ));
      expect(out.tags!['endpoint'], isNot(contains('243812345678')));
      expect(out.tags!['city'], 'lubumbashi', reason: 'non-sensitive tag kept');
    });

    test('contexts are walked (retry_interceptor writes the request path)', () {
      final event = SentryEvent();
      event.contexts['connectivity_event'] = <String, dynamic>{
        'path': '/v1/orders?token=abc123',
        'attempts': 3,
      };
      final out = send(event);
      final ctx = out.contexts['connectivity_event'] as Map<String, dynamic>;
      expect(ctx['path'], isNot(contains('abc123')));
      expect(ctx['attempts'], 3, reason: 'useful scalars are kept');
    });

    test('user keeps the opaque id and role, loses anything identifying', () {
      final out = send(SentryEvent(
        user: SentryUser(
          id: 'user-uuid-1',
          email: 'marie@example.cd',
          username: 'marie',
          ipAddress: '41.0.0.1',
          data: const {'role': 'BUYER'},
        ),
      ));
      expect(out.user!.id, 'user-uuid-1');
      expect(out.user!.email, isNull);
      expect(out.user!.username, isNull);
      expect(out.user!.ipAddress, isNull);
      expect(out.user!.data!['role'], 'BUYER');
    });

    test('message params are walked, not passed through verbatim', () {
      final out = send(SentryEvent(
        message: SentryMessage(
          'appel a %s',
          template: 'appel a %s',
          params: const ['+243812345678'],
        ),
      ));
      expect(out.message!.params!.single, '[phone]');
    });

    test('breadcrumb data is walked and non-sensitive keys survive', () {
      final out = send(SentryEvent(
        breadcrumbs: [
          Breadcrumb(
            message: 'retry_budget_exhausted',
            category: 'connectivity',
            data: const {
              'path': '/v1/orders?otp=123456',
              'method': 'GET',
              'attempts': 3,
            },
          ),
        ],
      ));
      final b = out.breadcrumbs!.single;
      expect(b.message, 'retry_budget_exhausted');
      expect(b.category, 'connectivity');
      expect(b.data!['path'], isNot(contains('123456')));
      expect(b.data!['method'], 'GET');
      expect(b.data!['attempts'], 3);
    });

    test('a bare event is returned unchanged and never throws', () {
      expect(() => send(SentryEvent()), returnsNormally);
    });
  });
}
