// Local-API diagnostics + setup for opt-in native QA.
//
// Identical copy in apps/{buyer,seller}-mobile/integration_test/support/.
// Talks ONLY to the validated local API (see qa_config.dart) through real,
// existing endpoints with real synthetic credentials. No logging interceptor:
// headers, tokens, OTP and passwords are never printed. Errors carry the
// method, path, HTTP status and the server's (French) message only.

import 'dart:math';

import 'package:dio/dio.dart';

class QaApiException implements Exception {
  QaApiException(this.method, this.path, this.status, this.message);
  final String method;
  final String path;
  final int? status;
  final String message;

  @override
  String toString() =>
      'API locale $method $path → ${status ?? 'injoignable'} : $message';
}

/// Anything that can send an authenticated request: a QA session (seller /
/// admin / helper buyer) or the app under test's own Dio (its in-memory
/// session, through the app's real interceptor chain).
abstract class QaHttp {
  Future<dynamic> send(String method, String path, {Object? data});
}

/// Bearer session obtained by a real login. The token never leaves this
/// object and is masked in [toString].
class QaSession implements QaHttp {
  QaSession._(this._api, this._token, this.label);
  final QaApi _api;
  final String _token;
  final String label;

  @override
  Future<dynamic> send(String method, String path, {Object? data}) =>
      _api._send(method, path,
          data: data,
          headers: {'Authorization': 'Bearer $_token'});

  @override
  String toString() => 'QaSession($label, jeton masqué)';
}

/// Uses the app under test's Dio (real AuthInterceptor / retry chain).
class AppDioHttp implements QaHttp {
  AppDioHttp(this._dio);
  final Dio _dio;

  @override
  Future<dynamic> send(String method, String path, {Object? data}) =>
      QaApi._wrap(method, path,
          () => _dio.request<dynamic>(path,
              data: data, options: Options(method: method)));
}

class QaApi {
  QaApi(String baseUrl)
      : _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 20),
          headers: const {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        ));

  final Dio _dio;

  Future<dynamic> _send(String method, String path,
          {Object? data, Map<String, String>? headers}) =>
      _wrap(
          method,
          path,
          () => _dio.request<dynamic>(path,
              data: data,
              options: Options(method: method, headers: headers)));

  static Future<dynamic> _wrap(
      String method, String path, Future<Response<dynamic>> Function() run) async {
    try {
      final res = await run();
      final body = res.data;
      return body is Map && body.containsKey('success') ? body['data'] : body;
    } on DioException catch (e) {
      final body = e.response?.data;
      String message = e.message ?? e.type.name;
      if (body is Map && body['error'] is Map) {
        message = (body['error'] as Map)['message']?.toString() ?? message;
      }
      throw QaApiException(method, path, e.response?.statusCode, message);
    }
  }

  /// Distinguishes "backend down / wrong host" from a UI failure.
  Future<void> health() => _send('GET', '/v1/health');

  Future<QaSession> loginEmail(String email, String password,
      {required String label}) async {
    final data = await _send('POST', '/v1/auth/login/email',
        data: {'email': email, 'password': password});
    return QaSession._(this, _accessToken(data, 'login e-mail'), label);
  }

  /// Real buyer OTP flow (development mock WhatsApp code). Counts against
  /// the API's 3-requests-per-phone-per-10-min limit.
  Future<QaSession> buyerOtpLogin(String phone, String otp,
      {required String label}) async {
    await _send('POST', '/v1/auth/buyer/otp/request', data: {'phone': phone});
    final data = await _send('POST', '/v1/auth/buyer/otp/verify',
        data: {'phone': phone, 'code': otp});
    return QaSession._(this, _accessToken(data, 'OTP acheteur'), label);
  }

  static String _accessToken(dynamic data, String what) {
    final tokens = data is Map ? data['tokens'] : null;
    final access = tokens is Map ? tokens['accessToken'] : null;
    if (access is! String || access.isEmpty) {
      throw QaApiException('POST', what, null, 'aucun jeton renvoyé');
    }
    return access;
  }

  Future<List<Map<String, dynamic>>> cities() async {
    final data = await _send('GET', '/v1/cities');
    return (data as List).cast<Map<String, dynamic>>();
  }
}

