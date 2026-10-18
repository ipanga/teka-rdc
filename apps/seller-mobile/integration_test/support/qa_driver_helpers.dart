// Generic helpers for the opt-in native QA scenarios.
//
// Identical copy in apps/{buyer,seller}-mobile/integration_test/support/.

import 'dart:io' show Platform;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Polls (real time — the app does real network IO on device) until
/// [condition] holds. Never `pumpAndSettle`: connectivity probes, OTP
/// cooldowns and snackbars keep timers alive, so settling could hang.
/// On timeout, fails with what the screen actually shows.
Future<void> pumpUntil(
  WidgetTester tester,
  bool Function() condition, {
  required String waitingFor,
  Duration timeout = const Duration(seconds: 25),
  Duration step = const Duration(milliseconds: 150),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (true) {
    await tester.pump();
    if (condition()) return;
    if (DateTime.now().isAfter(deadline)) {
      fail('Délai de ${timeout.inSeconds}s dépassé en attendant : $waitingFor.\n'
          'Textes visibles : ${visibleTexts(tester).join(' | ')}');
    }
    await Future<void>.delayed(step);
  }
}

Future<void> pumpUntilFound(WidgetTester tester, Finder finder,
        {required String waitingFor, Duration? timeout}) =>
    pumpUntil(tester, () => finder.evaluate().isNotEmpty,
        waitingFor: waitingFor,
        timeout: timeout ?? const Duration(seconds: 25));

Future<void> pumpUntilGone(WidgetTester tester, Finder finder,
        {required String waitingFor}) =>
    pumpUntil(tester, () => finder.evaluate().isEmpty, waitingFor: waitingFor);

/// Lets a short real interval pass (animations, debounce) without settling.
Future<void> pumpFor(WidgetTester tester, Duration d) async {
  final end = DateTime.now().add(d);
  while (DateTime.now().isBefore(end)) {
    await tester.pump();
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
}

/// Visible static texts for failure diagnostics. Phone-like digit runs are
/// masked; field contents (EditableText: phone, OTP, password) are never read.
List<String> visibleTexts(WidgetTester tester) {
  final mask = RegExp(r'\+?\d[\d\s]{7,}\d');
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((t) => t.data ?? t.textSpan?.toPlainText() ?? '')
      .where((s) => s.trim().isNotEmpty)
      .map((s) => s.replaceAll(mask, '[n°]'))
      .take(40)
      .toList();
}

/// Static progress marker at scenario boundaries. Callers pass fixed French
/// labels only — never a token, phone, OTP, password or e-mail.
void qaStep(String label) => debugPrint('[QA] $label');

/// One named scenario of a continuous journey: logs fixed start / end
/// markers. A failure propagates and ends the journey (later scenarios and
/// their fixture writes never run).
Future<T> qaScenario<T>(String label, Future<T> Function() body) async {
  qaStep('▶ $label');
  final result = await body();
  qaStep('✔ $label');
  return result;
}

/// Tap after scrolling the target into view (lazy lists, small phones).
///
/// A real transient overlay (e.g. the floating SnackBar of the previous
/// action) can cover the target on both platforms; wait — real frames,
/// bounded — until the target itself receives the hit, then tap it for real.
/// A blocker that never goes away fails clearly.
Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder.first);
  await tester.pump();
  await pumpUntil(
      tester, () => finder.first.hitTestable().evaluate().isNotEmpty,
      waitingFor: 'cible du tap dégagée (aucun calque transitoire au-dessus)');
  await tester.tap(finder.first);
  await tester.pump();
}

String get qaPlatform => Platform.isAndroid
    ? 'android'
    : Platform.isIOS
        ? 'ios'
        : Platform.operatingSystem;

/// Screenshot named `<app>-<platform>-<step>`; written to
/// docs/qa/order-integrity/native-followup/ by test_driver/integration_test.dart.
/// Never call while a password or OTP is typed in a visible field.
class QaShots {
  QaShots(this.binding, this.app);
  final IntegrationTestWidgetsFlutterBinding binding;
  final String app;
  bool _surfaceReady = false;

  Future<void> take(WidgetTester tester, String step) async {
    if (Platform.isAndroid && !_surfaceReady) {
      await binding.convertFlutterSurfaceToImage();
      _surfaceReady = true;
    }
    // A finder can already match a SnackBar / dialog that is still sliding
    // in; let ~350 ms of real frames run so the capture shows what the
    // assertion saw (bounded, never pumpAndSettle).
    await pumpFor(tester, const Duration(milliseconds: 350));
    await binding.takeScreenshot('$app-$qaPlatform-$step');
  }
}

/// TEST-ONLY read fault, inserted FIRST in the app's real Dio at runtime
/// (nothing in lib/ knows about it). Only GETs matching the armed pattern are
/// affected; every other request — and every mutation — reaches the real API.
///
/// * [failGets]: the GET fails like a dropped connection. Rejected in the
///   request phase, so Dio skips the later error interceptors: the app's
///   retry backoff does not run for this synthetic failure (immediate,
///   deterministic error state).
/// * [delayGets]: the GET is held for a while, then sent for real — lets the
///   loading state be observed and captured.
class QaReadFault extends Interceptor {
  RegExp? _failPath;
  RegExp? _delayPath;
  Duration _delay = Duration.zero;

  void failGets(RegExp path) => _failPath = path;
  void delayGets(RegExp path, Duration delay) {
    _delayPath = path;
    _delay = delay;
  }

  void disarm() {
    _failPath = null;
    _delayPath = null;
  }

  @override
  Future<void> onRequest(
      RequestOptions options, RequestInterceptorHandler handler) async {
    if (options.method == 'GET') {
      final fail = _failPath;
      if (fail != null && fail.hasMatch(options.path)) {
        handler.reject(DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
          error: 'QA : coupure réseau simulée',
        ));
        return;
      }
      final delay = _delayPath;
      if (delay != null && delay.hasMatch(options.path)) {
        await Future<void>.delayed(_delay);
      }
    }
    handler.next(options);
  }
}
