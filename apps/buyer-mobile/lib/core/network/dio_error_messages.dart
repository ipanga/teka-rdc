import 'package:dio/dio.dart';

/// Maps a [DioException] to a French, user-facing error message.
///
/// Shared across all feature providers in buyer-mobile to keep the
/// network-error UX consistent and to avoid the 6-copy drift that
/// existed before PR7 of the mobile-connectivity initiative (catalog,
/// checkout, cart, orders, wishlist, reviews each had their own
/// `_extractErrorMessage(DioException)` method with identical bodies).
///
/// Order of checks matches the per-provider precedence the duplicates
/// were already enforcing:
///   1. Timeout types → "Connexion lente. Veuillez reessayer."
///   2. Connection error → "Pas de connexion internet."
///   3. Response envelope's `error.message` (or `error` if scalar)
///   4. Generic fallback.
///
/// See CLAUDE.md Rule 15 for the broader discipline around the
/// mobile network layer.
String extractDioErrorMessage(DioException e) {
  if (e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout) {
    return 'Connexion lente. Veuillez reessayer.';
  }
  if (e.type == DioExceptionType.connectionError) {
    return 'Pas de connexion internet.';
  }
  final data = e.response?.data;
  if (data is Map && data['error'] != null) {
    final error = data['error'];
    if (error is Map && error['message'] != null) {
      return error['message'].toString();
    }
    return error.toString();
  }
  return 'Une erreur est survenue. Veuillez reessayer.';
}
