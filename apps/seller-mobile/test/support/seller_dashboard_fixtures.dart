// Local-only seller API + identity fixtures. No network, tokens or analytics.
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:seller_mobile/core/storage/secure_storage.dart';
import 'package:seller_mobile/features/auth/data/auth_repository.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/notifications/data/notifications_repository.dart';
import 'package:seller_mobile/features/notifications/presentation/providers/notifications_provider.dart';

class FixtureAuthNotifier extends AuthNotifier {
  FixtureAuthNotifier({String? id = 'seller-fixture'})
      : super(AuthRepository(Dio(), TokenStorage(const FlutterSecureStorage())),
            TokenStorage(const FlutterSecureStorage())) {
    signInAs(id);
  }
  @override
  Future<void> checkAuthStatus() async {}
  void signInAs(String? id) => state = id == null
      ? const AuthState(status: AuthStatus.unauthenticated)
      : AuthState(status: AuthStatus.authenticated, user: {
          'id': id,
          'firstName': 'Marie-Claire',
          'role': 'SELLER',
          'sellerProfile': {'applicationStatus': 'APPROVED'}
        });
  @override
  Future<void> logout() async => signInAs(null);
}

class FixtureNotificationsNotifier extends NotificationsNotifier {
  FixtureNotificationsNotifier() : super(NotificationsRepository(Dio())) {
    state = const NotificationsState(unread: 7);
  }
}

class DashboardFixtureApi {
  final requests = <RequestOptions>[];
  bool failStats = false;
  bool failMutations = false;
  final orders = <Map<String, dynamic>>[
    for (var i = 0; i < 25; i++) _order('pending-$i', 'PENDING'),
    _order('confirmed', 'CONFIRMED'),
    _order('processing', 'PROCESSING'),
    _order('ready', 'READY_FOR_TEKA_PICKUP'),
  ];
  final products = <Map<String, dynamic>>[
    for (final status in [
      'ACTIVE',
      'DRAFT',
      'PENDING_REVIEW',
      'REJECTED',
      'SUSPENDED'
    ])
      _product(status.toLowerCase(), status),
  ];
  late final Dio dio = Dio()
    ..interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
      requests.add(options);
      try {
        if ((failStats && options.path.endsWith('/stats')) ||
            (failMutations && options.method != 'GET')) {
          throw StateError('Fixture: réponse indisponible');
        }
        final data = _respond(options);
        handler.resolve(
            Response(requestOptions: options, statusCode: 200, data: data));
      } catch (error) {
        handler.reject(DioException(
            requestOptions: options,
            error: error,
            type: DioExceptionType.connectionError));
      }
    }));

  static Map<String, dynamic> _order(String id, String status) => {
        'id': id,
        'orderNumber': 'TK-20260903-$id',
        'status': status,
        'totalCDF': '3500000',
        'subtotalCDF': '3000000',
        'deliveryFeeCDF': '500000',
        'createdAt': '2026-09-03T10:00:00Z',
        'buyer': {
          'id': 'buyer-fixture',
          'firstName': 'Alain',
          'lastName': 'Démonstration'
        },
        'items': <Map<String, dynamic>>[],
      };
  static Map<String, dynamic> _product(String id, String status) => {
        'id': id,
        'title': 'Sac de voyage — démonstration',
        'status': status,
        'description': 'Fiche locale pour vérification UX.',
        'categoryId': 'fixture',
        'priceCDF': '3500000',
        'quantity': 8,
        'condition': 'NEW',
        'rejectionReason': status == 'REJECTED'
            ? 'Complétez la description du produit.'
            : null,
        'createdAt': '2026-09-03T10:00:00Z',
        'images': <Map<String, dynamic>>[],
      };

  Map<String, dynamic> _respond(RequestOptions request) {
    final isOrder = request.path.contains('/orders');
    final rows = isOrder ? orders : products;
    final prefix = isOrder ? '/v1/sellers/orders' : '/v1/sellers/products';
    if (request.path == '$prefix/stats') {
      int count(String status) =>
          rows.where((r) => r['status'] == status).length;
      return {
        'success': true,
        'data': isOrder
            ? {
                'byStatus': {
                  for (final r in rows)
                    r['status'] as String: count(r['status'] as String)
                },
              }
            : {
                'total': rows.length,
                'active': count('ACTIVE'),
                'pendingReview': count('PENDING_REVIEW'),
                'draft': count('DRAFT'),
                'rejected': count('REJECTED'),
              }
      };
    }
    if (request.path == prefix && request.method == 'GET') {
      final status = request.queryParameters['status'];
      final search = request.queryParameters['search'] as String? ?? '';
      final filtered = rows
          .where((r) =>
              (status == null || r['status'] == status) &&
              (isOrder ||
                  (r['title'] as String)
                      .toLowerCase()
                      .contains(search.toLowerCase())))
          .toList();
      final page = request.queryParameters['page'] as int? ?? 1;
      final limit = request.queryParameters['limit'] as int? ?? 20;
      return {
        'data': filtered.skip((page - 1) * limit).take(limit).toList(),
        'pagination': {'page': page, 'limit': limit, 'total': filtered.length}
      };
    }
    if (request.path == prefix && request.method == 'POST') {
      final product = _product('new-${rows.length}', 'DRAFT');
      rows.add(product);
      return {'data': product};
    }
    final parts = request.path.substring(prefix.length + 1).split('/');
    final row = rows.firstWhere((r) => r['id'] == parts.first);
    if (request.method == 'DELETE') {
      row['status'] = 'ARCHIVED';
    } else if (request.method != 'GET') {
      final action = parts.length > 1 ? parts.last : 'update';
      if (action == 'duplicate') {
        final product = _product('copy-${rows.length}', 'DRAFT');
        rows.add(product);
        return {'data': product};
      }
      row['status'] = switch (action) {
        'confirm' => 'CONFIRMED',
        'reject' => 'CANCELLED',
        'process' => 'PROCESSING',
        'ready-for-pickup' => 'READY_FOR_TEKA_PICKUP',
        'submit' => 'PENDING_REVIEW',
        _ => 'DRAFT',
      };
    }
    return {'success': true, 'data': Map<String, dynamic>.from(row)};
  }
}
