import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import '../../data/auth_repository.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/storage/secure_storage.dart';

/// Attach (or clear) the signed-in user on the Sentry scope so captured errors
/// carry who hit them — id + role ONLY (never phone/email/names), matching the
/// PostHog identity policy. PII is also stripped by the global beforeSend.
void _applySentryUser(Map<String, dynamic>? user) {
  Sentry.configureScope((scope) {
    scope.setUser(
      user == null
          ? null
          : SentryUser(
              id: user['id'] as String?,
              data: {'role': user['role']?.toString() ?? 'BUYER'},
            ),
    );
  });
}

enum AuthStatus { unknown, authenticated, unauthenticated }

/// Thrown by [AuthNotifier.verifyOtp] if the API ever returned a SELLER user.
/// Since D1 (2026-09-06) the API refuses the buyer OTP flow for a phone owned
/// by a seller or admin (generic 401), so this is defensive dead code kept so
/// a regression server-side can never land a seller session in the buyer app.
class SellerAccountException implements Exception {}

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
      _applySentryUser(user);
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: user,
        isLoading: false,
      );
    } else {
      await _tokenStorage.clearTokens();
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        isLoading: false,
      );
    }
  }

  // Buyer WhatsApp OTP ————————————————————————————————————————————————————————

  Future<Map<String, dynamic>> requestOtp(String phone) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await _authRepository.requestBuyerOtp(phone);
      const PosthogAnalytics().capture('auth_otp_requested');
      state = state.copyWith(isLoading: false);
      return data;
    } catch (e) {
      const PosthogAnalytics().capture(
        'auth_otp_request_failed',
        properties: {'error_category': errorCategory(e)},
      );
      state = state.copyWith(isLoading: false, error: friendlyErrorMessage(e));
      rethrow;
    }
  }

  Future<void> verifyOtp({
    required String phone,
    required String code,
    String? firstName,
    String? lastName,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await _authRepository.verifyBuyerOtp(
        phone: phone,
        code: code,
        firstName: firstName,
        lastName: lastName,
      );

      // Seller-account guard: a buyer OTP can resolve to a SELLER (global phone
      // uniqueness). The verify call already persisted tokens, so clear the
      // session — we don't want a seller half-authenticated in the buyer app —
      // and surface the guard so the UI can point them at the seller app.
      final user = data['user'] as Map<String, dynamic>?;
      if (user?['role']?.toString() == 'SELLER') {
        await _authRepository.logout();
        state = const AuthState(status: AuthStatus.unauthenticated);
        throw SellerAccountException();
      }

      _applySentryUser(data['user'] as Map<String, dynamic>?);
      const PosthogAnalytics().capture(
        'auth_login_success',
        properties: {'method': 'otp'},
      );
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isLoading: false,
      );
    } on SellerAccountException {
      rethrow; // already handled state above; don't overwrite with a string error
    } catch (e) {
      const PosthogAnalytics().capture(
        'auth_login_failure',
        properties: {'error_category': errorCategory(e)},
      );
      state = state.copyWith(isLoading: false, error: friendlyErrorMessage(e));
      rethrow;
    }
  }

  Future<Map<String, dynamic>> resendOtp(String phone) async {
    return _authRepository.resendBuyerOtp(phone);
  }

  // Buyer claim flow ——————————————————————————————————————————————————————————

  Future<void> requestClaim(String email) async {
    await _authRepository.requestBuyerClaim(email);
  }

  Future<void> verifyClaim({
    required String token,
    required String phone,
    required String code,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await _authRepository.verifyBuyerClaim(
        token: token,
        phone: phone,
        code: code,
      );
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: friendlyErrorMessage(e));
      rethrow;
    }
  }

  Future<void> logout() async {
    await _authRepository.logout();
    _applySentryUser(null);
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.read(authRepositoryProvider),
    ref.read(tokenStorageProvider),
  );
});
