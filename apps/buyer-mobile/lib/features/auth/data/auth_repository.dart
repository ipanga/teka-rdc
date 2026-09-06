import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/secure_storage.dart';

/// Buyer authentication via WhatsApp OTP (Gupshup) since 2026-05-15.
/// The previous email+password buyer flow lived here from 2026-05-12 to
/// 2026-05-15 — its repository methods (loginWithEmail, registerBuyer*,
/// migrateBuyer*, setupBuyerPassword) were removed in favor of OTP +
/// the email-only "claim" flow.
class AuthRepository {
  final Dio _dio;
  final TokenStorage _tokenStorage;

  AuthRepository(this._dio, this._tokenStorage);

  // Buyer WhatsApp OTP ————————————————————————————————————————————————————————

  /// Issues a 6-digit OTP via WhatsApp (Gupshup). Server returns
  /// `{ expiresInSeconds, cooldownSeconds }`.
  Future<Map<String, dynamic>> requestBuyerOtp(String phone) async {
    final response = await _dio.post(
      '/v1/auth/buyer/otp/request',
      data: {'phone': phone},
    );
    return response.data['data'] ?? response.data;
  }

  /// Verifies the OTP and either signs into an existing User (any role) or
  /// creates a new BUYER. Persists access + refresh tokens on success.
  Future<Map<String, dynamic>> verifyBuyerOtp({
    required String phone,
    required String code,
    String? firstName,
    String? lastName,
  }) async {
    final response = await _dio.post(
      '/v1/auth/buyer/otp/verify',
      data: {
        'phone': phone,
        'code': code,
        if (firstName != null && firstName.isNotEmpty) 'firstName': firstName,
        if (lastName != null && lastName.isNotEmpty) 'lastName': lastName,
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

  Future<Map<String, dynamic>> resendBuyerOtp(String phone) async {
    final response = await _dio.post(
      '/v1/auth/buyer/otp/resend',
      data: {'phone': phone},
    );
    return response.data['data'] ?? response.data;
  }

  // Buyer claim flow (email-only legacy buyers) ——————————————————————————————

  /// Step 1 of /reclamer-compte: emails a magic link to the legacy buyer's
  /// inbox. Always 200 (enumeration-safe).
  Future<void> requestBuyerClaim(String email) async {
    await _dio.post(
      '/v1/auth/buyer/claim/request',
      data: {'email': email},
    );
  }

  /// Step 2 of /reclamer-compte: verifies the magic-link JWT + a fresh OTP
  /// and attaches the phone to the existing User.
  Future<Map<String, dynamic>> verifyBuyerClaim({
    required String token,
    required String phone,
    required String code,
  }) async {
    final response = await _dio.post(
      '/v1/auth/buyer/claim/verify',
      data: {'token': token, 'phone': phone, 'code': code},
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

  /// Resolve the stored session against `/v1/auth/me`.
  ///
  /// A2 (2026-09-06): the old `getCurrentUser()` returned `null` on ANY error,
  /// and the caller cleared the tokens — so a cold start with no signal logged
  /// the buyer out. Only the server may end a session: a 401/403 that survived
  /// the interceptor's refresh attempt is [SessionRejected]; everything else
  /// (no network, DNS, timeouts, 5xx, a throttled 429, a client-side parse
  /// bug) is [SessionUnreachable] and leaves the credentials alone.
  Future<SessionCheck> checkSession() async {
    try {
      final response = await _dio.get('/v1/auth/me');
      final body = response.data;
      final user = (body is Map ? (body['data'] ?? body) : null);
      if (user is Map<String, dynamic>) return SessionOk(user);
      if (user is Map) return SessionOk(Map<String, dynamic>.from(user));
      return const SessionUnreachable();
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      if (code == 401 || code == 403) return const SessionRejected();
      return const SessionUnreachable();
    } catch (_) {
      return const SessionUnreachable();
    }
  }

  /// Kept for callers that only need the user map (null on anything but a
  /// verified session). New code should use [checkSession].
  Future<Map<String, dynamic>?> getCurrentUser() async {
    final result = await checkSession();
    return result is SessionOk ? result.user : null;
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

/// Outcome of a session check — see [AuthRepository.checkSession].
sealed class SessionCheck {
  const SessionCheck();
}

class SessionOk extends SessionCheck {
  final Map<String, dynamic> user;
  const SessionOk(this.user);
}

/// The server answered and said no (401/403 after a refresh attempt).
class SessionRejected extends SessionCheck {
  const SessionRejected();
}

/// The server could not be asked (offline, DNS, timeout, 5xx, throttled…).
class SessionUnreachable extends SessionCheck {
  const SessionUnreachable();
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    ref.read(dioProvider),
    ref.read(tokenStorageProvider),
  );
});
