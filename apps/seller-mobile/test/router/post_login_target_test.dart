import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/router/post_login_target.dart';

void main() {
  group('PostLoginTarget — unauthenticated deep link → login → back', () {
    test('an internal path (with query) round-trips through the from param', () {
      const target = '/earnings/payouts/0f1e2d3c-4b5a-4c6d-8e7f-90a1b2c3d4e5';
      final from = PostLoginTarget.fromParam(target);
      expect(from, isNotNull);
      expect(PostLoginTarget.resolve(from), target);
      expect(PostLoginTarget.resolve(PostLoginTarget.fromParam('/earnings?tab=payouts')),
          '/earnings?tab=payouts');
    });

    test('home has nothing to come back to', () {
      expect(PostLoginTarget.fromParam('/'), isNull);
      expect(PostLoginTarget.resolve(null), '/');
      expect(PostLoginTarget.resolve(''), '/');
    });

    test('external, protocol-relative, auth and onboarding targets fall back to home', () {
      expect(PostLoginTarget.resolve('https://evil.example/x'), '/');
      expect(PostLoginTarget.resolve('//evil.example'), '/');
      expect(PostLoginTarget.resolve('%2F%2Fevil.example'), '/');
      expect(PostLoginTarget.resolve('/auth/login'), '/');
      expect(PostLoginTarget.resolve('/auth/reset-password?token=x'), '/');
      expect(PostLoginTarget.resolve('/devenir-vendeur'), '/');
      expect(PostLoginTarget.resolve('garbage'), '/');
      expect(PostLoginTarget.resolve('%E0%A4%A'), '/'); // undecodable
    });
  });
}
