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
    return NotificationPrefs(
      smsOrderUpdates: data['smsOrderUpdates'] as bool? ?? true,
      smsBroadcasts: data['smsBroadcasts'] as bool? ?? true,
    );
  }

  /// PATCH /v1/users/notification-prefs — partial body; server merges.
  Future<NotificationPrefs> updateNotificationPrefs({
    bool? smsOrderUpdates,
    bool? smsBroadcasts,
  }) async {
    final body = <String, dynamic>{};
    if (smsOrderUpdates != null) body['smsOrderUpdates'] = smsOrderUpdates;
    if (smsBroadcasts != null) body['smsBroadcasts'] = smsBroadcasts;
    final response = await _dio.patch(
      '/v1/users/notification-prefs',
      data: body,
    );
    final data = response.data['data'] as Map<String, dynamic>;
    return NotificationPrefs(
      smsOrderUpdates: data['smsOrderUpdates'] as bool? ?? true,
      smsBroadcasts: data['smsBroadcasts'] as bool? ?? true,
    );
  }
}

class NotificationPrefs {
  final bool smsOrderUpdates;
  final bool smsBroadcasts;
  const NotificationPrefs({
    required this.smsOrderUpdates,
    required this.smsBroadcasts,
  });
}

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.read(dioProvider));
});
