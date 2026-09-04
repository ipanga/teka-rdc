/// Where to land after a login that was triggered by a deep link / push tap.
///
/// The router redirects an unauthenticated navigation to
/// `/auth/login?from=<original location>`; once authenticated we return to
/// `from` — but only when it is an internal app path. Anything else (an
/// absolute URL, a protocol-relative `//host`, an auth or onboarding route, or
/// garbage) falls back to the home tab, so a crafted link can never bounce a
/// freshly signed-in seller somewhere unexpected.
class PostLoginTarget {
  PostLoginTarget._();

  static const String home = '/';

  static String resolve(String? from) {
    if (from == null || from.isEmpty) return home;
    final String decoded;
    try {
      decoded = Uri.decodeComponent(from);
    } catch (_) {
      return home;
    }
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return home;
    if (decoded.contains('://') || decoded.contains('\\')) return home;
    final path = decoded.split('?').first;
    if (path.startsWith('/auth') || path == '/devenir-vendeur') return home;
    return decoded;
  }

  /// `from` value to attach to the login route for [location] — omitted for
  /// the home tab (nothing to come back to).
  static String? fromParam(String location) {
    if (location.isEmpty || location == home) return null;
    return Uri.encodeComponent(location);
  }
}
