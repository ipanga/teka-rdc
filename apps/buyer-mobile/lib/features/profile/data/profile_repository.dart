import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

/// Authenticated user shape returned by GET /v1/auth/me. Buyers don't have
/// a SellerProfile attached, so this is simpler than the seller-mobile
/// equivalent.
class BuyerProfile {
  final String id;
  final String? firstName;
  final String? lastName;
  final String? email;
  final String? phone;
  final String? avatar;
  final String role;

  const BuyerProfile({
    required this.id,
    this.firstName,
    this.lastName,
    this.email,
    this.phone,
    this.avatar,
    required this.role,
  });

  factory BuyerProfile.fromJson(Map<String, dynamic> json) {
    return BuyerProfile(
      id: json['id'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      avatar: json['avatar'] as String?,
      role: json['role'] as String? ?? 'BUYER',
    );
  }
}

class ProfileRepository {
  final Dio _dio;
  ProfileRepository(this._dio);

  Future<BuyerProfile> getMe() async {
    final response = await _dio.get('/v1/auth/me');
    final raw = response.data['data'] as Map<String, dynamic>;
    return BuyerProfile.fromJson(raw);
  }

  /// PATCH /v1/users/profile — name + email. Role-agnostic endpoint
  /// (same one sellers + admins use); the controller scopes the update to
  /// the authenticated userId regardless of role.
  Future<BuyerProfile> updateProfile({
    String? firstName,
    String? lastName,
    String? email,
  }) async {
    final body = <String, dynamic>{};
    if (firstName != null) body['firstName'] = firstName;
    if (lastName != null) body['lastName'] = lastName;
    if (email != null) body['email'] = email;
    final response = await _dio.patch('/v1/users/profile', data: body);
    final raw = response.data['data'] as Map<String, dynamic>;
    return BuyerProfile.fromJson(raw);
  }

  /// POST /v1/users/avatar — multipart `image` field. The API caps payloads
  /// at 5 MB; image_picker's maxWidth/maxHeight/imageQuality knobs keep
  /// avatars well under that without a separate compress step.
  Future<String> uploadAvatar(File file) async {
    final formData = FormData.fromMap({
      'image': await MultipartFile.fromFile(file.path),
    });
    final response = await _dio.post('/v1/users/avatar', data: formData);
    final data = response.data['data'] as Map<String, dynamic>;
    return data['avatar'] as String;
  }

  /// GET /v1/users/notification-prefs — resolved prefs with defaults
  /// applied by the server. Defaults are all-on for backward compat.
  Future<NotificationPrefs> getNotificationPrefs() async {
    final response = await _dio.get('/v1/users/notification-prefs');
    final data = response.data['data'] as Map<String, dynamic>;
    return NotificationPrefs.fromJson(data);
  }

  /// PATCH /v1/users/notification-prefs — partial body; server merges.
  ///
  /// The single "Annonces et promotions" toggle drives BOTH backend broadcast
  /// channels (`pushBroadcasts` + `emailBroadcasts`). The legacy `smsBroadcasts`
  /// key was retired 2026-05-26 and is silently ignored by the API — sending it
  /// (as the app used to) left the toggle a no-op.
  Future<NotificationPrefs> updateNotificationPrefs({
    bool? orderUpdates,
    bool? announcements,
  }) async {
    final body = <String, dynamic>{};
    if (orderUpdates != null) body['smsOrderUpdates'] = orderUpdates;
    if (announcements != null) {
      body['pushBroadcasts'] = announcements;
      body['emailBroadcasts'] = announcements;
    }
    final response = await _dio.patch(
      '/v1/users/notification-prefs',
      data: body,
    );
    final data = response.data['data'] as Map<String, dynamic>;
    return NotificationPrefs.fromJson(data);
  }

  /// GET /v1/users/account/deletion — current pending-deletion status.
  Future<DeletionStatus> getDeletionStatus() async {
    final response = await _dio.get('/v1/users/account/deletion');
    return DeletionStatus.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  /// POST /v1/users/account/deletion — schedule deletion (buyer re-auth = OTP).
  /// Not retry-safe (mutates account + revokes sessions).
  Future<DeletionStatus> requestAccountDeletion({
    required String otpCode,
  }) async {
    final response = await _dio.post(
      '/v1/users/account/deletion',
      data: {'confirmPhrase': 'SUPPRIMER', 'otpCode': otpCode},
    );
    return DeletionStatus.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  /// DELETE /v1/users/account/deletion — cancel a pending deletion.
  Future<void> cancelAccountDeletion() async {
    await _dio.delete('/v1/users/account/deletion');
  }

  /// GET /v1/users/sessions — list of active refresh-token sessions.
  Future<List<SessionDto>> listSessions() async {
    final response = await _dio.get('/v1/users/sessions');
    final list = response.data['data'] as List<dynamic>;
    return list
        .cast<Map<String, dynamic>>()
        .map(SessionDto.fromJson)
        .toList(growable: false);
  }

  /// DELETE /v1/users/sessions/:id — revoke a single non-current session.
  Future<void> revokeSession(String id) async {
    await _dio.delete('/v1/users/sessions/$id');
  }

  /// DELETE /v1/users/sessions — revoke all sessions except the caller's.
  /// Returns the count of revoked rows for UI feedback.
  Future<int> revokeAllOtherSessions() async {
    final response = await _dio.delete('/v1/users/sessions');
    final data = response.data['data'] as Map<String, dynamic>;
    return data['revoked'] as int? ?? 0;
  }
}

/// Buyer notification opt-outs. Two user-facing switches:
///   - [orderUpdates]  → backend `smsOrderUpdates` (push + email order events)
///   - [announcements] → backend `pushBroadcasts` + `emailBroadcasts` together
class NotificationPrefs {
  final bool orderUpdates;
  final bool announcements;
  const NotificationPrefs({
    required this.orderUpdates,
    required this.announcements,
  });

  factory NotificationPrefs.fromJson(Map<String, dynamic> data) {
    return NotificationPrefs(
      orderUpdates: data['smsOrderUpdates'] as bool? ?? true,
      // Announcements are ON if either broadcast channel is on. This app moves
      // both together, but a mixed server state still reads as enabled.
      announcements: (data['pushBroadcasts'] as bool? ?? true) ||
          (data['emailBroadcasts'] as bool? ?? true),
    );
  }
}

class DeletionStatus {
  final bool pending;
  final DateTime? scheduledAt;
  const DeletionStatus({required this.pending, this.scheduledAt});

  factory DeletionStatus.fromJson(Map<String, dynamic> data) {
    return DeletionStatus(
      pending: data['pending'] as bool? ?? false,
      scheduledAt: data['scheduledAt'] != null
          ? DateTime.tryParse(data['scheduledAt'].toString())
          : null,
    );
  }
}

class SessionDto {
  final String id;
  final DateTime createdAt;
  final String? ipAddress;
  final String? deviceInfo;
  final bool current;

  const SessionDto({
    required this.id,
    required this.createdAt,
    required this.ipAddress,
    required this.deviceInfo,
    required this.current,
  });

  factory SessionDto.fromJson(Map<String, dynamic> json) {
    return SessionDto(
      id: json['id'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      ipAddress: json['ipAddress'] as String?,
      deviceInfo: json['deviceInfo'] as String?,
      current: json['current'] as bool? ?? false,
    );
  }
}

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.read(dioProvider));
});