/// Typed reads/writes over real endpoints. Stock is ALWAYS read back from the
/// server — never computed on the client.
class QaFixtures {
  const QaFixtures._();

  static Map<String, dynamic> _map(dynamic d) => (d as Map).cast<String, dynamic>();

  /// Authoritative product state as the seller sees it.
  static Future<({int quantity, String priceCDF})> product(
      QaHttp seller, String productId) async {
    final p = _map(await seller.send('GET', '/v1/sellers/products/$productId'));
    return (
      quantity: (p['quantity'] as num).toInt(),
      priceCDF: p['priceCDF'].toString(),
    );
  }

  /// Absolute stock reset through the real seller endpoint, guarded by the
  /// optimistic snapshot (expectedQuantity) — setup only.
  static Future<void> setStock(QaHttp seller, String productId, int qty) async {
    final current = await product(seller, productId);
    if (current.quantity == qty) return;
    await seller.send('PATCH', '/v1/sellers/products/$productId',
        data: {'quantity': qty, 'expectedQuantity': current.quantity});
  }

  /// A fresh COD order for THIS run: clears the buyer's own cart, adds the
  /// fixture product, checks out through the real endpoints. Returns its id.
  static Future<String> placeFreshOrder(QaHttp buyer,
      {required String productId,
      required String addressId,
      int quantity = 1}) async {
    await buyer.send('DELETE', '/v1/cart');
    await buyer.send('POST', '/v1/cart/items',
        data: {'productId': productId, 'quantity': quantity});
    final res = _map(await buyer.send('POST', '/v1/checkout', data: {
      'deliveryAddressId': addressId,
      'paymentMethod': 'COD',
      'idempotencyKey': uuidV4(),
    }));
    final orders = (res['orders'] as List).cast<Map<String, dynamic>>();
    if (orders.length != 1) {
      throw StateError('Commande QA attendue : 1, reçue : ${orders.length}');
    }
    return orders.single['id'] as String;
  }

  static Future<Set<String>> buyerOrderIds(QaHttp buyer) async {
    final res = _map(await buyer.send('GET', '/v1/orders?limit=50'));
    return {
      for (final o in (res['data'] as List)) (o as Map)['id'] as String,
    };
  }

  static Future<Map<String, dynamic>> buyerOrder(QaHttp buyer, String id) async =>
      _map(await buyer.send('GET', '/v1/orders/$id'));

  static Future<Map<String, dynamic>> sellerOrder(QaHttp seller, String id) async =>
      _map(await seller.send('GET', '/v1/sellers/orders/$id'));

  static Future<void> buyerCancel(QaHttp buyer, String id) =>
      buyer.send('POST', '/v1/orders/$id/cancel', data: {'reason': 'QA'});

  static Future<void> adminCancel(QaHttp admin, String id, String reason) =>
      admin.send('POST', '/v1/admin/orders/$id/cancel', data: {'reason': reason});

  static Future<void> sellerTransition(QaHttp seller, String id, String action) =>
      seller.send('PATCH', '/v1/sellers/orders/$id/$action');

  /// Count of audit-log entries INTO [status] (order detail statusLogs).
  static int logsInto(Map<String, dynamic> order, String status) =>
      ((order['statusLogs'] as List?) ?? const [])
          .where((l) => (l as Map)['toStatus'] == status)
          .length;

  /// Awaits [run] and returns the refusal; fails if it succeeded.
  static Future<QaApiException> expectRefusal(Future<void> Function() run,
      {int status = 400}) async {
    try {
      await run();
    } on QaApiException catch (e) {
      if (e.status != status) {
        throw StateError('Refus attendu $status, reçu : $e');
      }
      return e;
    }
    throw StateError('La requête aurait dû être refusée ($status).');
  }
}

/// RFC 4122 v4 (the checkout idempotency key must be one).
String uuidV4() {
  final r = Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-'
      '${h.substring(16, 20)}-${h.substring(20)}';
}
