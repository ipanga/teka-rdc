import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/verification/data/verification_repository.dart';

/// Fake API: the first upload answers 401 (access token expired; the auth
/// interceptor refreshes but cannot replay a multipart body), the second 200.
void main() {
  test(
      'uploadDocument retries exactly once after a 401, rebuilding the multipart body',
      () async {
    var posts = 0;
    final dio = Dio()
      ..interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
        if (options.method == 'POST') {
          posts++;
          expect(options.data, isA<FormData>());
          final fd = options.data as FormData;
          expect(fd.files.single.value.filename, 'cni.pdf');
          if (posts == 1) {
            handler.reject(DioException(
              requestOptions: options,
              type: DioExceptionType.badResponse,
              response:
                  Response(requestOptions: options, statusCode: 401, data: {
                'success': false,
                'error': {'status': 401, 'message': 'Unauthorized'}
              }),
            ));
            return;
          }
        }
        handler
            .resolve(Response(requestOptions: options, statusCode: 200, data: {
          'success': true,
          'data': {
            'verificationStatus': 'PENDING_REVIEW',
            'requiredTypes': ['IDENTITY_DOCUMENT'],
            'missingTypes': [],
            'documents': []
          },
        }));
      }));
    final repo = VerificationRepository(dio);
    final res = await repo.uploadDocument(
        type: 'IDENTITY_DOCUMENT',
        bytes: Uint8List.fromList('%PDF-1.4'.codeUnits),
        filename: 'cni.pdf',
        mimeType: 'application/pdf');
    expect(posts, 2);
    expect(res.verificationStatus, 'PENDING_REVIEW');
  });

  test('any other failure is not retried (a 400 must not create two rows)',
      () async {
    var posts = 0;
    final dio = Dio()
      ..interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
        posts++;
        handler.reject(DioException(
            requestOptions: options,
            type: DioExceptionType.badResponse,
            response: Response(requestOptions: options, statusCode: 400, data: {
              'success': false,
              'error': {'status': 400, 'message': 'Format non supporté'}
            })));
      }));
    final repo = VerificationRepository(dio);
    await expectLater(
        repo.uploadDocument(
            type: 'RCCM',
            bytes: Uint8List(8),
            filename: 'x.pdf',
            mimeType: 'application/pdf'),
        throwsA(isA<DioException>()));
    expect(posts, 1);
  });
}
