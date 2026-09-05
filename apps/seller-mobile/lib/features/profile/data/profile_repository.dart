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
  // Structured business town (Town Architecture Refactor / D4) — picked from
  // /v1/cities; `location` stays free-text address detail.
  final String? cityId;
  final String? cityName;
  // Commune of the town (sub-division), picked from
  // /v1/cities/:id/communes. Null for legacy sellers who applied before the
  // commune existed — they stay editable (D4).
  final String? communeId;
  final String? communeName;
  final String? description;
  final String applicationStatus; // PENDING | APPROVED | REJECTED

  const SellerProfileInfo({
    required this.id,
    required this.businessName,
    required this.phone,
    required this.location,
    this.cityId,
    this.cityName,
    this.communeId,
    this.communeName,
    this.description,
    required this.applicationStatus,
  });

  factory SellerProfileInfo.fromJson(Map<String, dynamic> json) {
    final city = json['city'];
    final commune = json['commune'];
    return SellerProfileInfo(
      id: json['id'] as String? ?? '',
      businessName: json['businessName']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
      location: json['location']?.toString() ?? '',
      cityId: json['cityId'] as String?,
      cityName: city is Map ? city['name']?.toString() : null,
      communeId: json['communeId'] as String?,
      communeName: commune is Map ? commune['name']?.toString() : null,
      description: json['description'] as String?,
      applicationStatus: json['applicationStatus'] as String? ?? 'PENDING',
    );
  }
}

/// Lightweight town option for the seller profile city picker (GET /v1/cities).
class CityOption {
  final String id;
  final String name;
  final String province;

  const CityOption({
    required this.id,
    required this.name,
    required this.province,
  });

  factory CityOption.fromJson(Map<String, dynamic> json) {
    return CityOption(
      id: json['id'] as String? ?? '',
      name: json['name']?.toString() ?? '',
      province: json['province']?.toString() ?? '',
    );
  }
}

/// A commune of the selected town (GET /v1/cities/:cityId/communes — active
/// communes only).
class CommuneOption {
  final String id;
  final String name;

  const CommuneOption({required this.id, required this.name});

  factory CommuneOption.fromJson(Map<String, dynamic> json) {
    return CommuneOption(
      id: json['id'] as String? ?? '',
      name: json['name']?.toString() ?? '',
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

  /// PATCH /v1/sellers/profile — businessName, phone, location, cityId,
  /// communeId, description. Server rejects with 400 if applicationStatus !=
  /// APPROVED, and enforces the city ↔ commune rule (the commune must belong
  /// to the sent city; a city with communes requires one). Pass
  /// [clearCommune] to explicitly drop the commune (only accepted by the API
  /// for a town without a commune library).
  Future<void> updateSellerProfile({
    String? businessName,
    String? phone,
    String? location,
    String? cityId,
    String? communeId,
    bool clearCommune = false,
    String? description,
  }) async {
    final body = <String, dynamic>{};
    if (businessName != null) body['businessName'] = businessName;
    if (phone != null) body['phone'] = phone;
    if (location != null) body['location'] = location;
    if (cityId != null) body['cityId'] = cityId;
    if (communeId != null) {
      body['communeId'] = communeId;
    } else if (clearCommune) {
      body['communeId'] = null;
    }
    if (description != null) body['description'] = description;
    await _dio.patch('/v1/sellers/profile', data: body);
  }

  /// GET /v1/cities/:cityId/communes — active communes of a town, for the
  /// shop-profile commune picker. Empty when the town has no library yet.
  Future<List<CommuneOption>> getCommunes(String cityId) async {
    final response = await _dio.get('/v1/cities/$cityId/communes');
    final data = response.data;
    final List<dynamic> rawList = data is Map && data['data'] != null
        ? data['data'] as List
        : (data is List ? data : const []);
    return rawList
        .map((e) => CommuneOption.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /v1/cities — active towns for the seller profile city picker.
  Future<List<CityOption>> getCities() async {
    final response = await _dio.get('/v1/cities');
    final data = response.data;
    final List<dynamic> rawList = data is Map && data['data'] != null
        ? data['data'] as List
        : (data is List ? data : const []);
    return rawList
        .map((e) => CityOption.fromJson(e as Map<String, dynamic>))
        .toList();
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
  /// applied (server-side).
  Future<NotificationPrefs> getNotificationPrefs() async {
    final response = await _dio.get('/v1/users/notification-prefs');
    final data = response.data['data'] as Map<String, dynamic>;
    return NotificationPrefs.fromJson(data);
  }

  /// PATCH /v1/users/notification-prefs — accepts partial body; server
  /// merges into stored prefs and returns the resolved set.
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

  /// POST /v1/users/account/deletion — schedule deletion (seller re-auth =
  /// current password). Not retry-safe (mutates account + revokes sessions).
  Future<DeletionStatus> requestAccountDeletion({
    required String password,
  }) async {
    final response = await _dio.post(
      '/v1/users/account/deletion',
      data: {'confirmPhrase': 'SUPPRIMER', 'password': password},
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

/// Seller notification opt-outs. Two user-facing switches:
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

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.read(dioProvider));
});
