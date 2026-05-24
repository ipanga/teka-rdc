/// Flavor configuration for the buyer-mobile app.
///
/// Initialized once in main() via [FlavorConfig.initialize]; afterwards
/// read via [FlavorConfig.instance]. All values come from compile-time
/// `--dart-define` (or `--dart-define-from-file=flavors/*.json`) so the
/// resulting APK is per-flavor immutable — there is no runtime config
/// switch.
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

  FlavorConfig._({
    required this.flavor,
    required this.apiBaseUrl,
    this.sentryDsn,
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

  /// Build the singleton from compile-time defines. Idempotent — calling
  /// repeatedly (e.g. on hot restart) just overwrites the instance.
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

    final flavor = AppFlavor.values.firstWhere(
      (f) => f.name == flavorName,
      orElse: () => AppFlavor.development,
    );

    _instance = FlavorConfig._(
      flavor: flavor,
      apiBaseUrl: apiBaseUrl,
      sentryDsn: sentryDsn.isEmpty ? null : sentryDsn,
    );
  }

  String get envName => flavor.name;
  bool get isDevelopment => flavor == AppFlavor.development;
  bool get isStaging => flavor == AppFlavor.staging;
  bool get isProduction => flavor == AppFlavor.production;
}
