import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/auth_repository.dart';
import '../../../../core/storage/secure_storage.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

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

  // Email + password ——————————————————————————————————————————————————————————

  Future<void> loginWithEmail(String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await _authRepository.loginWithEmail(email, password);
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> registerBuyerWithEmail(
    String email,
    String password,
    String firstName,
    String lastName,
  ) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await _authRepository.registerBuyerWithEmail(
        email,
        password,
        firstName,
        lastName,
      );
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isLoading: false,
      );
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

  // Buyer migration ———————————————————————————————————————————————————————————

  Future<Map<String, dynamic>> migrateBuyerCheck(String phone) async {
    return _authRepository.migrateBuyerCheck(phone);
  }

  Future<Map<String, dynamic>> migrateBuyerLinkEmail({
    required String phone,
    required String email,
  }) async {
    return _authRepository.migrateBuyerLinkEmail(phone: phone, email: email);
  }

  Future<void> setupBuyerPassword(String token, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await _authRepository.setupBuyerPassword(token, password);
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

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
