import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/network/dio_error_messages.dart';

DioException _dio(DioExceptionType type, {int? status, Object? data}) {
  final req = RequestOptions(path: '/v1/x');
  return DioException(
    requestOptions: req,
    type: type,
    response: status == null
        ? null
        : Response(requestOptions: req, statusCode: status, data: data),
  );
}

void main() {
  group('extractDioErrorMessage (enterprise error handling)', () {
    test('no internet → friendly connectivity message', () {
      final m = extractDioErrorMessage(_dio(DioExceptionType.connectionError));
      expect(m, contains('Aucune connexion Internet'));
      expect(m, contains('réessayer'));
    });

    test('timeout → friendly slow-server message', () {
      for (final t in [
        DioExceptionType.connectionTimeout,
        DioExceptionType.sendTimeout,
        DioExceptionType.receiveTimeout,
      ]) {
        expect(extractDioErrorMessage(_dio(t)),
            contains('plus de temps que prévu'));
      }
    });

    test('5xx → generic server message (never the raw body)', () {
      final m = extractDioErrorMessage(
        _dio(DioExceptionType.badResponse,
            status: 500, data: {'error': {'message': 'Prisma exploded'}}),
      );
      expect(m, contains('sur nos serveurs'));
      expect(m, isNot(contains('Prisma')));
    });

    test('business 4xx → the API French message (prefer-API)', () {
      final m = extractDioErrorMessage(
        _dio(DioExceptionType.badResponse,
            status: 401,
            data: {'error': {'message': 'Numéro WhatsApp ou code invalide.'}}),
      );
      expect(m, 'Numéro WhatsApp ou code invalide.');
    });

    test('4xx without a usable message → unexpected fallback (never toString)', () {
      final m = extractDioErrorMessage(
        _dio(DioExceptionType.badResponse, status: 400, data: 'oops'),
      );
      expect(m, contains('inattendue'));
    });
  });

  group('friendlyErrorMessage', () {
    test('non-Dio error → unexpected message, never the raw exception', () {
      final m = friendlyErrorMessage(StateError('boom'));
      expect(m, contains('inattendue'));
      expect(m, isNot(contains('boom')));
    });
  });
}
