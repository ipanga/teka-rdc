import 'package:dio/dio.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

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
  String? apiMessage;
  final data = e.response?.data;
  if (data is Map) {
    final error = data['error'];
    if (error is Map) {
      final topMessage =
          error['message'] is String ? (error['message'] as String).trim() : '';
      // Validation failures collapse to the generic "Erreur de validation"
      // wrapper while the field-specific French reason lives in `errors[]`.
      // Prefer that specific reason so the user sees what actually failed
      // instead of a vague banner.
      String? fieldMessage;
      final errors = error['errors'];
      if (errors is List && errors.isNotEmpty) {
        final first = errors.first;
        if (first is Map &&
            first['message'] is String &&
            (first['message'] as String).trim().isNotEmpty) {
          fieldMessage = (first['message'] as String).trim();
        }
      }
      if (topMessage.isNotEmpty && topMessage != 'Erreur de validation') {
        apiMessage = topMessage;
      } else if (fieldMessage != null) {
        apiMessage = fieldMessage;
      } else if (topMessage.isNotEmpty) {
        apiMessage = topMessage;
      }
    } else {
      final message = data['message'];
      if (message is String && message.trim().isNotEmpty) {
        apiMessage = message.trim();
      }
    }
  }

  // The auth guard on a protected endpoint returns the framework's ENGLISH
  // default ("Unauthorized" / "Forbidden"), not a French business message — map
  // those to French (Rule 1). Contextual auth errors (wrong OTP / password)
  // carry their own French message and are preserved.
  if (status == 401 && (apiMessage == null || apiMessage == 'Unauthorized')) {
    return 'Votre session a expiré.\n\nVeuillez vous reconnecter.';
  }
  if (status == 403 && (apiMessage == null || apiMessage == 'Forbidden')) {
    return "Vous n'avez pas accès à cette ressource.";
  }

  if (apiMessage != null) return apiMessage;

  return 'Une erreur inattendue est survenue.\n\nVeuillez réessayer.';
}

/// Maps ANY caught error (Dio or otherwise) to a friendly French message AND, as
/// a side effect, reports UNEXPECTED errors to Sentry with context (endpoint,
/// method, HTTP status, error type) — never the user-facing copy. Use at every
/// `catch` feeding a user-facing error, instead of `e.toString()`.
///
/// "Unexpected" = 5xx, an unknown/parse error, or a non-Dio exception. EXPECTED
/// errors are NOT reported (they're noise): network/timeout/offline and business
/// 4xx (auth / OTP / validation). User identity + active city are attached
/// globally via the Sentry scope (set at auth + town selection). PII (phones) is
/// stripped by the global `beforeSend` scrubber.
String friendlyErrorMessage(Object error, [StackTrace? stack]) {
  if (error is DioException) {
    final status = error.response?.statusCode;
    final isNetwork = error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.connectionError;
    final isBusiness4xx = status != null && status >= 400 && status < 500;
    if (!isNetwork && !isBusiness4xx) {
      _reportUnexpected(
        error,
        stack,
        endpoint: '${error.requestOptions.method} ${error.requestOptions.path}',
        status: status,
        type: error.type.name,
      );
    }
    return extractDioErrorMessage(error);
  }
  _reportUnexpected(error, stack, type: 'non_dio');
  return 'Une erreur inattendue est survenue.\n\nVeuillez réessayer.';
}

/// A short, non-PII category for analytics/telemetry (NOT for display):
/// `timeout` | `no_internet` | `server` | `auth` | `rate_limit` | `validation`
/// | `unknown`.
String errorCategory(Object error) {
  if (error is! DioException) return 'unknown';
  switch (error.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
      return 'timeout';
    case DioExceptionType.connectionError:
      return 'no_internet';
    default:
      break;
  }
  final status = error.response?.statusCode;
  if (status == null) return 'unknown';
  if (status >= 500) return 'server';
  if (status == 401 || status == 403) return 'auth';
  if (status == 429) return 'rate_limit';
  if (status >= 400) return 'validation';
  return 'unknown';
}

void _reportUnexpected(
  Object error,
  StackTrace? stack, {
  String? endpoint,
  int? status,
  String? type,
}) {
  // No-op when Sentry isn't initialised (dev/test) — safe to call anywhere.
  Sentry.captureException(
    error,
    stackTrace: stack,
    withScope: (scope) {
      scope.level = SentryLevel.error;
      if (endpoint != null) scope.setTag('endpoint', endpoint);
      if (status != null) scope.setTag('http_status', '$status');
      if (type != null) scope.setTag('error_type', type);
    },
  );
}
