import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/home/domain/action_center.dart';
import 'package:seller_mobile/features/orders/data/models/order_stats.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/verification/data/verification_repository.dart';

VerificationStatusModel _verification(String status,
        {List<String> documentStatuses = const []}) =>
    VerificationStatusModel.fromJson({
      'verificationStatus': status,
      'requiredTypes': ['RCCM'],
      'missingTypes': <String>[],
      'documents': [
        for (var i = 0; i < documentStatuses.length; i++)
          {
            'id': 'd$i',
            'type': 'RCCM',
            'status': documentStatuses[i],
            'mimeType': 'application/pdf',
            'sizeBytes': 10,
          }
      ],
    });

void main() {
  group('actionable order states', () {
    test('only the three seller-driven statuses become tasks', () {
      final stats = SellerOrderStats.fromJson({
        'byStatus': {
          'PENDING': 2,
          'CONFIRMED': 3,
          'PROCESSING': 4,
          'READY_FOR_TEKA_PICKUP': 5,
          'RECEIVED_AT_TEKA': 6,
          'SHIPPED': 7,
          'OUT_FOR_DELIVERY': 8,
          'DELIVERED': 9,
          'CANCELLED': 10,
          'RETURNED': 11,
        }
      });
      final items = buildActionItems(orders: stats);
      expect(items.map((i) => i.kind), [
        ActionKind.ordersToConfirm,
        ActionKind.ordersToPrepare,
        ActionKind.ordersToFinish,
      ]);
      expect(items.map((i) => i.count), [2, 3, 4]);
      expect(stats.requiredActions, 9);
      // Teka's part of the lifecycle is tracked, never asked for.
      expect(stats.readyForPickup, 5);
      expect(totalPending(items), 9);
    });

    test('zero counts produce no row', () {
      expect(buildActionItems(orders: const SellerOrderStats()), isEmpty);
    });

    test('each order row deep-links to the filter it promises', () {
      final items = buildActionItems(
          orders: const SellerOrderStats(
              pending: 1, confirmed: 1, processing: 1));
      expect(items.map((i) => i.route), [
        '/orders?status=PENDING',
        '/orders?status=CONFIRMED',
        '/orders?status=PROCESSING',
      ]);
    });
  });

  group('product and verification states', () {
    test('only REJECTED products are a task', () {
      expect(
          buildActionItems(
              products: const ProductStats(
                  total: 9, active: 3, pendingReview: 2, draft: 4)),
          isEmpty);
      final items = buildActionItems(products: const ProductStats(rejected: 2));
      expect(items.single.kind, ActionKind.productsRejected);
      expect(items.single.count, 2);
      expect(items.single.route, '/products?status=REJECTED');
      expect(items.single.tone, ActionTone.rejected);
    });

    test('verification: rejected status or a rejected document', () {
      for (final quiet in ['NOT_SUBMITTED', 'PENDING_REVIEW', 'VERIFIED']) {
        expect(verificationNeedsAction(_verification(quiet)), isFalse,
            reason: quiet);
        expect(buildActionItems(verification: _verification(quiet)), isEmpty,
            reason: quiet);
      }
      expect(verificationNeedsAction(_verification('REJECTED')), isTrue);
      expect(
          verificationNeedsAction(_verification('PENDING_REVIEW',
              documentStatuses: ['ACCEPTED', 'REJECTED'])),
          isTrue);
      expect(
          verificationNeedsAction(_verification('VERIFIED',
              documentStatuses: ['ACCEPTED', 'SUPERSEDED'])),
          isFalse);
      final item =
          buildActionItems(verification: _verification('REJECTED')).single;
      expect(item.kind, ActionKind.verificationRejected);
      expect(item.count, isNull, reason: 'a single task shows its icon');
      expect(item.pendingCount, 1);
      expect(item.route, '/profile/verification');
      expect(item.tone, ActionTone.rejected);
    });
  });

  group('priority model', () {
    test('immediate before soon; fixed order inside a priority', () {
      final items = buildActionItems(
        verification: _verification('REJECTED'),
        products: const ProductStats(rejected: 1),
        orders: const SellerOrderStats(pending: 1, confirmed: 1, processing: 1),
      );
      expect(items.map((i) => i.kind), [
        ActionKind.ordersToConfirm,
        ActionKind.ordersToPrepare,
        ActionKind.ordersToFinish,
        ActionKind.productsRejected,
        ActionKind.verificationRejected,
      ]);
      expect(items.map((i) => i.priority), [
        ActionPriority.immediate,
        ActionPriority.immediate,
        ActionPriority.soon,
        ActionPriority.soon,
        ActionPriority.soon,
      ]);
      expect(totalPending(items), 5);
    });

    test('a missing source is simply absent, never « nothing to do »', () {
      final items = buildActionItems(
          products: const ProductStats(rejected: 1), orders: null);
      expect(items.single.kind, ActionKind.productsRejected);
    });

    test('tone marks state, not priority', () {
      final items = buildActionItems(
        orders: const SellerOrderStats(pending: 1, processing: 1),
        products: const ProductStats(rejected: 1),
      );
      expect(items.map((i) => i.tone), [
        ActionTone.attention,
        ActionTone.attention,
        ActionTone.rejected,
      ]);
    });
  });
}
