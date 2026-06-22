import 'package:dio/dio.dart';

/// Maps any error to a French, user-facing message — the SINGLE place error copy
/// lives for the mobile apps (buyer + seller kept byte-identical, Rule 15).
/// Users only ever see these friendly strings; technical detail (exception,
/// stack, endpoint, status) goes to Sentry/logs, never to the screen.
///
/// Policy (decision 2026-06-22): network / timeout / 5xx / unknown → the
/// canonical friendly strings here; business 4xx → the API envelope's French
/// message (already contextual: "Numéro WhatsApp ou code invalide", "Adresse
/// e-mail ou mot de passe incorrect", validation / OTP messages …). Never
/// returns a raw exception or `.toString()`.
String extractDioErrorMessage(DioException e) {
  switch (e.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
      return 'Le serveur met plus de temps que prévu à répondre.\n\n'
          'Veuillez réessayer dans quelques instants.';
    case DioExceptionType.connectionError:
      return 'Aucune connexion Internet.\n\n'
          'Veuillez vérifier votre connexion et réessayer.';
    default:
      break;
  }

  final status = e.response?.statusCode;

  // Server-side failure — never surface its (possibly technical) body.
  if (status != null && status >= 500) {
    return 'Une erreur est survenue sur nos serveurs.\n\n'
        'Veuillez réessayer plus tard.';
  }

  // Prefer the API's French business message (auth / OTP / validation, 4xx).
  final data = e.response?.data;
  if (data is Map) {
    final error = data['error'];
    if (error is Map &&
        error['message'] is String &&
        (error['message'] as String).trim().isNotEmpty) {
      return (error['message'] as String).trim();
    }
    final message = data['message'];
    if (message is String && message.trim().isNotEmpty) {
      return message.trim();
    }
  }

  return 'Une erreur inattendue est survenue.\n\nVeuillez réessayer.';
}

/// Maps ANY caught error (Dio or otherwise) to a friendly French message. Use at
/// every `catch` feeding a user-facing error, instead of `e.toString()`.
String friendlyErrorMessage(Object error) {
  if (error is DioException) return extractDioErrorMessage(error);
  return 'Une erreur inattendue est survenue.\n\nVeuillez réessayer.';
}
