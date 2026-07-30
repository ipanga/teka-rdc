// Widget tests for ConnectivityToastHost.
//
// Strategy: override `connectivitySnapshotProvider` with a controllable
// stream so each test scripts the transitions the host should react to, then
// assert on the snackbar it does (or does not) show.
//
// The child MUST contain a Scaffold — `showSnackBar` asserts that the
// messenger has a registered scaffold.
//
// Kept byte-identical with apps/seller-mobile (Rule 15) except the package
// import prefix.

import 'dart:async';

import 'package:seller_mobile/core/connectivity/connectivity_provider.dart';
import 'package:seller_mobile/core/connectivity/connectivity_status.dart';
import 'package:seller_mobile/core/connectivity/widgets/connectivity_toast_host.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const String _offline = ConnectivityToastHost.offlineMessage;
const String _restored = ConnectivityToastHost.restoredMessage;

void main() {
  group('ConnectivityToastHost — layout', () {
    testWidgets('never shifts the page when connectivity changes',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.connected));
      await _settle(tester);

      final rectBefore = tester.getRect(find.byKey(_pageKey));
      final scaffoldBefore = tester.getRect(find.byType(Scaffold));

      controller.add(_snap(ConnectivityStatus.disconnected));
      await _settle(tester);

      expect(find.text(_offline), findsOneWidget);
      // The whole point of the migration: the page geometry is untouched
      // while the toast is on screen.
      expect(tester.getRect(find.byKey(_pageKey)), rectBefore);
      expect(tester.getRect(find.byType(Scaffold)), scaffoldBefore);

      await _teardown(tester, controller);
    });

    testWidgets('renders its child verbatim', (tester) async {
      await _pumpHost(tester, snapshots: [_snap(ConnectivityStatus.connected)]);
      await _settle(tester);

      expect(find.byKey(_pageKey), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
    });
  });

  group('ConnectivityToastHost — state mapping', () {
    testWidgets('cold start reconnecting → connected stays silent',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.reconnecting));
      await _settle(tester);
      controller.add(_snap(ConnectivityStatus.connected));
      await _settle(tester);

      expect(find.text(_restored), findsNothing);
      expect(find.text(_offline), findsNothing);

      await _teardown(tester, controller);
    });

    testWidgets('cold start into noInternet announces offline', (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.reconnecting));
      await _settle(tester);
      controller.add(_snap(ConnectivityStatus.noInternet));
      await _settle(tester);

      expect(find.text(_offline), findsOneWidget);

      await _teardown(tester, controller);
    });

    testWidgets('disconnected announces offline', (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.disconnected));
      await _settle(tester);

      expect(find.text(_offline), findsOneWidget);
      expect(find.byIcon(Icons.wifi_off_outlined), findsOneWidget);

      await _teardown(tester, controller);
    });

    testWidgets('disconnected → noInternet is one toast, not two',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.disconnected));
      await _settle(tester);
      controller.add(_snap(ConnectivityStatus.noInternet));
      await _settle(tester);

      expect(find.byType(SnackBar), findsOneWidget);

      await _teardown(tester, controller);
    });

    testWidgets('unstable shows nothing', (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.unstable));
      await _settle(tester);
      controller.add(_snap(ConnectivityStatus.connected));
      await _settle(tester);

      expect(find.byType(SnackBar), findsNothing);

      await _teardown(tester, controller);
    });

    testWidgets('repeated snapshots with the same status toast once',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      // Same status, different `at` / latency — exactly what the probe loop
      // emits every 30s. `ConnectivitySnapshot ==` treats these as distinct.
      controller.add(_snap(ConnectivityStatus.disconnected, seconds: 1));
      await tester.pump();
      controller.add(_snap(ConnectivityStatus.disconnected, seconds: 2));
      await tester.pump();
      controller.add(_snap(ConnectivityStatus.disconnected, seconds: 3));
      await _settle(tester);

      expect(find.byType(SnackBar), findsOneWidget);

      await _teardown(tester, controller);
    });

    testWidgets('offline → connected closes the loop with "rétablie"',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.disconnected));
      await _settle(tester);
      expect(find.text(_offline), findsOneWidget);

      // Past the cooldown so the recovery leg is allowed to speak.
      await tester.pump(ConnectivityToastHost.minNotifyInterval);
      controller.add(_snap(ConnectivityStatus.connected));
      await _settle(tester);

      expect(find.text(_restored), findsOneWidget);
      expect(find.byIcon(Icons.wifi_outlined), findsOneWidget);

      // And it goes away on its own. ScaffoldMessenger arms the dismiss timer
      // in a build *after* the entrance animation completes — and because the
      // toast preempts (clearSnackBars), its entrance waits for the previous
      // toast's exit. So: settle the animations first, then let the duration
      // elapse, then settle the exit.
      await tester.pumpAndSettle();
      await tester.pump(
        ConnectivityToastHost.restoredToastDuration + const Duration(seconds: 1),
      );
      await tester.pumpAndSettle();
      expect(find.text(_restored), findsNothing);

      await _teardown(tester, controller);
    });

    testWidgets('reconnecting between offline and connected is transparent',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.disconnected));
      await _settle(tester);
      expect(find.text(_offline), findsOneWidget);

      await tester.pump(ConnectivityToastHost.minNotifyInterval);
      controller.add(_snap(ConnectivityStatus.reconnecting));
      await _settle(tester);
      controller.add(_snap(ConnectivityStatus.connected));
      await _settle(tester);

      expect(find.text(_restored), findsOneWidget);

      await _teardown(tester, controller);
    });
  });

  group('ConnectivityToastHost — anti-flap', () {
    testWidgets('a flap shorter than settleDelay says nothing at all',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.connected));
      await tester.pump();
      controller.add(_snap(ConnectivityStatus.disconnected));
      await tester.pump(const Duration(milliseconds: 500));
      controller.add(_snap(ConnectivityStatus.connected));
      await _settle(tester);

      expect(find.byType(SnackBar), findsNothing);

      await _teardown(tester, controller);
    });

    testWidgets('recovery inside the cooldown stays silent', (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.disconnected));
      await _settle(tester);
      expect(find.text(_offline), findsOneWidget);

      await tester.pump(const Duration(seconds: 18));
      controller.add(_snap(ConnectivityStatus.connected));
      await _settle(tester);

      expect(find.text(_restored), findsNothing);

      await _teardown(tester, controller);
    });

    testWidgets('a second drop inside the cooldown does not re-toast',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.disconnected));
      await _settle(tester);

      await tester.pump(const Duration(seconds: 18));
      controller.add(_snap(ConnectivityStatus.connected));
      await _settle(tester);

      await tester.pump(const Duration(seconds: 8));
      controller.add(_snap(ConnectivityStatus.disconnected));
      await _settle(tester);

      // The original toast has long expired and neither the recovery nor the
      // second drop was allowed to speak.
      expect(find.byType(SnackBar), findsNothing);

      await _teardown(tester, controller);
    });

    testWidgets('a drop after the cooldown expires toasts again',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_snap(ConnectivityStatus.disconnected));
      await _settle(tester);
      expect(find.text(_offline), findsOneWidget);

      // Let the first toast and the whole cooldown window elapse.
      await tester.pump(const Duration(seconds: 30));
      controller.add(_snap(ConnectivityStatus.connected));
      await _settle(tester);
      await tester.pump(const Duration(seconds: 40));

      controller.add(_snap(ConnectivityStatus.disconnected));
      await _settle(tester);

      expect(find.text(_offline), findsOneWidget);

      await _teardown(tester, controller);
    });
  });
}

