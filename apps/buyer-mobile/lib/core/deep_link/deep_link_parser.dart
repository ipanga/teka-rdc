/// Single source of truth that converts an incoming Teka URL
/// (`https://teka.cd/...`, the `teka://` custom scheme, or a notification's
/// `url` payload) into an internal go_router path. Mirrors the buyer-web URL
/// structure in `apps/buyer-web/src/lib/urls.ts` — keep the two in sync.
///
/// Security model (Rule: validate everything):
///   - Host allow-list (`teka.cd`, `www.teka.cd`) — foreign hosts return null.
///   - Path tokens are charset-validated; nothing is interpolated unchecked.
///   - Private/auth/account/checkout paths are NOT deep-linked (return null →
///     the caller opens them in the browser), so a link can never bypass auth
///     or land on a protected screen with injected state.
///   - Anything unrecognised returns null → browser fallback (web-only pages +
///     SEO are never hijacked).
library;

class DeepLinkTarget {
  /// Internal go_router path to navigate to.
  final String route;

  /// Town context from the URL (`/{ville}/...`), preserved when it maps to a
  /// known active city. Null for city-less URLs.
  final String? citySlug;

  const DeepLinkTarget(this.route, {this.citySlug});

  @override
  bool operator ==(Object other) =>
      other is DeepLinkTarget &&
      other.route == route &&
      other.citySlug == citySlug;

  @override
  int get hashCode => Object.hash(route, citySlug);

  @override
  String toString() => 'DeepLinkTarget($route, city: $citySlug)';
}

class DeepLinkParser {
  DeepLinkParser._();

  /// `teka.cd` / `www.teka.cd` are the public hosts. `dev.teka.cd` and
  /// `staging.teka.cd` are the App-Link hosts the development / staging
  /// builds declare in their manifest (`appLinkHost`); before PR D
  /// (2026-09-06) the parser rejected them, so a link that did open a dev or
  /// staging build was immediately bounced back to the browser and universal
  /// links could never be exercised outside production.
  static const allowedHosts = {
    'teka.cd',
    'www.teka.cd',
    'dev.teka.cd',
    'staging.teka.cd',
  };

  static final _uuidRe = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  /// First-segment keywords that are NOT a city or product token. Mirrors the
  /// buyer-web route tree. Auth/account/checkout are intentionally excluded
  /// from deep-linking (handled by the website).
  static const _reservedFirstSegments = {
    'recherche', 'promotions', 'categorie', 'categories',
    'connexion', 'reclamer-compte', 'paiement', 'panier', 'profil',
    'commandes', 'favoris', 'notifications', 'api', 'ingest', '_next',
    'pages',
  };

  static final _shortCodeRe = RegExp(r'^[a-z0-9]{6}$');
  static final _slugRe = RegExp(r'^[a-zA-Z0-9_-]{1,128}$');

  /// Returns an internal route target, or null = the caller should open the URL
  /// in the system browser (foreign host, unrecognised, or private path).
  static DeepLinkTarget? parse(Uri uri) {
    final isHttps =
        (uri.scheme == 'https' || uri.scheme == 'http') &&
            allowedHosts.contains(uri.host);
    final isCustomScheme = uri.scheme == 'teka';
    if (!isHttps && !isCustomScheme) return null;

    final segs = uri.pathSegments.where((s) => s.isNotEmpty).toList();

    // Home
    if (segs.isEmpty) return const DeepLinkTarget('/');

    final first = segs[0];

    // Search: /recherche?q=
    if (first == 'recherche') {
      final q = (uri.queryParameters['q'] ?? '').trim();
      if (q.isEmpty) return const DeepLinkTarget('/search');
      return DeepLinkTarget('/search?q=${Uri.encodeQueryComponent(q)}');
    }

    // Promotions: /promotions
    if (first == 'promotions') return const DeepLinkTarget('/promotions');

    // Account pages that exist in the app (PR D, 2026-09-06). They are
    // PROTECTED routes: the router sends a guest to login and returns them
    // here afterwards, and the API decides whether the order is theirs —
    // the link carries no authority. Payment, cart and profile stay on the
    // website (no in-app equivalent to deep-link into).
    if (first == 'commandes') {
      if (segs.length == 1) return const DeepLinkTarget('/orders');
      if (segs.length == 2 && _uuidRe.hasMatch(segs[1])) {
        return DeepLinkTarget('/orders/${segs[1].toLowerCase()}');
      }
      return null;
    }
    if (first == 'notifications' && segs.length == 1) {
      return const DeepLinkTarget('/notifications');
    }
    // Static pages: /pages/{slug} — the app renders the same CMS content.
    if (first == 'pages') {
      if (segs.length == 2 && _slugRe.hasMatch(segs[1])) {
        return DeepLinkTarget('/pages/${segs[1]}');
      }
      return null;
    }

    // Legacy global category: /categorie/{slug}
    if (first == 'categorie' && segs.length >= 2) {
      return _category(segs[1], citySlug: null);
    }
    // Legacy category by id: /categories/{id}
    if (first == 'categories' && segs.length >= 2) {
      return _category(segs[1], citySlug: null);
    }

    // Private / auth / system first segments → browser.
    if (_reservedFirstSegments.contains(first)) return null;

    // City-scoped category: /{ville}/categorie/{slug}
    if (segs.length >= 3 && segs[1] == 'categorie') {
      return _category(segs[2], citySlug: first);
    }

    // Product (canonical): /{ville}/{slug-shortCode}
    if (segs.length == 2 && !_reservedFirstSegments.contains(segs[1])) {
      final identifier = _productIdentifier(segs[1]);
      if (identifier == null) return null;
      return DeepLinkTarget('/products/$identifier', citySlug: first);
    }

    // Single bare segment (legacy bare shortCode/id, a city landing, or a
    // static page) — ambiguous client-side; let the website resolve its 308 /
    // dispatcher. Browser fallback.
    return null;
  }

  static DeepLinkTarget? _category(String token, {required String? citySlug}) {
    final t = token.trim();
    if (!_slugRe.hasMatch(t)) return null;
    // The buyer-mobile category screen + API accept slug OR id as the
    // identifier (GET /v1/browse/categories/:identifier).
    return DeepLinkTarget('/categories/$t', citySlug: citySlug);
  }

  /// Mirrors buyer-web `productIdentifierFromParam`: a trailing `-XXXXXX`
  /// (6-char lowercase-alnum) shortCode is the resolver; otherwise the whole
  /// token (bare shortCode / slug / uuid — the API resolves any identifier).
  static String? _productIdentifier(String token) {
    final t = token.trim();
    if (t.isEmpty) return null;
    final dash = t.lastIndexOf('-');
    if (dash != -1 && dash < t.length - 1) {
      final tail = t.substring(dash + 1);
      if (_shortCodeRe.hasMatch(tail)) return tail;
    }
    if (_slugRe.hasMatch(t)) return t;
    return null;
  }
}
