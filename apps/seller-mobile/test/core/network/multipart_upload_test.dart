import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/network/auth_interceptor.dart';
import 'package:seller_mobile/core/network/multipart_upload.dart';

/// Guards of the shared multipart retry, with a scripted transport:
/// [answers] lists the status each successive POST gets; [refreshed] marks
/// which of those 401s the AuthInterceptor would have refreshed behind.
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
              'error': {'status': status, 'message': 'err'}
            })));
        return;
      }
      h.resolve(Response(requestOptions: o, statusCode: status, data: {
        'success': true,
        'data': {'n': i}
      }));
    }));
}

FormData _form() => FormData.fromMap({
      'image': MultipartFile.fromBytes([1, 2, 3], filename: 'a.jpg'),
    });

void main() {
  test('retries exactly once after a refreshed 401, with a rebuilt body',
      () async {
    final seen = <FormData>[];
    final dio = _scripted([401, 201], refreshed: {0}, seen: seen);
    var builds = 0;
    final res =
        await postMultipartWithAuthRetry<dynamic>(dio, '/up', buildForm: () {
      builds++;
      return _form();
    });
    expect(res.statusCode, 201);
    expect(builds, 2, reason: 'the body is rebuilt, never replayed');
    expect(identical(seen[0], seen[1]), isFalse);
    expect(seen[1].files.single.value.filename, 'a.jpg');
  });

  test('a second 401 is surfaced, never looped (bounded to one retry)',
      () async {
    var posts = 0;
    final dio = _scripted([401, 401, 201], refreshed: {0, 1});
    await expectLater(
        postMultipartWithAuthRetry<dynamic>(dio, '/up', buildForm: () {
          posts++;
          return _form();
        }),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)));
    expect(posts, 2);
  });

  test('a 401 WITHOUT the refresh marker is not retried (refresh failed)',
      () async {
    var posts = 0;
    final dio = _scripted([401, 201]);
    await expectLater(
        postMultipartWithAuthRetry<dynamic>(dio, '/up', buildForm: () {
          posts++;
          return _form();
        }),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)));
    expect(posts, 1);
  });

  for (final status in [400, 413, 500]) {
    test('a $status is not retried as an auth failure', () async {
      var posts = 0;
      final dio = _scripted([status, 201], refreshed: {0});
      await expectLater(
          postMultipartWithAuthRetry<dynamic>(dio, '/up', buildForm: () {
            posts++;
            return _form();
          }),
          throwsA(isA<DioException>()
              .having((e) => e.response?.statusCode, 'status', status)));
      expect(posts, 1);
    });
  }

  test('a connection error is not retried', () async {
    var posts = 0;
    final dio = Dio()
      ..interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
        posts++;
        h.reject(DioException(
            requestOptions: o, type: DioExceptionType.connectionError));
      }));
    await expectLater(
        postMultipartWithAuthRetry<dynamic>(dio, '/up',
            buildForm: () => _form()),
        throwsA(isA<DioException>()
            .having((e) => e.type, 'type', DioExceptionType.connectionError)));
    expect(posts, 1);
  });

  test('the progress callback is forwarded to the request', () async {
    ProgressCallback? forwarded;
    final dio = Dio()
      ..interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
        forwarded = o.onSendProgress;
        h.resolve(Response(requestOptions: o, statusCode: 201, data: {}));
      }));
    void cb(int a, int b) {}
    await postMultipartWithAuthRetry<dynamic>(dio, '/up',
        buildForm: _form, onSendProgress: cb);
    expect(forwarded, same(cb));
  });
}
