import 'package:flutter_riverpod/flutter_riverpod.dart';

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
enum ExternalRouteAction { navigate, deferBehindCityGate }

/// Pure decision shared by the push and deep-link controllers (tested
/// without Flutter): with a town selected the route is opened immediately;
/// without one it is parked until the buyer picks a town.
ExternalRouteAction resolveExternalRoute({required bool hasCity}) =>
    hasCity ? ExternalRouteAction.navigate : ExternalRouteAction.deferBehindCityGate;
