// extractDioErrorMessage prefers the API's own French business message for
// 4xx. That assumption holds for messages we write, but NOT for Nest's built-in
// pipes, which throw English strings — "Validation failed (uuid is expected)"
// reached buyers verbatim on the rating screen and the favorite button.
//
// Kept byte-identical with apps/seller-mobile (Rule 15) except the package
// import prefix.

import 'package:buyer_mobile/core/network/dio_error_messages.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

DioException _responseError(int status, Object body) {
  final options = RequestOptions(path: '/v1/reviews/products/ab12cd');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response<Object>(
      requestOptions: options,
      statusCode: status,
      data: body,
    ),
  );
}

void main() {
  group('extractDioErrorMessage — framework English is never shown', () {
    test('maps ParseUUIDPipe 400 to French', () {
      final message = extractDioErrorMessage(
        _responseError(400, {
          'success': false,
          'error': {
            'status': 400,
            'message': 'Validation failed (uuid is expected)',
          },
        }),
      );

      expect(message, isNot(contains('uuid is expected')));
      expect(message, contains('Impossible de charger cette information'));
    });

    test('maps a bare "Bad Request" to French', () {
      final message = extractDioErrorMessage(
        _responseError(400, {
          'error': {'message': 'Bad Request'},
        }),
      );

      expect(message, contains('Veuillez réessayer'));
      expect(message, isNot(contains('Bad Request')));
    });
  });

  group('extractDioErrorMessage — our own copy still passes through', () {
    test('keeps a French business message verbatim', () {
      final message = extractDioErrorMessage(
        _responseError(400, {
          'error': {'message': 'Identifiant invalide.'},
        }),
      );

      expect(message, 'Identifiant invalide.');
    });

    test('keeps the field-specific reason from a validation envelope', () {
      final message = extractDioErrorMessage(
        _responseError(400, {
          'error': {
            'message': 'Erreur de validation',
            'errors': [
              {'field': 'rating', 'message': 'La note est requise.'},
            ],
          },
        }),
      );

      expect(message, 'La note est requise.');
    });

    test('still maps the auth guard defaults to French', () {
      final unauthorized = extractDioErrorMessage(
        _responseError(401, {
          'error': {'message': 'Unauthorized'},
        }),
      );
      final forbidden = extractDioErrorMessage(
        _responseError(403, {
          'error': {'message': 'Forbidden'},
        }),
      );

      expect(unauthorized, contains('session a expiré'));
      expect(forbidden, contains("n'avez pas accès"));
    });
  });
}
