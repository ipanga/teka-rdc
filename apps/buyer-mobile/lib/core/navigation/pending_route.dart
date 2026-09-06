import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/city/presentation/providers/city_provider.dart';

/// A route that arrived from OUTSIDE the app (a notification tap, an App /
/// Universal Link) while the buyer still had to pick a town.
///
/// Before PR D (2026-09-06) such a route was pushed straight away; the router's
/// city-first redirect then replaced it with `/city-selection`, and choosing a
/// town went to the home screen — the tapped order or shared product was lost.
/// Now the route waits here and the city-selection screen opens it right after
/// the town is chosen. In-app navigation never uses this; only the two external
/// entry points do, and only when there is no town yet.
final pendingRouteProvider = StateProvider<String?>((ref) => null);

/// What an external route should do right now.
enum ExternalRouteAction {
  /// A town is selected: open the route.
  navigate,

  /// The stored town is still being restored (cold start): open the route
  /// now — the router does not gate while the restore runs — AND park it, in
  /// case the restore ends with no town and the router replaces the route
  /// with the city selection. [pendingRouteConsumerProvider] drops the parked
  /// copy when the restore does find a town.
  navigateAndRemember,

  /// No town and nothing loading: park the route until the buyer picks one.
  deferBehindCityGate,
}

/// Pure decision shared by the push and deep-link controllers (tested
/// without Flutter). Mirrors the router's city gate, which redirects only
/// when `!hasCity && !isLoading`.
ExternalRouteAction resolveExternalRoute({
  required bool hasCity,
  required bool isLoadingCity,
}) {
  if (hasCity) return ExternalRouteAction.navigate;
  if (isLoadingCity) return ExternalRouteAction.navigateAndRemember;
  return ExternalRouteAction.deferBehindCityGate;
}

/// Pure counterpart for the town restore finishing: the parked route is
/// dropped when a town was restored (the route is already on the stack) and
/// kept when there is none (the city-selection screen will open it).
bool shouldDropPendingRouteAfterRestore({
  required bool wasLoading,
  required bool hasCityNow,
}) =>
    wasLoading && hasCityNow;

/// Watches the town restore: once a stored town is back, a route parked with
/// [ExternalRouteAction.navigateAndRemember] is already on the stack and must
/// not be opened a second time from the city-selection screen later. Read once
/// in `app.dart`.
final pendingRouteConsumerProvider = Provider<void>((ref) {
  ref.listen<CityState>(cityProvider, (prev, next) {
    if (prev == null) return;
    if (shouldDropPendingRouteAfterRestore(
      wasLoading: prev.isLoading && !prev.hasCity,
      hasCityNow: next.hasCity,
    )) {
      if (ref.read(pendingRouteProvider) != null) {
        ref.read(pendingRouteProvider.notifier).state = null;
      }
    }
  });
});
