import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';

import '../../helpers/fake_auth_api.dart';

/// Product-image upload through the REAL AuthInterceptor, including the
/// multi-image case: an image that needed the rebuilt retry must not be
/// re-sent once it succeeded, and later images keep their order.
void main() {
  const productId = '31000000-0000-0000-0000-000000000001';
  const path = '/v1/sellers/products/$productId/images';
  late Directory tmp;
  late File a;
  late File b;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('teka_product_');
    a = File('${tmp.path}/a.jpg')..writeAsBytesSync(List.filled(32, 1));
    b = File('${tmp.path}/b.jpg')..writeAsBytesSync(List.filled(32, 2));
  });
  tearDown(() => tmp.delete(recursive: true));

  FakeAuthApi api(
          {RefreshMode refresh = RefreshMode.ok,
          bool always401 = false,
          int status = 201}) =>
      FakeAuthApi(
        isUpload: (p) => p == path,
        uploadBody: (i, _) => {
          'id': 'img-$i',
          'url': 'https://res.cloudinary.com/teka/img-$i.webp',
          'displayOrder': i - 1,
        },
        refreshMode: refresh,
        alwaysUnauthorized: always401,
        uploadStatus: status,
      );

  test('a normal upload succeeds with one request and one image', () async {
    final fake = api();
    final repo = ProductsRepository(
        buildAuthedDio(fake, MemoryTokens(access: 'new-access')));
    final img = await repo.uploadImage(productId, a);
    expect(img.id, 'img-1');
    expect(fake.uploadRequests, 1);
    expect(fake.createdResources, hasLength(1));
  });

  test(
      'expired token: 401 → refresh → rebuilt retry once → one image, still signed in',
      () async {
    final fake = api();
    final tokens = MemoryTokens();
    final repo = ProductsRepository(buildAuthedDio(fake, tokens));
    final img = await repo.uploadImage(productId, a);
    expect(img.id, 'img-1');
    expect(
        fake.requests.where((r) => r.path == path).map((r) => r.authorization),
        ['Bearer old-access', 'Bearer new-access']);
    expect(fake.refreshCalls, 1);
    expect(fake.createdResources, hasLength(1), reason: 'no duplicate image');
    expect(tokens.access, 'new-access');
    expect(tokens.clears, 0);
  });

  test(
      'two images: the first needs the retry, the second does not; nothing is duplicated and order is kept',
      () async {
    final fake = api();
    final tokens = MemoryTokens();
    final repo = ProductsRepository(buildAuthedDio(fake, tokens));
    final first = await repo.uploadImage(productId, a);
    final second = await repo.uploadImage(productId, b);
    expect([first.id, second.id], ['img-1', 'img-2']);
    expect([first.displayOrder, second.displayOrder], [0, 1]);
    expect(fake.uploadRequests, 3,
        reason: '401 + retry for a, a single request for b');
    expect(fake.createdResources, hasLength(2));
    expect(fake.refreshCalls, 1, reason: 'b rides the refreshed session');
  });

  test('refresh rejected: the 401 surfaces, no retry, session cleared',
      () async {
    final fake = api(refresh: RefreshMode.rejected);
    final tokens = MemoryTokens();
    final repo = ProductsRepository(buildAuthedDio(fake, tokens));
    await expectLater(
        repo.uploadImage(productId, a),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)));
    expect(fake.uploadRequests, 1);
    expect(fake.createdResources, isEmpty);
    expect(tokens.clears, 1);
  });

  test('refresh offline: the 401 surfaces, no retry, session kept', () async {
    final fake = api(refresh: RefreshMode.offline);
    final tokens = MemoryTokens();
    final repo = ProductsRepository(buildAuthedDio(fake, tokens));
    await expectLater(
        repo.uploadImage(productId, a), throwsA(isA<DioException>()));
    expect(fake.uploadRequests, 1);
    expect(tokens.access, 'old-access');
    expect(tokens.clears, 0);
  });

  test('a second 401 after the rebuilt retry is surfaced, not looped',
      () async {
    final fake = api(always401: true);
    final repo = ProductsRepository(buildAuthedDio(fake, MemoryTokens()));
    await expectLater(
        repo.uploadImage(productId, a),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)));
    expect(fake.uploadRequests, 2);
    expect(fake.createdResources, isEmpty);
  });

  test('a validation failure (413) is not retried', () async {
    final fake = api(status: 413);
    final repo = ProductsRepository(
        buildAuthedDio(fake, MemoryTokens(access: 'new-access')));
    await expectLater(
        repo.uploadImage(productId, a),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 413)));
    expect(fake.uploadRequests, 1);
    expect(fake.refreshCalls, 0);
  });
}
