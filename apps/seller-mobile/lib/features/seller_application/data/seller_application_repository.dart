import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/utils/image_compress.dart';

/// A selectable city for the seller application (GET /v1/cities).
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
      id: json['id'] as String,
      name: json['name']?.toString() ?? '',
      province: json['province']?.toString() ?? '',
    );
  }
}

/// A selectable commune for the seller application
/// (GET /v1/cities/:cityId/communes).
class CommuneOption {
  final String id;
  final String name;

  const CommuneOption({required this.id, required this.name});

  factory CommuneOption.fromJson(Map<String, dynamic> json) {
    return CommuneOption(
      id: json['id'] as String,
      name: json['name']?.toString() ?? '',
    );
  }
}

/// Current seller application (GET /v1/sellers/application). `hasApplication`
/// is false before the first submission; the rest is populated to prefill a
/// REJECTED application for correction.
class SellerApplication {
  final bool hasApplication;
  final String? applicationStatus; // PENDING | APPROVED | REJECTED
  final String? rejectionReason;
  final String? businessName;
  final String? businessType;
  final String? idNumber;
  final String? idType;
  final String? location;
  final String? cityId;
  final String? communeId;
  final String? idDocumentCloudinaryId;
  final String? description;

  const SellerApplication({
    required this.hasApplication,
    this.applicationStatus,
    this.rejectionReason,
    this.businessName,
    this.businessType,
    this.idNumber,
    this.idType,
    this.location,
    this.cityId,
    this.communeId,
    this.idDocumentCloudinaryId,
    this.description,
  });

  factory SellerApplication.fromJson(Map<String, dynamic> json) {
    return SellerApplication(
      hasApplication: json['hasApplication'] as bool? ?? false,
      applicationStatus: json['applicationStatus'] as String?,
      rejectionReason: json['rejectionReason'] as String?,
      businessName: json['businessName'] as String?,
      businessType: json['businessType'] as String?,
      idNumber: json['idNumber'] as String?,
      idType: json['idType'] as String?,
      location: json['location'] as String?,
      cityId: json['cityId'] as String?,
      communeId: json['communeId'] as String?,
      idDocumentCloudinaryId: json['idDocumentCloudinaryId'] as String?,
      description: json['description'] as String?,
    );
  }
}

class SellerApplicationRepository {
  final Dio _dio;
  SellerApplicationRepository(this._dio);

  /// GET /v1/sellers/application — current status (+ prefill for REJECTED).
  Future<SellerApplication> getApplication() async {
    final response = await _dio.get('/v1/sellers/application');
    final data = response.data['data'] ?? response.data;
    return SellerApplication.fromJson(data as Map<String, dynamic>);
  }

  /// GET /v1/cities — active cities for the city selector.
  Future<List<CityOption>> getCities() async {
    final response = await _dio.get('/v1/cities');
    final data = response.data['data'] ?? response.data;
    return (data as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(CityOption.fromJson)
        .toList(growable: false);
  }

  /// GET /v1/cities/:cityId/communes — communes of the selected city.
  Future<List<CommuneOption>> getCommunes(String cityId) async {
    final response = await _dio.get('/v1/cities/$cityId/communes');
    final data = response.data['data'] ?? response.data;
    return (data as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(CommuneOption.fromJson)
        .toList(growable: false);
  }

  /// POST /v1/sellers/documents — upload the KYC document (ID/RCCM photo) to
  /// the private Cloudinary folder. Returns its public_id, passed to apply()
  /// as idDocumentCloudinaryId.
  Future<String> uploadDocument(File file) async {
    final compressed = await compressImageForUpload(file);
    final formData = FormData.fromMap({
      'document': MultipartFile.fromBytes(
        compressed.bytes,
        filename: compressed.filename,
      ),
    });
    final response = await _dio.post('/v1/sellers/documents', data: formData);
    final data = response.data['data'] ?? response.data;
    return (data as Map<String, dynamic>)['cloudinaryId'] as String;
  }

  /// POST /v1/sellers/apply — submit (or resubmit) the business application.
  /// [phone] must already be normalized to +243XXXXXXXXX.
  Future<void> apply({
    required String businessName,
    required String businessType,
    required String idType,
    required String idNumber,
    required String phone,
    required String location,
    required String idDocumentCloudinaryId,
    // Required by the API whenever the city has an active commune library;
    // omitted only for a city without communes yet (D2/D4).
    String? communeId,
    String? cityId,
    String? description,
  }) async {
    await _dio.post(
      '/v1/sellers/apply',
      data: {
        'businessName': businessName,
        'businessType': businessType,
        'idType': idType,
        'idNumber': idNumber,
        'phone': phone,
        'location': location,
        if (communeId != null && communeId.isNotEmpty) 'communeId': communeId,
        'idDocumentCloudinaryId': idDocumentCloudinaryId,
        if (cityId != null && cityId.isNotEmpty) 'cityId': cityId,
        if (description != null && description.isNotEmpty)
          'description': description,
      },
    );
  }
}

final sellerApplicationRepositoryProvider =
    Provider<SellerApplicationRepository>((ref) {
  return SellerApplicationRepository(ref.read(dioProvider));
});
