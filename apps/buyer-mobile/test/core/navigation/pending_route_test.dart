// PR D (2026-09-06) — a notification tap or an App Link that arrives before
// the buyer has picked a town must survive the city gate.
import 'package:buyer_mobile/core/navigation/pending_route.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('with a town selected the external route navigates immediately', () {
    expect(resolveExternalRoute(hasCity: true), ExternalRouteAction.navigate);
  });

  test('without a town the route is deferred behind the city gate', () {
    expect(resolveExternalRoute(hasCity: false),
        ExternalRouteAction.deferBehindCityGate);
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
