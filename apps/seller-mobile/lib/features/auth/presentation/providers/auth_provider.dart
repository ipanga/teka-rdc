import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/auth_repository.dart';
import '../../../../core/storage/secure_storage.dart';

enum AuthStatus { unknown, authenticated, unauthenticated, wrongRole }

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
      final data = await _authRepository.loginWithEmail(email, password);
      _applyLoggedInUser(data['user'] as Map<String, dynamic>?);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
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
      final data = await _authRepository.registerWithEmail(
        email,
        password,
        firstName,
        lastName,
      );
      // Note: new email registrations land as BUYER role initially.
      // Seller application is a separate flow (apply from dashboard).
      _applyLoggedInUser(data['user'] as Map<String, dynamic>?);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> requestPasswordReset(String email) async {
    await _authRepository.requestPasswordReset(email);
  }

  Future<void> confirmPasswordReset(String token, String newPassword) async {
    await _authRepository.confirmPasswordReset(token, newPassword);
  }

  // Seller migration ——————————————————————————————————————————————————————————

  Future<Map<String, dynamic>> migrateSellerCheck(String email) {
    return _authRepository.migrateSellerCheck(email);
  }

  Future<Map<String, dynamic>> migrateSellerLinkEmail({
    required String phone,
    required String code,
    required String email,
  }) {
    return _authRepository.migrateSellerLinkEmail(
      phone: phone,
      code: code,
      email: email,
    );
  }

  Future<void> setupSellerPassword(String token, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await _authRepository.setupSellerPassword(token, password);
      _applyLoggedInUser(data['user'] as Map<String, dynamic>?);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<Map<String, dynamic>> requestOtp(String phone) {
    return _authRepository.requestOtp(phone);
  }

  Future<void> logout() async {
    await _authRepository.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void _applyLoggedInUser(Map<String, dynamic>? user) {
    final role = user?['role'] as String?;
    if (role == 'SELLER' || role == 'ADMIN') {
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
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.read(authRepositoryProvider),
    ref.read(tokenStorageProvider),
  );
});
