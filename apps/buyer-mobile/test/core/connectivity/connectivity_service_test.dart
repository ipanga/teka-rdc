// Unit tests for the connectivity state machine.
//
// Both buyer-mobile and seller-mobile ship an identical `ConnectivityService`
// (per-app code, identical content — see plan note about deferred shared
// package). Testing it once here covers both apps' logic. If the two ever
// diverge, duplicate this spec into seller-mobile/test/.

import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:buyer_mobile/core/connectivity/connectivity_service.dart';
import 'package:buyer_mobile/core/connectivity/connectivity_status.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ConnectivityService — state machine', () {
    late StreamController<List<ConnectivityResult>> ifaceCtrl;
    late _FakeProbe probe;
    late ConnectivityService service;

    setUp(() {
      ifaceCtrl = StreamController<List<ConnectivityResult>>.broadcast();
      probe = _FakeProbe();
      service = ConnectivityService(
        baseUrl: 'http://test.invalid/api',
        interfaceStream: ifaceCtrl.stream,
        probe: probe.run,
      );
    });

    tearDown(() async {
      await service.dispose();
      await ifaceCtrl.close();
    });

    test('initial state is reconnecting (before start)', () {
      expect(service.snapshot.status, ConnectivityStatus.reconnecting);
    });

    test('start with probe success → connected', () async {
      probe.queueResults([_ok(200)]);
      await service.start();

      expect(service.snapshot.status, ConnectivityStatus.connected);
      expect(service.snapshot.lastProbeLatencyMs, 200);
      expect(service.snapshot.lastProbeError, isNull);
    });

    test('start with probe http_5xx → noInternet', () async {
      probe.queueResults([_err('http_5xx')]);
      await service.start();

      expect(service.snapshot.status, ConnectivityStatus.noInternet);
      expect(service.snapshot.lastProbeError, 'http_5xx');
    });

    test('start with probe timeout → noInternet with timeout tag', () async {
      probe.queueResults([_err('timeout')]);
      await service.start();

      expect(service.snapshot.status, ConnectivityStatus.noInternet);
      expect(service.snapshot.lastProbeError, 'timeout');
    });

    test('no interface event → disconnected', () async {
      probe.queueResults([_ok(100)]);
      await service.start();
      expect(service.snapshot.status, ConnectivityStatus.connected);

      ifaceCtrl.add([ConnectivityResult.none]);
      // Yield once for the iface listener to fire.
      await Future<void>.delayed(Duration.zero);
      expect(service.snapshot.status, ConnectivityStatus.disconnected);
    });

    test('disconnected → connected when interface returns + probe ok',
        () async {
      probe.queueResults([_ok(100)]);
      await service.start();

      ifaceCtrl.add([ConnectivityResult.none]);
      await Future<void>.delayed(Duration.zero);
      expect(service.snapshot.status, ConnectivityStatus.disconnected);

      probe.queueResults([_ok(150)]);
      ifaceCtrl.add([ConnectivityResult.wifi]);
      // The interface listener runs sync from add(); _runProbe is awaited
      // via unawaited(). Pump a few microtasks for it to complete.
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(service.snapshot.status, ConnectivityStatus.connected);
    });

    test('two consecutive slow probes flip to unstable; one fast flips back',
        () async {
      probe.queueResults([_ok(1700), _ok(1900), _ok(300)]);

      // start() consumes _ok(1700) → connected (hysteresis count = 1)
      await service.start();
      expect(service.snapshot.status, ConnectivityStatus.connected);
      expect(service.snapshot.lastProbeLatencyMs, 1700);

      // checkNow() consumes _ok(1900) — flips to unstable
      await service.checkNow();
      expect(service.snapshot.status, ConnectivityStatus.unstable);
      expect(service.snapshot.lastProbeLatencyMs, 1900);

      // checkNow() consumes _ok(300) — back to connected
      await service.checkNow();
      expect(service.snapshot.status, ConnectivityStatus.connected);
      expect(service.snapshot.lastProbeLatencyMs, 300);
    });

    test('pause stops timers; resume kicks an immediate probe', () async {
      probe.queueResults([_ok(100), _err('timeout')]);

      // start() consumes _ok(100) → connected.
      await service.start();
      expect(service.snapshot.status, ConnectivityStatus.connected);

      service.pause();
      // resume() runs a fresh probe — consumes _err('timeout').
      await service.resume();
      expect(service.snapshot.status, ConnectivityStatus.noInternet);
    });

    test('disposed service does not throw on later events', () async {
      probe.queueResults([_ok(100)]);
      await service.start();
      await service.dispose();
      // After dispose, sending events is a no-op (no exception).
      ifaceCtrl.add([ConnectivityResult.none]);
      ifaceCtrl.add([ConnectivityResult.wifi]);
      await Future<void>.delayed(Duration.zero);
      // No assertion needed — absence of exception is the test.
    });

    test('isOnline / isOffline derived getters track status', () {
      const onlineStates = [
        ConnectivityStatus.connected,
        ConnectivityStatus.unstable,
      ];
      const offlineStates = [
        ConnectivityStatus.disconnected,
        ConnectivityStatus.noInternet,
      ];
      for (final s in onlineStates) {
        final snap = ConnectivitySnapshot(status: s, at: DateTime.now());
        expect(snap.isOnline, isTrue, reason: '$s should be online');
        expect(snap.isOffline, isFalse);
      }
      for (final s in offlineStates) {
        final snap = ConnectivitySnapshot(status: s, at: DateTime.now());
        expect(snap.isOnline, isFalse);
        expect(snap.isOffline, isTrue, reason: '$s should be offline');
      }
    });
  });
}

// ---- helpers -----------------------------------------------------------

class _FakeProbe {
  final _queue = <ProbeOutcome>[];

  /// Queue results to be returned by successive `run()` calls. If the
  /// queue is drained, returns the last result indefinitely.
  void queueResults(List<ProbeOutcome> results) {
    _queue.clear();
    _queue.addAll(results);
  }

  Future<ProbeOutcome> run() async {
    if (_queue.isEmpty) {
      return const ProbeOutcome(latencyMs: 0, errorTag: 'unknown');
    }
    final r = _queue.length == 1 ? _queue.first : _queue.removeAt(0);
    return r;
  }
}

ProbeOutcome _ok(int latencyMs) =>
    ProbeOutcome(latencyMs: latencyMs, errorTag: null);
ProbeOutcome _err(String tag) =>
    ProbeOutcome(latencyMs: 0, errorTag: tag);