// ---- helpers -----------------------------------------------------------

const _pageKey = ValueKey('page-content');

final DateTime _epoch = DateTime.utc(2026, 1, 1);

/// `seconds` varies `at` so successive snapshots compare unequal — the probe
/// loop does exactly this on every tick.
ConnectivitySnapshot _snap(ConnectivityStatus status, {int seconds = 0}) {
  return ConnectivitySnapshot(
    status: status,
    at: _epoch.add(Duration(seconds: seconds)),
    lastProbeLatencyMs: status == ConnectivityStatus.unstable ? 1800 : 200,
  );
}

/// Pump past the stream emission, the settle timer and the snackbar entrance
/// animation so assertions see the final state.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(ConnectivityToastHost.settleDelay);
  await tester.pump(const Duration(milliseconds: 400));
}

/// Unmount the host so its settle/cooldown timers are cancelled — the test
/// binding fails on timers that outlive the widget tree.
Future<void> _teardown(
  WidgetTester tester,
  StreamController<ConnectivitySnapshot> controller,
) async {
  await controller.close();
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
}

Future<void> _pumpHost(
  WidgetTester tester, {
  List<ConnectivitySnapshot>? snapshots,
  Stream<ConnectivitySnapshot>? stream,
}) async {
  final src = stream ?? Stream.fromIterable(snapshots ?? const []);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        connectivitySnapshotProvider.overrideWith((_) => src),
      ],
      child: MaterialApp(
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('fr')],
        locale: const Locale('fr'),
        home: const ConnectivityToastHost(
          child: Scaffold(
            body: Center(child: Text('PAGE', key: _pageKey)),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 10));
}
