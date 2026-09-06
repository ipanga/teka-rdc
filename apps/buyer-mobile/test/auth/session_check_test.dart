// A2 (2026-09-06) — the session check must separate "the server said no"
// from "the server could not be asked". Only the first may end a session.
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';
import 'package:buyer_mobile/features/auth/data/auth_repository.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);
  final Future<ResponseBody> Function(RequestOptions) handler;
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? body, Future<void>? cancel) => handler(options);
  @override
  void close({bool force = false}) {}
}

AuthRepository _repo(Future<ResponseBody> Function(RequestOptions) handler) {
  final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = _Adapter(handler);
  return AuthRepository(dio, TokenStorage(const FlutterSecureStorage()));
}

ResponseBody _json(int status, String body) => ResponseBody.fromString(body, status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });

void main() {
  test('200 with a user → SessionOk carrying the user map', () async {
    final repo = _repo((_) async => _json(200, '{"success":true,"data":{"id":"u1","role":"BUYER","firstName":"Aline"}}'));
    final r = await repo.checkSession();
    expect(r, isA<SessionOk>());
    expect((r as SessionOk).user['id'], 'u1');
    expect(await repo.getCurrentUser(), isNotNull);
  });

  test('401 → SessionRejected (the server ended it)', () async {
    final repo = _repo((_) async => _json(401, '{"success":false,"error":{"status":401,"message":"Non autorisé"}}'));
    expect(await repo.checkSession(), isA<SessionRejected>());
    expect(await repo.getCurrentUser(), isNull);
  });

  test('403 → SessionRejected', () async {
    final repo = _repo((_) async => _json(403, '{"success":false}'));
    expect(await repo.checkSession(), isA<SessionRejected>());
  });

  test('no network (connection error) → SessionUnreachable, never a rejection', () async {
    final repo = _repo((o) async => throw DioException(requestOptions: o, type: DioExceptionType.connectionError, message: 'Failed host lookup'));
    expect(await repo.checkSession(), isA<SessionUnreachable>());
  });

  test('timeout → SessionUnreachable', () async {
    final repo = _repo((o) async => throw DioException(requestOptions: o, type: DioExceptionType.receiveTimeout));
    expect(await repo.checkSession(), isA<SessionUnreachable>());
  });

  for (final code in [429, 500, 502, 503, 504]) {
    test('$code → SessionUnreachable (a transient server answer is not a verdict)', () async {
      final repo = _repo((_) async => _json(code, '{"success":false}'));
      expect(await repo.checkSession(), isA<SessionUnreachable>());
    });
  }

  test('a malformed 200 body is unreachable, not a logout', () async {
    final repo = _repo((_) async => _json(200, '"garbage"'));
    expect(await repo.checkSession(), isA<SessionUnreachable>());
  });
}
