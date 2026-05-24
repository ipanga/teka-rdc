import '../config/flavor.dart';

class ApiConstants {
  ApiConstants._();

  /// Delegates to the current flavor's apiBaseUrl. FlavorConfig.initialize()
  /// must run in main() before this is read.
  static String get baseUrl => FlavorConfig.instance.apiBaseUrl;

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 15);
}
