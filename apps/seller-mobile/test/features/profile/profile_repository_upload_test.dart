import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/profile/data/profile_repository.dart';

import '../../helpers/fake_auth_api.dart';

/// Avatar upload through the REAL AuthInterceptor.
void main() {
  late Directory tmp;
  late File photo;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('teka_avatar_');
    photo = File('${tmp.path}/me.png')..writeAsBytesSync(List.filled(48, 3));
  });
  tearDown(() => tmp.delete(recursive: true));

  FakeAuthApi api(
          {RefreshMode refresh = RefreshMode.ok,
          bool always401 = false,
          int status = 201}) =>
      FakeAuthApi(
        isUpload: (p) => p == '/v1/users/avatar',
        uploadBody: (i, _) =>
            {'avatar': 'https://res.cloudinary.com/teka/avatar-$i.webp'},
        refreshMode: refresh,
        alwaysUnauthorized: always401,
        uploadStatus: status,
      );

  test('a normal upload succeeds with one request', () async {
    final fake = api();
    final repo = ProfileRepository(
        buildAuthedDio(fake, MemoryTokens(access: 'new-access')));
    expect(await repo.uploadAvatar(photo), endsWith('avatar-1.webp'));
    expect(fake.uploadRequests, 1);
    expect(fake.refreshCalls, 0);
  });

  test(
      'expired token: 401 → refresh → rebuilt retry once → one avatar, still signed in',
      () async {
    final fake = api();
    final tokens = MemoryTokens();
    final repo = ProfileRepository(buildAuthedDio(fake, tokens));
    expect(await repo.uploadAvatar(photo), endsWith('avatar-1.webp'));
    expect(
        fake.requests
            .where((r) => r.path == '/v1/users/avatar')
            .map((r) => r.authorization),
        ['Bearer old-access', 'Bearer new-access']);
    expect(fake.refreshCalls, 1);
    expect(fake.createdResources, hasLength(1));
    expect(tokens.access, 'new-access');
    expect(tokens.clears, 0);
  });

  test('refresh rejected: the 401 surfaces, no retry, session cleared',
      () async {
    final fake = api(refresh: RefreshMode.rejected);
    final tokens = MemoryTokens();
    final repo = ProfileRepository(buildAuthedDio(fake, tokens));
    await expectLater(
        repo.uploadAvatar(photo),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)));
    expect(fake.uploadRequests, 1);
    expect(fake.createdResources, isEmpty);
    expect(tokens.clears, 1);
  });

  test('refresh offline: the 401 surfaces, no retry, session kept', () async {
    final fake = api(refresh: RefreshMode.offline);
    final tokens = MemoryTokens();
    final repo = ProfileRepository(buildAuthedDio(fake, tokens));
    await expectLater(repo.uploadAvatar(photo), throwsA(isA<DioException>()));
    expect(fake.uploadRequests, 1);
    expect(tokens.access, 'old-access');
    expect(tokens.clears, 0);
  });

  test('a second 401 after the rebuilt retry is surfaced, not looped',
      () async {
    final fake = api(always401: true);
    final repo = ProfileRepository(buildAuthedDio(fake, MemoryTokens()));
    await expectLater(
        repo.uploadAvatar(photo),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)));
    expect(fake.uploadRequests, 2);
    expect(fake.createdResources, isEmpty);
  });

  test('a validation failure (400) is not retried', () async {
    final fake = api(status: 400);
    final repo = ProfileRepository(
        buildAuthedDio(fake, MemoryTokens(access: 'new-access')));
    await expectLater(
        repo.uploadAvatar(photo),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 400)));
    expect(fake.uploadRequests, 1);
  });
}
