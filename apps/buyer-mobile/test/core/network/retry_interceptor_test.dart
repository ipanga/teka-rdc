// Unit tests for RetryInterceptor.
//
// Strategy: spin up a real Dio with the interceptor attached, and a
// "mock adapter" that lets each test script the sequence of responses
// / errors the network would return. Then fire requests and assert
// how many times the adapter was called + the final outcome.
//
// `MockHttpClientAdapter` is built into Dio (dio's `httpClientAdapter`
// can be replaced); we use a hand-rolled scriptable adapter for full
// control over the timing of errors.

import 'dart:async';
import 'dart:typed_data';

import 'package:buyer_mobile/core/network/retry_interceptor.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('RetryInterceptor', () {
    late _ScriptedAdapter adapter;
    late Dio dio;

    setUp(() {
      adapter = _ScriptedAdapter();
      dio = Dio(BaseOptions(baseUrl: 'http://test.invalid'));
      dio.httpClientAdapter = adapter;
      // Use zero-backoff in tests for speed.
      dio.interceptors.add(RetryInterceptor(
        client: dio,
        backoffSchedule: const [
          Duration(milliseconds: 0),
          Duration(milliseconds: 0),
          Duration(milliseconds: 0),
        ],
      ));
    });

    test('retries connectionTimeout up to 3 times then gives up', () async {
      adapter.script(List.filled(4, _ScriptStep.connectionTimeout));

      DioException? caught;
      try {
        await dio.get<dynamic>('/x');
      } on DioException catch (e) {
        caught = e;
      }

      // 1 initial + 3 retries = 4 calls.
      expect(adapter.callCount, 4);
      expect(caught, isNotNull);
      expect(caught!.type, DioExceptionType.connectionTimeout);
    });

    test('retries until success on the 2nd attempt', () async {
      adapter.script([
        _ScriptStep.connectionTimeout,
        _ScriptStep.success(200, '{"ok":true}'),
      ]);

      final res = await dio.get<dynamic>('/x');
      expect(adapter.callCount, 2);
      expect(res.statusCode, 200);
    });

    test('retries 503 + succeeds', () async {
      adapter.script([
        _ScriptStep.http(503),
        _ScriptStep.success(200, '{}'),
      ]);

      final res = await dio.get<dynamic>('/x');
      expect(adapter.callCount, 2);
      expect(res.statusCode, 200);
    });

    test('does NOT retry 500 — application error, not transient', () async {
      adapter.script([_ScriptStep.http(500)]);

      DioException? caught;
      try {
        await dio.get<dynamic>('/x');
      } on DioException catch (e) {
        caught = e;
      }

      expect(adapter.callCount, 1);
      expect(caught, isNotNull);
      expect(caught!.response?.statusCode, 500);
    });

    test('does NOT retry POST by default (non-safe)', () async {
      adapter.script(List.filled(5, _ScriptStep.connectionTimeout));

      DioException? caught;
      try {
        await dio.post<dynamic>('/x', data: {});
      } on DioException catch (e) {
        caught = e;
      }

      // POST + connectionTimeout = 1 attempt, no retries.
      expect(adapter.callCount, 1);
      expect(caught, isNotNull);
    });

    test('retries POST when retryable opt-in is set', () async {
      adapter.script([
        _ScriptStep.connectionTimeout,
        _ScriptStep.success(200, '{}'),
      ]);

      final res = await dio.post<dynamic>(
        '/x',
        data: {},
        options: Options(extra: {'retryable': true}),
      );
      expect(adapter.callCount, 2);
      expect(res.statusCode, 200);
    });

    test('does NOT retry 4xx (badResponse with non-transient code)',
        () async {
      adapter.script([_ScriptStep.http(400)]);

      DioException? caught;
      try {
        await dio.get<dynamic>('/x');
      } on DioException catch (e) {
        caught = e;
      }

      expect(adapter.callCount, 1);
      expect(caught!.response?.statusCode, 400);
    });

    test('does NOT retry on cancel', () async {
      adapter.script([_ScriptStep.cancel]);

      DioException? caught;
      try {
        await dio.get<dynamic>('/x');
      } on DioException catch (e) {
        caught = e;
      }

      expect(adapter.callCount, 1);
      expect(caught!.type, DioExceptionType.cancel);
    });
  });
}

// ---- helpers -----------------------------------------------------------

/// One scripted step that an HTTP adapter will play back on the next
/// request it receives.
class _ScriptStep {
  final int? statusCode;
  final String? body;
  final DioExceptionType? errorType;

  const _ScriptStep._(this.statusCode, this.body, this.errorType);

  static _ScriptStep success(int code, String body) =>
      _ScriptStep._(code, body, null);

  static _ScriptStep http(int code) =>
      // For 4xx/5xx we still return through the adapter; Dio decides
      // to turn it into a `badResponse` DioException based on options.
      _ScriptStep._(code, '{"error":"scripted"}', null);

  static const _ScriptStep connectionTimeout =
      _ScriptStep._(null, null, DioExceptionType.connectionTimeout);
  static const _ScriptStep cancel =
      _ScriptStep._(null, null, DioExceptionType.cancel);
}

/// HttpClientAdapter that replays a queued list of scripted steps. The
/// last step is repeated indefinitely if the queue runs out (covers
/// "retry up to N then give up" tests).
class _ScriptedAdapter implements HttpClientAdapter {
  final List<_ScriptStep> _queue = [];
  int callCount = 0;

  void script(List<_ScriptStep> steps) {
    _queue
      ..clear()
      ..addAll(steps);
    callCount = 0;
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    callCount++;
    final step = _queue.length > 1 ? _queue.removeAt(0) : _queue.first;
    if (step.errorType != null) {
      throw DioException(
        requestOptions: options,
        type: step.errorType!,
        error: 'scripted',
      );
    }
    final bodyBytes = Uint8List.fromList(
      (step.body ?? '').codeUnits,
    );
    return ResponseBody.fromBytes(
      bodyBytes,
      step.statusCode ?? 200,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
