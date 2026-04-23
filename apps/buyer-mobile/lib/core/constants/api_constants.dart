class ApiConstants {
  ApiConstants._();

  /// Override at build time with `--dart-define=API_BASE_URL=https://api.teka.cd/api`
  /// for production / staging builds. The default value targets the Android
  /// emulator running against the local docker-compose stack.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:5050/api',
  );

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 15);
}
