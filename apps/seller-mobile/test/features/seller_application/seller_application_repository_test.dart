import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/seller_application/data/seller_application_repository.dart';

import '../../helpers/fake_auth_api.dart';

/// Onboarding identity-photo upload through the REAL AuthInterceptor: the
/// expired token, the refresh, Dio's consumed-FormData replay failure, the
/// rebuilt retry — and the cases where no retry may happen.
void main() {
  late Directory tmp;
  late File photo;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('teka_onboard_');
    photo = File('${tmp.path}/cni.jpg')..writeAsBytesSync(List.filled(64, 7));
  });
  tearDown(() => tmp.delete(recursive: true));

  FakeAuthApi api(
          {RefreshMode refresh = RefreshMode.ok,
          bool always401 = false,
          int status = 201}) =>
      FakeAuthApi(
        isUpload: (p) => p == '/v1/sellers/documents',
        uploadBody: (i, _) => {'cloudinaryId': 'teka/private/doc-$i'},
        refreshMode: refresh,
        alwaysUnauthorized: always401,
        uploadStatus: status,
      );

  test('a normal upload succeeds with one request and one resource', () async {
    final fake = api();
    final tokens = MemoryTokens(access: 'new-access');
    final repo = SellerApplicationRepository(buildAuthedDio(fake, tokens));
    expect(await repo.uploadDocument(photo), 'teka/private/doc-1');
    expect(fake.uploadRequests, 1);
    expect(fake.refreshCalls, 0);
    expect(fake.createdResources, hasLength(1));
  });

  test(
      'expired token: 401 → refresh → rebuilt retry once → success, one resource, still signed in',
      () async {
    final fake = api();
    final tokens = MemoryTokens();
    final repo = SellerApplicationRepository(buildAuthedDio(fake, tokens));
    expect(await repo.uploadDocument(photo), 'teka/private/doc-1');
    final uploads =
        fake.requests.where((r) => r.path == '/v1/sellers/documents');
    expect(uploads.map((r) => r.authorization),
        ['Bearer old-access', 'Bearer new-access']);
    expect(fake.refreshCalls, 1);
    expect(fake.createdResources, hasLength(1), reason: 'no duplicate asset');
    expect(tokens.access, 'new-access');
    expect(tokens.clears, 0);
  });

  test('refresh rejected: the 401 surfaces, no retry, session cleared',
      () async {
    final fake = api(refresh: RefreshMode.rejected);
    final tokens = MemoryTokens();
    final repo = SellerApplicationRepository(buildAuthedDio(fake, tokens));
    await expectLater(
        repo.uploadDocument(photo),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)));
    expect(fake.uploadRequests, 1);
    expect(fake.createdResources, isEmpty);
    expect(tokens.clears, 1);
  });

  test('refresh offline: the 401 surfaces, no retry, session kept', () async {
    final fake = api(refresh: RefreshMode.offline);
    final tokens = MemoryTokens();
    final repo = SellerApplicationRepository(buildAuthedDio(fake, tokens));
    await expectLater(repo.uploadDocument(photo), throwsA(isA<DioException>()));
    expect(fake.uploadRequests, 1);
    expect(tokens.access, 'old-access');
    expect(tokens.clears, 0);
  });

  test('a second 401 after the rebuilt retry is surfaced, not looped',
      () async {
    final fake = api(always401: true);
    final repo =
        SellerApplicationRepository(buildAuthedDio(fake, MemoryTokens()));
    await expectLater(
        repo.uploadDocument(photo),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)));
    expect(fake.uploadRequests, 2);
    expect(fake.createdResources, isEmpty);
  });

  test('a validation failure (400) is not retried', () async {
    final fake = api(status: 400);
    final repo = SellerApplicationRepository(
        buildAuthedDio(fake, MemoryTokens(access: 'new-access')));
    await expectLater(
        repo.uploadDocument(photo),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 400)));
    expect(fake.uploadRequests, 1);
    expect(fake.refreshCalls, 0);
  });
}
