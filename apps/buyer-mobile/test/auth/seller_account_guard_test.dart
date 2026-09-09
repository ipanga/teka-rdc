import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';
import 'package:buyer_mobile/features/auth/data/auth_repository.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';

class _FakeTokenStorage extends TokenStorage {
  _FakeTokenStorage() : super(const FlutterSecureStorage());
  bool _has = false;
  @override
  Future<bool> hasTokens() async => _has;
  @override
  Future<void> clearTokens() async => _has = false;
  @override
  Future<void> saveTokens(String access, String refresh) async => _has = true;
}

class _FakeAuthRepo extends AuthRepository {
  _FakeAuthRepo() : super(Dio(), _FakeTokenStorage());
  String role = 'BUYER';
  bool loggedOut = false;

  @override
  Future<Map<String, dynamic>?> getCurrentUser() async => null;
  @override
  Future<SessionCheck> checkSession() async => const SessionRejected();

  @override
  Future<Map<String, dynamic>> verifyBuyerOtp({
    required String phone,
    required String code,
    String? firstName,
    String? lastName,
  }) async =>
      {
        'user': {'id': 'u1', 'role': role},
      };

  @override
  Future<void> logout() async => loggedOut = true;
}

Future<void> _settle() => Future.delayed(Duration.zero);

void main() {
  group('verifyOtp seller-account guard (parity sweep P4)', () {
    test('SELLER → throws SellerAccountException, stays unauthenticated, logs out', () async {
      final repo = _FakeAuthRepo()..role = 'SELLER';
      final n = AuthNotifier(repo, _FakeTokenStorage());
      await _settle(); // constructor checkAuthStatus

      await expectLater(
        n.verifyOtp(phone: '+243812345678', code: '123456'),
        throwsA(isA<SellerAccountException>()),
      );
      expect(n.state.status, AuthStatus.unauthenticated);
      expect(n.state.user, isNull);
      expect(repo.loggedOut, isTrue); // session cleared, not left half-authed
    });

    test('BUYER → authenticates normally', () async {
      final repo = _FakeAuthRepo()..role = 'BUYER';
      final n = AuthNotifier(repo, _FakeTokenStorage());
      await _settle();

      await n.verifyOtp(phone: '+243812345678', code: '123456');
      expect(n.state.status, AuthStatus.authenticated);
      expect(n.state.user?['role'], 'BUYER');
      expect(repo.loggedOut, isFalse);
    });
  });
}
