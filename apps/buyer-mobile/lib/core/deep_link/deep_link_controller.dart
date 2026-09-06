import 'dart:async';
import 'package:app_links/app_links.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../analytics/posthog_analytics.dart';
import '../navigation/pending_route.dart';
import '../router/app_router.dart';
import '../../features/city/presentation/providers/city_provider.dart';
import 'deep_link_parser.dart';

/// Coarse route category for analytics (never the id/slug/url — no PII).
String _routeType(String route) {
  if (route == '/') return 'home';
  if (route.startsWith('/products/')) return 'product';
  if (route.startsWith('/categories/')) return 'category';
  if (route.startsWith('/search')) return 'search';
  if (route.startsWith('/promotions')) return 'promotions';
  if (route.startsWith('/orders')) return 'order';
  if (route.startsWith('/notifications')) return 'notifications';
  return 'other';
}

/// Listens for incoming Android App Links / iOS Universal Links (and the
/// `teka://` scheme) and routes them through [DeepLinkParser]. Handles all
/// three launch states the same way:
///   - app closed  → `getInitialLink()` (deferred post-first-frame so the
///     GoRouter is mounted before we navigate)
///   - app background / foreground → `uriLinkStream`
///
/// A URL the parser can't map (foreign host, private/account path, unknown
/// route) is opened in the system browser, so web-only pages + SEO are never
/// hijacked and a link can never bypass auth or inject protected navigation.
class DeepLinkController {
  final Ref _ref;
  final AppLinks _appLinks;
  StreamSubscription<Uri>? _sub;
  bool _started = false;

  DeepLinkController(this._ref) : _appLinks = AppLinks();

  void bind() {
    if (_started) return;
    _started = true;

    // Warm links (background → foreground) while the app is alive.
    _sub = _appLinks.uriLinkStream.listen(
      _handle,
      onError: (_) {/* malformed link — ignore */},
    );

    // Cold-start link: defer until the first frame so the router is ready.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        final initial = await _appLinks.getInitialLink();
        if (initial != null) _handle(initial);
      } catch (_) {/* no initial link */}
    });
  }

  void _handle(Uri uri) {
    final target = DeepLinkParser.parse(uri);

    // Breadcrumb for crash diagnosis — scheme + route type only, never the path
    // (no slugs/ids/query → no PII). No-op when Sentry isn't initialized.
    Sentry.addBreadcrumb(Breadcrumb(
      category: 'deeplink',
      message: target == null
          ? 'browser-fallback'
          : 'open ${_routeType(target.route)}',
      data: {'scheme': uri.scheme},
    ));

    if (target == null) {
      // Unmappable (foreign host / private path / unknown) → open the website.
      const PosthogAnalytics()
          .capture('deep_link_opened', properties: {'matched': false});
      _openInBrowser(uri);
      return;
    }

    // Preserve town context: switch the active city when the URL's ville maps
    // to a known active city (best-effort; never blocks navigation).
    final citySlug = target.citySlug;
    if (citySlug != null) {
      final cities = _ref.read(cityProvider).cities;
      final match = cities.where((c) => c.slug == citySlug).toList();
      if (match.isNotEmpty &&
          _ref.read(cityProvider).selectedCity?.id != match.first.id) {
        // ignore: discarded_futures
        _ref.read(cityProvider.notifier).selectCity(match.first);
      }
    }

    // First launch with no town: park the route until the buyer picks one
    // (the router would otherwise replace it with /city-selection).
    final gate = resolveExternalRoute(hasCity: _ref.read(cityProvider).hasCity);
    if (gate == ExternalRouteAction.deferBehindCityGate) {
      _ref.read(pendingRouteProvider.notifier).state = target.route;
      const PosthogAnalytics().capture('deep_link_opened', properties: {
        'matched': true,
        'route_type': _routeType(target.route),
        'scheme': uri.scheme,
        'deferred': true,
      });
      return;
    }

    try {
      _ref.read(appRouterProvider).push(target.route);
      const PosthogAnalytics().capture('deep_link_opened', properties: {
        'matched': true,
        'route_type': _routeType(target.route),
        'scheme': uri.scheme,
      });
    } catch (_) {
      const PosthogAnalytics()
          .capture('deep_link_failed', properties: {'reason': 'navigation'});
      _openInBrowser(uri);
    }
  }

  Future<void> _openInBrowser(Uri uri) async {
    // Only ever re-open http(s) externally — never relaunch a teka:// scheme
    // (that would loop straight back into this handler).
    if (uri.scheme != 'https' && uri.scheme != 'http') return;
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {/* no browser available — give up silently */}
  }

  void dispose() => _sub?.cancel();
}

/// Read-once-instantiate (same pattern as `pushControllerProvider`): reading it
/// in `app.dart` starts the deep-link listeners.
final deepLinkControllerProvider = Provider<DeepLinkController>((ref) {
  final controller = DeepLinkController(ref);
  controller.bind();
  ref.onDispose(controller.dispose);
  return controller;
});
