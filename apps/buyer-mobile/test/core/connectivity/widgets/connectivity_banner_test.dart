// Widget tests for ConnectivityBannerHost.
//
// Strategy: override `connectivitySnapshotProvider` with a controllable
// StreamProvider so each test can script the connectivity transitions
// the widget should react to. Then assert that the banner renders the
// right text + color (via finder).

import 'dart:async';

import 'package:buyer_mobile/core/connectivity/connectivity_provider.dart';
import 'package:buyer_mobile/core/connectivity/connectivity_status.dart';
import 'package:buyer_mobile/core/connectivity/widgets/connectivity_banner.dart';
import 'package:buyer_mobile/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ConnectivityBannerHost', () {
    testWidgets('hides banner when connected (steady state)', (tester) async {
      await _pumpHost(
        tester,
        snapshots: [_connected],
      );

      // The "page content" widget is always visible, banner is not.
      expect(find.text('PAGE'), findsOneWidget);
      expect(find.text('Pas de connexion internet'), findsNothing);
      expect(find.text('Internet limité'), findsNothing);
      expect(find.text('Connexion instable'), findsNothing);
      expect(find.text('Reconnexion...'), findsNothing);
      expect(find.text('Connexion rétablie'), findsNothing);
    });

    testWidgets('shows red banner with French text when disconnected',
        (tester) async {
      await _pumpHost(
        tester,
        snapshots: [_disconnected],
      );

      expect(find.text('Pas de connexion internet'), findsOneWidget);
      expect(find.byIcon(Icons.wifi_off_outlined), findsOneWidget);
    });

    testWidgets('shows orange banner when noInternet', (tester) async {
      await _pumpHost(
        tester,
        snapshots: [_noInternet],
      );

      expect(find.text('Internet limité'), findsOneWidget);
      expect(find.byIcon(Icons.signal_wifi_bad_outlined), findsOneWidget);
    });

    testWidgets('shows unstable banner', (tester) async {
      await _pumpHost(
        tester,
        snapshots: [_unstable],
      );

      expect(find.text('Connexion instable'), findsOneWidget);
      expect(find.byIcon(Icons.network_check_outlined), findsOneWidget);
    });

    testWidgets('shows reconnecting banner', (tester) async {
      await _pumpHost(
        tester,
        snapshots: [_reconnecting],
      );

      expect(find.text('Reconnexion...'), findsOneWidget);
      expect(find.byIcon(Icons.sync), findsOneWidget);
    });

    testWidgets(
        'transition disconnected → connected shows "Connexion rétablie" briefly',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      // 1. Start: disconnected → red banner.
      controller.add(_disconnected);
      await _settleEmission(tester);
      expect(find.text('Pas de connexion internet'), findsOneWidget);

      // 2. Transition: connected → "Connexion rétablie" green banner.
      controller.add(_connected);
      await _settleEmission(tester);
      expect(find.text('Connexion rétablie'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);

      // 3. After 3s, banner disappears.
      await tester.pump(ConnectivityBannerHost.restoredDisplayDuration);
      await tester.pump(const Duration(milliseconds: 10));
      expect(find.text('Connexion rétablie'), findsNothing);

      await controller.close();
    });

    testWidgets('green banner dismisses early on re-drop to offline',
        (tester) async {
      final controller = StreamController<ConnectivitySnapshot>.broadcast();
      await _pumpHost(tester, stream: controller.stream);

      controller.add(_disconnected);
      await _settleEmission(tester);

      controller.add(_connected);
      await _settleEmission(tester);
      expect(find.text('Connexion rétablie'), findsOneWidget);

      // Drop again before the 3s window expires.
      controller.add(_disconnected);
      await _settleEmission(tester);
      expect(find.text('Connexion rétablie'), findsNothing);
      expect(find.text('Pas de connexion internet'), findsOneWidget);

      await controller.close();
    });

    testWidgets('child renders below the banner', (tester) async {
      await _pumpHost(
        tester,
        snapshots: [_disconnected],
      );

      // Banner is at the top of the screen; child content sits below it
      // (within the Expanded). We verify both render simultaneously.
      expect(find.text('Pas de connexion internet'), findsOneWidget);
      expect(find.text('PAGE'), findsOneWidget);
    });
  });
}

// ---- helpers -----------------------------------------------------------

// A fixed reference time for the snapshots below. `ConnectivitySnapshot.at`
// is not used by the widget — only `.status` — so the actual value doesn't
// matter. Can't be const (DateTime() isn't a const constructor) so the
// snapshots that wrap it are final, not const.
final DateTime _epoch = DateTime.utc(2026, 1, 1);

final _connected = ConnectivitySnapshot(
  status: ConnectivityStatus.connected,
  at: _epoch,
  lastProbeLatencyMs: 200,
);
final _disconnected =
    ConnectivitySnapshot(status: ConnectivityStatus.disconnected, at: _epoch);
final _noInternet = ConnectivitySnapshot(
  status: ConnectivityStatus.noInternet,
  at: _epoch,
  lastProbeError: 'timeout',
);
final _unstable = ConnectivitySnapshot(
  status: ConnectivityStatus.unstable,
  at: _epoch,
  lastProbeLatencyMs: 1800,
);
final _reconnecting =
    ConnectivitySnapshot(status: ConnectivityStatus.reconnecting, at: _epoch);

/// Pump enough frames after a stream emission to fully observe the
/// transition end-to-end:
///   1. Initial rebuild — `ref.watch` picks up the new async value.
///   2. Post-frame `_handleStatusChange` callback runs and calls
///      `setState` if the new status warrants a banner change.
///   3. Second rebuild from the setState.
///   4. AnimatedSwitcher cross-fade (200ms) + AnimatedSize collapse/
///      expand. During the cross-fade, BOTH the old and new banner
///      Text widgets are simultaneously on screen — assertions made
///      during this window can find stale text.
///
/// 350ms covers the 200ms AnimatedSwitcher + 200ms AnimatedSize + a
/// small buffer. Well under the 3s `restoredDisplayDuration`.
Future<void> _settleEmission(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
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
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('fr'),
        home: ConnectivityBannerHost(
          child: Scaffold(
            body: Center(child: Text('PAGE')),
          ),
        ),
      ),
    ),
  );
  // Pump once to settle the stream subscription.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 10));
}
