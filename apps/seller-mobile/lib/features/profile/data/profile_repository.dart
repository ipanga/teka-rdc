import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/utils/image_compress.dart';

/// Authenticated user shape returned by GET /v1/auth/me.
class ProfileUser {
  final String id;
  final String? firstName;
  final String? lastName;
  final String? email;
  final String? phone;
  final String? avatar;
  final String role;
  final SellerProfileInfo? sellerProfile;

  const ProfileUser({
    required this.id,
    this.firstName,
    this.lastName,
    this.email,
    this.phone,
    this.avatar,
    required this.role,
    this.sellerProfile,
  });

  factory ProfileUser.fromJson(Map<String, dynamic> json) {
    final sp = json['sellerProfile'];
    return ProfileUser(
      id: json['id'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      avatar: json['avatar'] as String?,
      role: json['role'] as String? ?? 'SELLER',
      sellerProfile:
          sp is Map<String, dynamic> ? SellerProfileInfo.fromJson(sp) : null,
    );
  }
}

class SellerProfileInfo {
  final String id;
  final String businessName;
  final String phone;
  final String location;
  final String? description;
  final String applicationStatus; // PENDING | APPROVED | REJECTED

  const SellerProfileInfo({
    required this.id,
    required this.businessName,
    required this.phone,
    required this.location,
    this.description,
    required this.applicationStatus,
  });

  factory SellerProfileInfo.fromJson(Map<String, dynamic> json) {
    return SellerProfileInfo(
      id: json['id'] as String? ?? '',
      businessName: json['businessName']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
      location: json['location']?.toString() ?? '',
      description: json['description'] as String?,
      applicationStatus:
          json['applicationStatus'] as String? ?? 'PENDING',
    );
  }
}

class ProfileRepository {
  final Dio _dio;
  ProfileRepository(this._dio);

  Future<ProfileUser> getMe() async {
    final response = await _dio.get('/v1/auth/me');
    final raw = response.data['data'] as Map<String, dynamic>;
    return ProfileUser.fromJson(raw);
  }

  /// PATCH /v1/users/profile — name, email, avatar. Available to any
  /// authenticated role (no @Roles guard on the controller).
  Future<ProfileUser> updateProfile({
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
    return ProfileUser.fromJson(raw);
  }

  /// PATCH /v1/sellers/profile — businessName, phone, location, description.
  /// Server rejects with 400 if applicationStatus != APPROVED.
  Future<void> updateSellerProfile({
    String? businessName,
    String? phone,
    String? location,
    String? description,
  }) async {
    final body = <String, dynamic>{};
    if (businessName != null) body['businessName'] = businessName;
    if (phone != null) body['phone'] = phone;
    if (location != null) body['location'] = location;
    if (description != null) body['description'] = description;
    await _dio.patch('/v1/sellers/profile', data: body);
  }

  /// POST /v1/users/avatar — multipart `image` field. Reuses the same
  /// compress pipeline as product images so payloads stay ≤500 KB on
  /// 2G/3G networks.
  Future<String> uploadAvatar(File file) async {
    final compressed = await compressImageForUpload(file);
    final formData = FormData.fromMap({
      'image': MultipartFile.fromBytes(
        compressed.bytes,
        filename: compressed.filename,
      ),
    });
    final response = await _dio.post('/v1/users/avatar', data: formData);
    final data = response.data['data'] as Map<String, dynamic>;
    return data['avatar'] as String;
  }

  /// POST /v1/auth/password/change — in-app password change. Server-side
  /// validates current password, hashes new, and revokes all refresh
  /// tokens (other devices forced to re-login).
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _dio.post(
      '/v1/auth/password/change',
      data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
    );
  }

  /// GET /v1/users/notification-prefs — resolved prefs with defaults
  /// applied (server-side). Returns { smsOrderUpdates, smsBroadcasts }.
  Future<NotificationPrefs> getNotificationPrefs() async {
    final response = await _dio.get('/v1/users/notification-prefs');
    final data = response.data['data'] as Map<String, dynamic>;
    return NotificationPrefs(
      smsOrderUpdates: data['smsOrderUpdates'] as bool? ?? true,
      smsBroadcasts: data['smsBroadcasts'] as bool? ?? true,
    );
  }

  /// PATCH /v1/users/notification-prefs — accepts partial body; server
  /// merges into stored prefs and returns the resolved set.
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
