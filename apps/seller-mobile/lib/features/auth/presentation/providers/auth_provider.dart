import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../data/auth_repository.dart';
import '../../../../core/storage/secure_storage.dart';

enum AuthStatus { unknown, authenticated, unauthenticated, wrongRole }

/// Attach (or clear) the signed-in seller on the Sentry scope — id + role ONLY
/// (no PII); errors are also phone-scrubbed by the global beforeSend.
void _applySentryUser(Map<String, dynamic>? user) {
  Sentry.configureScope((scope) {
    scope.setUser(
      user == null
          ? null
          : SentryUser(
              id: user['id'] as String?,
              data: {'role': user['role']?.toString() ?? 'SELLER'},
            ),
    );
  });
}

class AuthState {
  final AuthStatus status;
  final Map<String, dynamic>? user;
  final bool isLoading;
  final String? error;

  const AuthState({
    this.status = AuthStatus.unknown,
    this.user,
    this.isLoading = false,
    this.error,
  });

  bool get isSeller {
    final role = user?['role'] as String?;
    return role == 'SELLER' || role == 'ADMIN';
  }

  AuthState copyWith({
    AuthStatus? status,
    Map<String, dynamic>? user,
    bool? isLoading,
    String? error,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository _authRepository;
  final TokenStorage _tokenStorage;

  AuthNotifier(this._authRepository, this._tokenStorage)
      : super(const AuthState()) {
    checkAuthStatus();
  }

  Future<void> checkAuthStatus() async {
    state = state.copyWith(isLoading: true);

    final hasTokens = await _tokenStorage.hasTokens();
    if (!hasTokens) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        isLoading: false,
      );
      return;
    }

    final user = await _authRepository.getCurrentUser();
    if (user != null) {
      final role = user['role'] as String?;
      if (role == 'SELLER' || role == 'ADMIN') {
        _applySentryUser(user);
        state = state.copyWith(
          status: AuthStatus.authenticated,
          user: user,
          isLoading: false,
        );
      } else {
        state = state.copyWith(
          status: AuthStatus.wrongRole,
          user: user,
          isLoading: false,
        );
      }
    } else {
      await _tokenStorage.clearTokens();
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        isLoading: false,
      );
    }
  }

  // Email + password ——————————————————————————————————————————————————————————

  Future<void> loginWithEmail(String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _authRepository.loginWithEmail(email, password);
      // Re-fetch via /me so the user carries sellerProfile (the login
      // response omits it) — the router's application gate reads
      // sellerProfile.applicationStatus.
      await checkAuthStatus();
      const PosthogAnalytics().capture(
        'auth_login_success',
        properties: {'method': 'email'},
      );
    } catch (e) {
      const PosthogAnalytics().capture(
        'auth_login_failure',
        properties: {'error_category': errorCategory(e)},
      );
      state = state.copyWith(isLoading: false, error: friendlyErrorMessage(e));
      rethrow;
    }
  }

  Future<void> registerWithEmail(
    String email,
    String password,
    String firstName,
    String lastName,
  ) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _authRepository.registerWithEmail(
        email,
        password,
        firstName,
        lastName,
      );
      // register/email assigns role SELLER immediately but creates no
      // SellerProfile — the seller must still submit a business application
      // (/devenir-vendeur). Re-fetch via /me so the gate sees no approved
      // profile and routes to the application flow.
      await checkAuthStatus();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: friendlyErrorMessage(e));
      rethrow;
    }
  }

  Future<void> requestPasswordReset(String email) async {
    await _authRepository.requestPasswordReset(email);
  }

  Future<void> confirmPasswordReset(String token, String newPassword) async {
    await _authRepository.confirmPasswordReset(token, newPassword);
  }

  // Seller migration + phone OTP retired 2026-05-18 (repository methods
  // removed; this surface no longer exposes them).

  Future<void> logout() async {
    await _authRepository.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.read(authRepositoryProvider),
    ref.read(tokenStorageProvider),
  );
});

/// Identity boundary for seller data. Status alone misses direct account changes.
final authenticatedSellerIdProvider = Provider<String?>((ref) {
  return ref.watch(authProvider.select((state) =>
      state.status == AuthStatus.authenticated
          ? (state.user?['id'] as String?)
          : null));
});
