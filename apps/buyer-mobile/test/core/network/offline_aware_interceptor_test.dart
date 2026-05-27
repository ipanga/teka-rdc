// Unit tests for OfflineAwareInterceptor.
//
// The interceptor is dependency-light by design — its only collaborator
// is a `ConnectivityStatusGetter` closure. We feed it a Dio + a fake
// HttpAdapter and toggle the connectivity state with a simple mutable
// pointer.

import 'dart:typed_data';

import 'package:buyer_mobile/core/connectivity/connectivity_status.dart';
import 'package:buyer_mobile/core/network/offline_aware_interceptor.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('OfflineAwareInterceptor', () {
    late _MockAdapter adapter;
    late Dio dio;
    late _StatusBox box;

    setUp(() {
      box = _StatusBox(ConnectivityStatus.connected);
      adapter = _MockAdapter();
      dio = Dio(BaseOptions(baseUrl: 'http://test.invalid'));
      dio.httpClientAdapter = adapter;
      dio.interceptors.add(OfflineAwareInterceptor(() => box.status));
    });

    test('passes GET through when connected', () async {
      adapter.next = _MockResponse(200, '{}');
      final res = await dio.get<dynamic>('/x');
      expect(res.statusCode, 200);
      expect(adapter.callCount, 1);
    });

    test('passes GET through when disconnected (safe method)', () async {
      box.status = ConnectivityStatus.disconnected;
      adapter.next = _MockResponse(200, '{}');
      final res = await dio.get<dynamic>('/x');
      expect(res.statusCode, 200);
      expect(adapter.callCount, 1);
    });

    test('blocks POST when disconnected', () async {
      box.status = ConnectivityStatus.disconnected;
      adapter.next = _MockResponse(200, '{}'); // shouldn't fire

      DioException? caught;
      try {
        await dio.post<dynamic>('/x', data: {});
      } on DioException catch (e) {
        caught = e;
      }
      expect(adapter.callCount, 0);
      expect(caught, isNotNull);
      expect(caught!.type, DioExceptionType.connectionError);
      expect(caught.error, 'offline');
    });

    test('blocks PUT when disconnected', () async {
      box.status = ConnectivityStatus.disconnected;
      DioException? caught;
      try {
        await dio.put<dynamic>('/x', data: {});
      } on DioException catch (e) {
        caught = e;
      }
      expect(adapter.callCount, 0);
      expect(caught, isNotNull);
    });

    test('blocks PATCH when disconnected', () async {
      box.status = ConnectivityStatus.disconnected;
      DioException? caught;
      try {
        await dio.patch<dynamic>('/x', data: {});
      } on DioException catch (e) {
        caught = e;
      }
      expect(adapter.callCount, 0);
      expect(caught, isNotNull);
    });

    test('blocks DELETE when disconnected', () async {
      box.status = ConnectivityStatus.disconnected;
      DioException? caught;
      try {
        await dio.delete<dynamic>('/x');
      } on DioException catch (e) {
        caught = e;
      }
      expect(adapter.callCount, 0);
      expect(caught, isNotNull);
    });

    test('allowOffline opt-out lets POST through when disconnected',
        () async {
      box.status = ConnectivityStatus.disconnected;
      adapter.next = _MockResponse(200, '{}');
      final res = await dio.post<dynamic>(
        '/x',
        data: {},
        options: Options(extra: {'allowOffline': true}),
      );
      expect(res.statusCode, 200);
      expect(adapter.callCount, 1);
    });

    test('lets POST through when noInternet (only disconnected blocks)',
        () async {
      box.status = ConnectivityStatus.noInternet;
      adapter.next = _MockResponse(200, '{}');
      final res = await dio.post<dynamic>('/x', data: {});
      expect(res.statusCode, 200);
      expect(adapter.callCount, 1);
    });

    test('lets POST through when unstable (optimistic)', () async {
      box.status = ConnectivityStatus.unstable;
      adapter.next = _MockResponse(200, '{}');
      final res = await dio.post<dynamic>('/x', data: {});
      expect(res.statusCode, 200);
    });

    test('lets POST through when reconnecting (optimistic)', () async {
      box.status = ConnectivityStatus.reconnecting;
      adapter.next = _MockResponse(200, '{}');
      final res = await dio.post<dynamic>('/x', data: {});
      expect(res.statusCode, 200);
    });

    test('French message attached to the synthetic DioException', () async {
      box.status = ConnectivityStatus.disconnected;
      DioException? caught;
      try {
        await dio.post<dynamic>('/x', data: {});
      } on DioException catch (e) {
        caught = e;
      }
      expect(caught!.message, contains('Pas de connexion internet'));
    });
  });
}

// ---- helpers -----------------------------------------------------------

class _StatusBox {
  ConnectivityStatus status;
  _StatusBox(this.status);
}

class _MockResponse {
  final int statusCode;
  final String body;
  const _MockResponse(this.statusCode, this.body);
}

class _MockAdapter implements HttpClientAdapter {
  _MockResponse? next;
  int callCount = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    callCount++;
    final r = next ?? const _MockResponse(200, '{}');
    return ResponseBody.fromBytes(
      Uint8List.fromList(r.body.codeUnits),
      r.statusCode,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
