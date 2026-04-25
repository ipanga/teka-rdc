import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/secure_storage.dart';

class AuthRepository {
  final Dio _dio;
  final TokenStorage _tokenStorage;

  AuthRepository(this._dio, this._tokenStorage);

  // Email + password —————————————————————————————————————————————————————————

  Future<Map<String, dynamic>> loginWithEmail(String email, String password) async {
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

  Future<Map<String, dynamic>> registerWithEmail(
    String email,
    String password,
    String firstName,
    String lastName,
  ) async {
    final response = await _dio.post(
      '/v1/auth/register/email',
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

  // Seller migration ——————————————————————————————————————————————————————————

  /// Returns one of: { migration: 'email_setup_sent' | 'email_required' | 'already_migrated', maskedPhone? }
  Future<Map<String, dynamic>> migrateSellerCheck(String email) async {
    final response = await _dio.post(
      '/v1/auth/seller/migrate-check',
      data: {'email': email},
    );
    return response.data['data'] ?? response.data;
  }

  Future<Map<String, dynamic>> migrateSellerLinkEmail({
    required String phone,
    required String code,
    required String email,
  }) async {
    final response = await _dio.post(
      '/v1/auth/seller/migrate-link-email',
      data: {'phone': phone, 'code': code, 'email': email},
    );
    return response.data['data'] ?? response.data;
  }

  /// Consumes the 24h setup JWT, sets the password, and issues tokens.
  Future<Map<String, dynamic>> setupSellerPassword(String token, String password) async {
    final response = await _dio.post(
      '/v1/auth/seller/setup-password',
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

  // Phone OTP (kept for migration flow only) ——————————————————————————————————

  Future<Map<String, dynamic>> requestOtp(String phone) async {
    final response = await _dio.post(
      '/v1/auth/otp/request',
      data: {'phone': phone},
    );
    return response.data['data'] ?? response.data;
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
