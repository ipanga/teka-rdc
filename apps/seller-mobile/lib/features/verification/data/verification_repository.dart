import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

/// One of the seller's own verification documents as the API exposes it to
/// the seller (`GET /v1/sellers/verification`). Deliberately carries NO
/// storage identifier or URL — the API never sends one to a seller.
class SellerDocumentView {
  final String id;
  final String
      type; // RCCM | IDENTIFICATION_NATIONALE | IDENTITY_DOCUMENT | OTHER
  final String? label;
  final String status; // PENDING | ACCEPTED | REJECTED | SUPERSEDED
  final String mimeType;
  final int sizeBytes;
  final String? originalName;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;
  final String? rejectionReason;

  const SellerDocumentView({
    required this.id,
    required this.type,
    this.label,
    required this.status,
    required this.mimeType,
    required this.sizeBytes,
    this.originalName,
    this.submittedAt,
    this.reviewedAt,
    this.rejectionReason,
  });

  factory SellerDocumentView.fromJson(Map<String, dynamic> json) {
    return SellerDocumentView(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? 'OTHER',
      label: json['label'] as String?,
      status: json['status'] as String? ?? 'PENDING',
      mimeType: json['mimeType'] as String? ?? '',
      sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      originalName: json['originalName'] as String?,
      submittedAt: DateTime.tryParse(json['submittedAt']?.toString() ?? ''),
      reviewedAt: DateTime.tryParse(json['reviewedAt']?.toString() ?? ''),
      rejectionReason: json['rejectionReason'] as String?,
    );
  }
}

/// Authoritative upload limits sent by the API (never hard-coded here).
class UploadLimits {
  final int maxSizeBytes;
  final List<String> acceptedMimeTypes;
  const UploadLimits(
      {required this.maxSizeBytes, required this.acceptedMimeTypes});

  int get maxSizeMb => (maxSizeBytes / (1024 * 1024)).round();

  factory UploadLimits.fromJson(Map<String, dynamic>? json) {
    return UploadLimits(
      maxSizeBytes: (json?['maxSizeBytes'] as num?)?.toInt() ?? 5 * 1024 * 1024,
      acceptedMimeTypes:
          (json?['acceptedMimeTypes'] as List?)?.cast<String>() ??
              const ['application/pdf', 'image/jpeg', 'image/png'],
    );
  }
}

/// The seller's verification status + documents + what is still required.
/// Requirements come from the API (`requiredTypes` / `missingTypes`), so the
/// app never keeps a rule of its own (D3).
class VerificationStatusModel {
  final String
      verificationStatus; // NOT_SUBMITTED | PENDING_REVIEW | VERIFIED | REJECTED
  final DateTime? verificationSubmittedAt;
  final DateTime? verifiedAt;
  final DateTime? verificationRejectedAt;
  final DateTime? verificationRevokedAt;
  final String? verificationNote;
  final String? businessType;
  final List<String> requiredTypes;
  final List<String> missingTypes;
  final UploadLimits limits;
  final List<SellerDocumentView> documents;

  const VerificationStatusModel({
    required this.verificationStatus,
    this.verificationSubmittedAt,
    this.verifiedAt,
    this.verificationRejectedAt,
    this.verificationRevokedAt,
    this.verificationNote,
    this.businessType,
    required this.requiredTypes,
    required this.missingTypes,
    required this.limits,
    required this.documents,
  });

  factory VerificationStatusModel.fromJson(Map<String, dynamic> json) {
    return VerificationStatusModel(
      verificationStatus:
          json['verificationStatus'] as String? ?? 'NOT_SUBMITTED',
      verificationSubmittedAt:
          DateTime.tryParse(json['verificationSubmittedAt']?.toString() ?? ''),
      verifiedAt: DateTime.tryParse(json['verifiedAt']?.toString() ?? ''),
      verificationRejectedAt:
          DateTime.tryParse(json['verificationRejectedAt']?.toString() ?? ''),
      verificationRevokedAt:
          DateTime.tryParse(json['verificationRevokedAt']?.toString() ?? ''),
      verificationNote: json['verificationNote'] as String?,
      businessType: json['businessType'] as String?,
      requiredTypes:
          (json['requiredTypes'] as List?)?.cast<String>() ?? const [],
      missingTypes: (json['missingTypes'] as List?)?.cast<String>() ?? const [],
      limits: UploadLimits.fromJson(json['limits'] as Map<String, dynamic>?),
      documents: ((json['documents'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(SellerDocumentView.fromJson)
          .toList(growable: false),
    );
  }

  /// The current (non-superseded) document of a type, if any.
  SellerDocumentView? documentOf(String type) {
    for (final d in documents) {
      if (d.type == type && d.status != 'SUPERSEDED') return d;
    }
    return null;
  }
}

class VerificationRepository {
  final Dio _dio;
  VerificationRepository(this._dio);

  Future<VerificationStatusModel> getStatus() async {
    final response = await _dio.get('/v1/sellers/verification');
    final data = response.data['data'] ?? response.data;
    return VerificationStatusModel.fromJson(data as Map<String, dynamic>);
  }

  /// POST /v1/sellers/verification/documents — multipart `document` + `type`
  /// (+ `label` for OTHER). Not retry-safe (creates a row + a private asset):
  /// never mark it retryable (Rule 15). The bytes are sent as-is with their
  /// real content type; the API re-checks the magic bytes and strips image
  /// metadata itself.
  ///
  /// One deliberate exception to "never retry a POST": when the access token
  /// expired mid-session the AuthInterceptor refreshes it but cannot replay a
  /// multipart body (the stream is consumed), so the first attempt surfaces
  /// a 401 without the API having created anything. We rebuild the FormData
  /// and send exactly once more with the refreshed token.
  Future<VerificationStatusModel> uploadDocument({
    required String type,
    String? label,
    required Uint8List bytes,
    required String filename,
    required String mimeType,
    void Function(int sent, int total)? onProgress,
  }) async {
    FormData form() => FormData.fromMap({
          'type': type,
          if (label != null && label.trim().isNotEmpty) 'label': label.trim(),
          'document': MultipartFile.fromBytes(
            bytes,
            filename: filename,
            contentType: DioMediaType.parse(mimeType),
          ),
        });
    Future<Response<dynamic>> send() => _dio.post(
          '/v1/sellers/verification/documents',
          data: form(),
          onSendProgress: onProgress,
        );
    Response<dynamic> response;
    try {
      response = await send();
    } on DioException catch (e) {
      if (e.response?.statusCode != 401) rethrow;
      response = await send();
    }
    final data = response.data['data'] ?? response.data;
    return VerificationStatusModel.fromJson(data as Map<String, dynamic>);
  }
}

final verificationRepositoryProvider = Provider<VerificationRepository>((ref) {
  return VerificationRepository(ref.read(dioProvider));
});
