import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import '../../data/auth_repository.dart';
import '../../data/session_scope.dart';
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

  /// `false` while the app is running on stored credentials that the server
  /// has not confirmed in this launch (offline cold start, A2). The session
  /// is still [AuthStatus.authenticated] — the buyer keeps their cart, orders
  /// and profile — and [AuthNotifier.checkAuthStatus] runs again as soon as
  /// connectivity returns. Only a server rejection ever ends a session.
  final bool sessionVerified;

  const AuthState({
    this.status = AuthStatus.unknown,
    this.user,
    this.isLoading = false,
    this.error,
    this.sessionVerified = true,
  });

  AuthState copyWith({
    AuthStatus? status,
    Map<String, dynamic>? user,
    bool? isLoading,
    String? error,
    bool? sessionVerified,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      sessionVerified: sessionVerified ?? this.sessionVerified,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository _authRepository;
  final TokenStorage _tokenStorage;
  final SessionScope? _scope;
  bool _checking = false;

  AuthNotifier(this._authRepository, this._tokenStorage, [this._scope])
      : super(const AuthState()) {
    checkAuthStatus();
  }

  /// Resolve the stored session. Three outcomes (A2, 2026-09-06):
  ///  * no tokens → unauthenticated;
  ///  * server confirms → authenticated, profile cached for offline starts;
  ///  * server rejects (401/403 after refresh) → tokens cleared, unauthenticated;
  ///  * server unreachable → authenticated on the stored credentials with the
  ///    cached profile, `sessionVerified: false`, re-checked on reconnect.
  Future<void> checkAuthStatus() async {
    if (_checking) return;
    _checking = true;
    try {
      state = state.copyWith(isLoading: true);

      bool hasTokens;
      try {
        hasTokens = await _tokenStorage.hasTokens();
      } catch (_) {
        // Secure storage unavailable (broken keystore, missing plugin in a
        // widget test): there is no usable session, but nothing to clear either.
        hasTokens = false;
      }
      if (!hasTokens) {
        state = state.copyWith(
          status: AuthStatus.unauthenticated,
          isLoading: false,
          sessionVerified: true,
        );
        return;
      }

      final result = await _authRepository.checkSession();
      switch (result) {
        case SessionOk(:final user):
          _applySentryUser(user);
          await _scope?.cacheProfile(user);
          state = state.copyWith(
            status: AuthStatus.authenticated,
            user: user,
            isLoading: false,
            sessionVerified: true,
          );
        case SessionRejected():
          await _tokenStorage.clearTokens();
          await _scope?.clearPrivateState();
          _applySentryUser(null);
          state = const AuthState(status: AuthStatus.unauthenticated);
        case SessionUnreachable():
          final cached = state.user ?? _scope?.readCachedProfile();
          if (cached != null) _applySentryUser(cached);
          state = state.copyWith(
            status: AuthStatus.authenticated,
            user: cached,
            isLoading: false,
            sessionVerified: false,
          );
      }
    } finally {
      _checking = false;
    }
  }

  /// Connectivity is back: confirm a session that was accepted offline.
  Future<void> reverifyIfNeeded() async {
    if (state.status == AuthStatus.authenticated && !state.sessionVerified) {
      await checkAuthStatus();
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

      // A4: whatever the previous account left on this device goes before
      // the new session becomes visible (the OTP verify already replaced the
      // tokens).
      await _scope?.clearPrivateState();
      _applySentryUser(data['user'] as Map<String, dynamic>?);
      if (user != null) await _scope?.cacheProfile(user);
      const PosthogAnalytics().capture(
        'auth_login_success',
        properties: {'method': 'otp'},
      );
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isLoading: false,
        sessionVerified: true,
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
      await _scope?.clearPrivateState();
      final claimed = data['user'];
      if (claimed is Map<String, dynamic>) await _scope?.cacheProfile(claimed);
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isLoading: false,
        sessionVerified: true,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: friendlyErrorMessage(e));
      rethrow;
    }
  }

  /// Apply a profile change the buyer just made (name, email, avatar) to the
  /// session's user — the single in-memory source every screen's header
  /// reads — and to the on-disk profile cache the next offline start
  /// restores from. The API is authoritative: callers pass what the server
  /// answered, never the form input. No-op when signed out.
  ///
  /// Pre-scale audit, 2026-09-06: the account header showed the old name and
  /// photo after an edit because nothing ever updated `state.user`.
  Future<void> updateUser(Map<String, dynamic> patch) async {
    final current = state.user;
    if (state.status != AuthStatus.authenticated || current == null) return;
    final merged = <String, dynamic>{...current, ...patch};
    state = state.copyWith(user: merged);
    await _scope?.cacheProfile(merged);
  }

  Future<void> logout() async {
    await _authRepository.logout();
    // A4: the disk must be clean before the next person signs in — cart
    // snapshot, cached profile, recently viewed, recent searches.
    await _scope?.clearPrivateState();
    _applySentryUser(null);
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  // The scope needs SharedPreferences, which main() provides; widget tests
  // that never touch the disk may leave it unoverridden — the session then
  // simply has no on-disk state to cache or clear.
  SessionScope? scope;
  try {
    scope = ref.read(sessionScopeProvider);
  } catch (_) {
    scope = null;
  }
  return AuthNotifier(
    ref.read(authRepositoryProvider),
    ref.read(tokenStorageProvider),
    scope,
  );
});
