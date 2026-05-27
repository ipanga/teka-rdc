// Widget test for ConnectivityLifecycleObserver.
//
// Strategy: override `connectivityServiceProvider` with a spy
// implementation that records pause() / resume() calls. Pump the
// observer widget inside ProviderScope, then drive
// `tester.binding.handleAppLifecycleStateChanged()` through the
// lifecycle transitions and assert the spy saw the right calls.

import 'dart:async';

import 'package:buyer_mobile/core/connectivity/connectivity_lifecycle_observer.dart';
import 'package:buyer_mobile/core/connectivity/connectivity_provider.dart';
import 'package:buyer_mobile/core/connectivity/connectivity_service.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ConnectivityLifecycleObserver', () {
    late _SpyConnectivityService spy;

    setUp(() {
      spy = _SpyConnectivityService();
    });

    Future<void> pumpObserver(WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            connectivityServiceProvider.overrideWith((_) => spy),
          ],
          child: MaterialApp(
            home: ConnectivityLifecycleObserver(
              child: Scaffold(body: const Text('PAGE')),
            ),
          ),
        ),
      );
    }

    testWidgets('paused → service.pause() called', (tester) async {
      await pumpObserver(tester);
      expect(spy.pauseCount, 0);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();

      expect(spy.pauseCount, 1);
      expect(spy.resumeCount, 0);
    });

    testWidgets('inactive → service.pause() called', (tester) async {
      await pumpObserver(tester);

      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();

      expect(spy.pauseCount, 1);
    });

    testWidgets('hidden → service.pause() called', (tester) async {
      await pumpObserver(tester);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      await tester.pump();

      expect(spy.pauseCount, 1);
    });

    testWidgets('resumed → service.resume() called', (tester) async {
      await pumpObserver(tester);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();

      expect(spy.resumeCount, 1);
      expect(spy.pauseCount, 0);
    });

    testWidgets('detached → neither pause nor resume', (tester) async {
      await pumpObserver(tester);

      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.detached);
      await tester.pump();

      expect(spy.pauseCount, 0);
      expect(spy.resumeCount, 0);
    });

    testWidgets('paused → resumed → paused: pauses=2, resumes=1',
        (tester) async {
      await pumpObserver(tester);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();

      expect(spy.pauseCount, 2);
      expect(spy.resumeCount, 1);
    });

    testWidgets('observer removed on dispose (no leaks)', (tester) async {
      await pumpObserver(tester);

      // Replace the tree with nothing — disposes the observer widget.
      await tester.pumpWidget(const SizedBox.shrink());

      // After dispose, lifecycle changes must NOT route to the spy.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();

      expect(spy.pauseCount, 0);
    });

    testWidgets('child renders unchanged', (tester) async {
      await pumpObserver(tester);
      expect(find.text('PAGE'), findsOneWidget);
    });
  });
}

/// Minimal stand-in for ConnectivityService that records pause/resume
/// calls. Doesn't start a real probe loop — we override the provider so
/// no other consumer ever sees this instance.
class _SpyConnectivityService extends ConnectivityService {
  _SpyConnectivityService()
      : super(
          baseUrl: 'http://test.invalid/api',
          interfaceStream: const Stream<List<ConnectivityResult>>.empty(),
          probe: () async =>
              const ProbeOutcome(latencyMs: 0, errorTag: null),
        );

  int pauseCount = 0;
  int resumeCount = 0;

  @override
  void pause() {
    pauseCount++;
    super.pause();
  }

  @override
  Future<void> resume() async {
    resumeCount++;
    // Skip the actual probe to keep the test deterministic.
  }
}
