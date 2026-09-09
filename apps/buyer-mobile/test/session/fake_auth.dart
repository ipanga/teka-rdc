// Test double for the auth session: a real AuthNotifier subclass (so
// `authProvider.overrideWith` type-checks) whose state is driven by the test.
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';
import 'package:buyer_mobile/features/auth/data/auth_repository.dart';
import 'package:buyer_mobile/features/auth/data/session_scope.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';

class _NoTokens extends TokenStorage {
  _NoTokens() : super(const FlutterSecureStorage());
  @override
  Future<bool> hasTokens() async => false;
  @override
  Future<void> clearTokens() async {}
}

class _NoRepo extends AuthRepository {
  _NoRepo() : super(Dio(), _NoTokens());
  @override
  Future<SessionCheck> checkSession() async => const SessionRejected();
  @override
  Future<void> logout() async {}
}

class FakeAuthNotifier extends AuthNotifier {
  /// [scope] lets a test exercise the real on-disk profile cache
  /// (updateUser → cacheProfile, logout → clearPrivateState).
  FakeAuthNotifier({SessionScope? scope}) : super(_NoRepo(), _NoTokens(), scope);

  /// The real constructor resolves the stored session asynchronously; the
  /// test drives the state instead, so that check must never race it.
  @override
  Future<void> checkAuthStatus() async {}

  factory FakeAuthNotifier.signedIn(String userId) =>
      FakeAuthNotifier()..signIn(userId);

  /// [profile] adds `/me` fields (firstName, avatar…) to the session user.
  void signIn(String userId, {Map<String, dynamic> profile = const {}}) {
    state = AuthState(
      status: AuthStatus.authenticated,
      user: {'id': userId, 'role': 'BUYER', ...profile},
    );
  }

  void signOut() {
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}
