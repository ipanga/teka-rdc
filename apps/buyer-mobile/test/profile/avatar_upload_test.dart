// A5 (2026-09-06) — the buyer avatar upload goes through the shared
// multipart retry: after an access token expired mid-session, the AuthInterceptor
// refreshes it but cannot replay the consumed FormData; the repository rebuilds
// the body and sends it exactly once more. A 401 without the refresh marker
// (refresh rejected) and any other failure are surfaced without a second upload.
import 'dart:io';

import 'package:buyer_mobile/core/network/auth_interceptor.dart';
import 'package:buyer_mobile/features/profile/data/profile_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

Dio _scripted(List<int> answers,
    {Set<int> refreshed = const {}, List<FormData>? seen}) {
  var n = 0;
  return Dio()
    ..interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      final i = n++;
      seen?.add(o.data as FormData);
      final status = answers[i];
      if (status == 401 && refreshed.contains(i)) {
        o.extra[authRefreshedExtraKey] = true;
      }
      if (status >= 400) {
        h.reject(DioException(
          requestOptions: o,
          type: DioExceptionType.badResponse,
          response: Response(requestOptions: o, statusCode: status, data: {
            'success': false,
            'error': {'status': status, 'message': 'Format invalide'},
          }),
        ));
        return;
      }
      h.resolve(Response(requestOptions: o, statusCode: 200, data: {
        'success': true,
        'data': {'avatar': 'https://res.cloudinary.com/c/image/upload/v$i/teka-rdc/avatars/new.webp'},
      }));
    }));
}

void main() {
  late File file;
  setUpAll(() async {
    final dir = await Directory.systemTemp.createTemp('teka-avatar-');
    file = File('${dir.path}/photo.jpg')..writeAsBytesSync([0xFF, 0xD8, 0xFF, 0xE0]);
  });

  test('a refreshed 401 is retried exactly once with a REBUILT body', () async {
    final seen = <FormData>[];
    final repo = ProfileRepository(_scripted([401, 200], refreshed: {0}, seen: seen));
    final url = await repo.uploadAvatar(file);
    expect(url, endsWith('/teka-rdc/avatars/new.webp'));
    expect(seen.length, 2);
    expect(identical(seen[0], seen[1]), isFalse, reason: 'never replays a consumed FormData');
    expect(seen[1].files.single.key, 'image');
    expect(seen[1].files.single.value.filename, 'photo.jpg');
  });

  test('a 401 without the refresh marker (refresh rejected) is not retried', () async {
    final seen = <FormData>[];
    final repo = ProfileRepository(_scripted([401, 200], seen: seen));
    await expectLater(repo.uploadAvatar(file),
        throwsA(isA<DioException>().having((e) => e.response?.statusCode, 'status', 401)));
    expect(seen.length, 1);
  });

  test('a second refreshed 401 is surfaced — bounded to one retry, no duplicate asset', () async {
    final seen = <FormData>[];
    final repo = ProfileRepository(_scripted([401, 401, 200], refreshed: {0, 1}, seen: seen));
    await expectLater(repo.uploadAvatar(file), throwsA(isA<DioException>()));
    expect(seen.length, 2);
  });

  for (final status in [400, 413, 500]) {
    test('a $status (validation / size / server) is never retried', () async {
      final seen = <FormData>[];
      final repo = ProfileRepository(_scripted([status, 200], refreshed: {0}, seen: seen));
      await expectLater(repo.uploadAvatar(file),
          throwsA(isA<DioException>().having((e) => e.response?.statusCode, 'status', status)));
      expect(seen.length, 1);
    });
  }
}
