/// Flavor configuration for the seller-mobile app.
///
/// Initialized once in main() via [FlavorConfig.initialize]; afterwards
/// read via [FlavorConfig.instance]. All values come from compile-time
/// `--dart-define` (or `--dart-define-from-file=flavors/*.json`).
///
/// See `flavors/{development,staging,production}.json` for the values
/// each flavor ships with.
enum AppFlavor {
  development,
  staging,
  production,
}

class FlavorConfig {
  final AppFlavor flavor;
  final String apiBaseUrl;
  final String? sentryDsn;

  /// PostHog project key (phc_…) for this flavor. Null/empty → PostHog is
  /// never initialized and all analytics calls are no-ops (mirrors the
  /// sentryDsn gate). Dev/staging ship empty; prod is injected at build.
  final String? posthogApiKey;

  FlavorConfig._({
    required this.flavor,
    required this.apiBaseUrl,
    this.sentryDsn,
    this.posthogApiKey,
  });

  static FlavorConfig? _instance;

  static FlavorConfig get instance {
    final i = _instance;
    if (i == null) {
      throw StateError(
        'FlavorConfig.initialize() must be called from main() before '
        'FlavorConfig.instance is read.',
      );
    }
    return i;
  }

  static void initialize() {
    const flavorName = String.fromEnvironment(
      'FLAVOR',
      defaultValue: 'development',
    );
    const apiBaseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://10.0.2.2:5050/api',
    );
    const sentryDsn = String.fromEnvironment('SENTRY_DSN');
    const posthogApiKey = String.fromEnvironment('POSTHOG_API_KEY');

    final flavor = AppFlavor.values.firstWhere(
      (f) => f.name == flavorName,
      orElse: () => AppFlavor.development,
    );

    _instance = FlavorConfig._(
      flavor: flavor,
      apiBaseUrl: apiBaseUrl,
      sentryDsn: sentryDsn.isEmpty ? null : sentryDsn,
      posthogApiKey: posthogApiKey.isEmpty ? null : posthogApiKey,
    );
  }

  String get envName => flavor.name;
  bool get isDevelopment => flavor == AppFlavor.development;
  bool get isStaging => flavor == AppFlavor.staging;
  bool get isProduction => flavor == AppFlavor.production;
}
