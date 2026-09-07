// PR D (2026-09-06) — a notification tap or an App Link that arrives before
// the buyer has picked a town must survive the city gate.
import 'package:buyer_mobile/core/navigation/pending_route.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('with a town selected the external route navigates immediately', () {
    expect(resolveExternalRoute(hasCity: true, isLoadingCity: false),
        ExternalRouteAction.navigate);
    expect(resolveExternalRoute(hasCity: true, isLoadingCity: true),
        ExternalRouteAction.navigate);
  });

  test('cold start while the stored town is restoring: navigate now AND remember', () {
    // The router does not gate while the restore runs; if it ends with no
    // town the route is replaced by the city selection and must be replayed.
    expect(resolveExternalRoute(hasCity: false, isLoadingCity: true),
        ExternalRouteAction.navigateAndRemember);
  });

  test('no town and nothing loading: deferred behind the city gate', () {
    expect(resolveExternalRoute(hasCity: false, isLoadingCity: false),
        ExternalRouteAction.deferBehindCityGate);
  });

  test('the parked copy is dropped only when the restore found a town', () {
    expect(shouldDropPendingRouteAfterRestore(wasLoading: true, hasCityNow: true), isTrue);
    expect(shouldDropPendingRouteAfterRestore(wasLoading: true, hasCityNow: false), isFalse,
        reason: 'first launch: the city screen will open it');
    expect(shouldDropPendingRouteAfterRestore(wasLoading: false, hasCityNow: true), isFalse,
        reason: 'a town picked on the selection screen — that screen consumes it');
  });

  test('the parked route is a plain nullable state consumed once', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(c.read(pendingRouteProvider), isNull);
    c.read(pendingRouteProvider.notifier).state = '/orders/abc';
    expect(c.read(pendingRouteProvider), '/orders/abc');
    // What the city-selection screen does after selectCity():
    final pending = c.read(pendingRouteProvider);
    c.read(pendingRouteProvider.notifier).state = null;
    expect(pending, '/orders/abc');
    expect(c.read(pendingRouteProvider), isNull);
  });
}
