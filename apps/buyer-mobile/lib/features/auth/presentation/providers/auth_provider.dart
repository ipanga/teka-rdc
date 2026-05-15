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

  // Buyer WhatsApp OTP ————————————————————————————————————————————————————————

  Future<Map<String, dynamic>> requestOtp(String phone) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await _authRepository.requestBuyerOtp(phone);
      state = state.copyWith(isLoading: false);
      return data;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
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
