import 'deep_link_parser.dart';

/// Where a link inside CMS content (help, FAQ, terms…) should open.
///
/// Before PR D (2026-09-06) every link went to `launchUrl`, so a relative
/// `/pages/faq` — which is how the pages link to each other — did nothing at
/// all, and `https://teka.cd/...` links left the app for the browser.
sealed class InAppLinkTarget {
  const InAppLinkTarget();
}

/// Navigate inside the app (a go_router path).
class InAppRoute extends InAppLinkTarget {
  final String route;
  const InAppRoute(this.route);
}

/// Hand to the OS (browser, dialer, mail, WhatsApp…).
class ExternalLink extends InAppLinkTarget {
  final Uri uri;
  const ExternalLink(this.uri);
}

/// Unusable link — ignore the tap.
class IgnoredLink extends InAppLinkTarget {
  const IgnoredLink();
}

InAppLinkTarget classifyInAppLink(String raw) {
  final url = raw.trim();
  if (url.isEmpty) return const IgnoredLink();

  // Relative link on the website (`/pages/faq`, `/promotions`,
  // `/lubumbashi/categorie/telephones`): resolve it as if it were a teka.cd
  // URL so the app and the website agree on what it opens.
  if (url.startsWith('/')) {
    final target = DeepLinkParser.parse(Uri.parse('https://teka.cd$url'));
    return target == null ? const IgnoredLink() : InAppRoute(target.route);
  }

  final uri = Uri.tryParse(url);
  if (uri == null || !uri.hasScheme) return const IgnoredLink();

  // A Teka URL the app can render → in-app; anything else (tel:, mailto:,
  // wa.me, foreign https, a Teka page the app has no screen for) → OS.
  if (uri.scheme == 'https' || uri.scheme == 'http') {
    final target = DeepLinkParser.parse(uri);
    if (target != null) return InAppRoute(target.route);
  }
  return ExternalLink(uri);
}
