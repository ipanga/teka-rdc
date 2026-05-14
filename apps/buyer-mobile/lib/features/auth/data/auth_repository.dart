import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/secure_storage.dart';

class AuthRepository {
  final Dio _dio;
  final TokenStorage _tokenStorage;

  AuthRepository(this._dio, this._tokenStorage);

  // Email + password ——————————————————————————————————————————————————————————

  Future<Map<String, dynamic>> loginWithEmail(
    String email,
    String password,
  ) async {
    final response = await _dio.post(
      '/v1/auth/login/email',
      data: {'email': email, 'password': password},
    );
    final data = response.data['data'] ?? response.data;
    if (data['tokens'] != null) {
      await _tokenStorage.saveTokens(
        data['tokens']['accessToken'],
        data['tokens']['refreshToken'],
      );
    }
    return data;
  }

  Future<Map<String, dynamic>> registerBuyerWithEmail(
    String email,
    String password,
    String firstName,
    String lastName,
  ) async {
    final response = await _dio.post(
      '/v1/auth/register/buyer',
      data: {
        'email': email,
        'password': password,
        'firstName': firstName,
        'lastName': lastName,
      },
    );
    final data = response.data['data'] ?? response.data;
    if (data['tokens'] != null) {
      await _tokenStorage.saveTokens(
        data['tokens']['accessToken'],
        data['tokens']['refreshToken'],
      );
    }
    return data;
  }

  Future<void> requestPasswordReset(String email) async {
    await _dio.post(
      '/v1/auth/password-reset/request',
      data: {'email': email},
    );
  }

  Future<void> confirmPasswordReset(String token, String newPassword) async {
    await _dio.post(
      '/v1/auth/password-reset/confirm',
      data: {'token': token, 'newPassword': newPassword},
    );
  }

  // Buyer migration ———————————————————————————————————————————————————————————

  /// Returns `{ migration: 'needs_email_setup' | 'already_migrated' | 'unknown' }`.
  Future<Map<String, dynamic>> migrateBuyerCheck(String phone) async {
    final response = await _dio.post(
      '/v1/auth/buyer/migrate-check',
      data: {'phone': phone},
    );
    return response.data['data'] ?? response.data;
  }

  Future<Map<String, dynamic>> migrateBuyerLinkEmail({
    required String phone,
    required String email,
  }) async {
    final response = await _dio.post(
      '/v1/auth/buyer/migrate-link-email',
      data: {'phone': phone, 'email': email},
    );
    return response.data['data'] ?? response.data;
  }

  /// Consumes the 24h setup JWT, sets the password, issues fresh tokens.
  Future<Map<String, dynamic>> setupBuyerPassword(
    String token,
    String password,
  ) async {
    final response = await _dio.post(
      '/v1/auth/buyer/setup-password',
      data: {'token': token, 'password': password},
    );
    final data = response.data['data'] ?? response.data;
    if (data['tokens'] != null) {
      await _tokenStorage.saveTokens(
        data['tokens']['accessToken'],
        data['tokens']['refreshToken'],
      );
    }
    return data;
  }

  // Session ———————————————————————————————————————————————————————————————————

  Future<Map<String, dynamic>?> getCurrentUser() async {
    try {
      final response = await _dio.get('/v1/auth/me');
      return response.data['data'] ?? response.data;
    } catch (_) {
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await _dio.post('/v1/auth/logout');
    } catch (_) {
      // Ignore logout API errors
    }
    await _tokenStorage.clearTokens();
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    ref.read(dioProvider),
    ref.read(tokenStorageProvider),
  );
});
