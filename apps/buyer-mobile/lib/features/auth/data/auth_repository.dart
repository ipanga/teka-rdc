import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/secure_storage.dart';

class AuthRepository {
  final Dio _dio;
  final TokenStorage _tokenStorage;

  AuthRepository(this._dio, this._tokenStorage);

  Future<Map<String, dynamic>> requestOtp(String phone) async {
    final response = await _dio.post(
      '/v1/auth/otp/request',
      data: {'phone': phone},
    );
    return response.data['data'] ?? response.data;
  }

  Future<Map<String, dynamic>> verifyOtp(String phone, String code) async {
    final response = await _dio.post(
      '/v1/auth/otp/verify',
      data: {'phone': phone, 'code': code},
    );
    return response.data['data'] ?? response.data;
  }

  Future<Map<String, dynamic>> login(String phone, String code) async {
    final response = await _dio.post(
      '/v1/auth/login',
      data: {'phone': phone, 'code': code},
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

  Future<Map<String, dynamic>> register(
    String phone,
    String code,
    String firstName,
    String lastName,
  ) async {
    final response = await _dio.post(
      '/v1/auth/register',
      data: {
        'phone': phone,
        'code': code,
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
