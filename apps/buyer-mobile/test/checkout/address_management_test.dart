import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/features/checkout/data/checkout_repository.dart';

/// Short-circuits every request with a canned response while recording the
/// method + path the repository actually issued. Lets us assert the new
/// address-management calls hit the correct endpoints (they back the redesigned
/// account tab's address book) without a live API.
class _CapturingInterceptor extends Interceptor {
  _CapturingInterceptor(this.responseData);

  final dynamic responseData;
  RequestOptions? captured;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    captured = options;
    handler.resolve(
      Response<dynamic>(
        requestOptions: options,
        data: responseData,
        statusCode: 200,
      ),
    );
  }
}

void main() {
  group('CheckoutRepository address management (account-tab redesign)', () {
    test('setDefaultAddress PATCHes /v1/addresses/:id/default and parses the envelope',
        () async {
      final interceptor = _CapturingInterceptor({
        'data': {'id': 'addr-1', 'label': 'Maison', 'isDefault': true},
      });
      final dio = Dio()..interceptors.add(interceptor);
      final repo = CheckoutRepository(dio);

      final result = await repo.setDefaultAddress('addr-1');

      expect(interceptor.captured!.method, 'PATCH');
      expect(interceptor.captured!.path, '/v1/addresses/addr-1/default');
      expect(result.id, 'addr-1');
      expect(result.isDefault, isTrue);
    });

    test('setDefaultAddress also accepts an unwrapped address body', () async {
      final interceptor = _CapturingInterceptor(
        {'id': 'addr-2', 'isDefault': true},
      );
      final dio = Dio()..interceptors.add(interceptor);
      final repo = CheckoutRepository(dio);

      final result = await repo.setDefaultAddress('addr-2');

      expect(result.id, 'addr-2');
      expect(result.isDefault, isTrue);
    });

    test('deleteAddress DELETEs /v1/addresses/:id', () async {
      final interceptor = _CapturingInterceptor({'data': null});
      final dio = Dio()..interceptors.add(interceptor);
      final repo = CheckoutRepository(dio);

      await repo.deleteAddress('addr-9');

      expect(interceptor.captured!.method, 'DELETE');
      expect(interceptor.captured!.path, '/v1/addresses/addr-9');
    });
  });
}
