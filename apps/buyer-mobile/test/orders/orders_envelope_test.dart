import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/features/orders/data/orders_repository.dart';

void main() {
  group('parseOrdersEnvelope', () {
    test('reads the real API shape { success, data: { data, pagination } }', () {
      // This is the exact shape that previously broke the list (the inner
      // wrapper Map was cast `as List` → threw → empty "Mes commandes").
      final res = parseOrdersEnvelope({
        'success': true,
        'data': {
          'data': [
            {'orderNumber': 'TK-1'},
            {'orderNumber': 'TK-2'},
          ],
          'pagination': {'total': 2, 'page': 1, 'limit': 20, 'totalPages': 1},
        },
      });
      expect(res.rawList.length, 2);
      expect(res.total, 2);
      expect(res.totalPages, 1);
    });

    test('falls back to a single-wrap { data: [...] }', () {
      final res = parseOrdersEnvelope({
        'data': [
          {'orderNumber': 'TK-1'},
        ],
      });
      expect(res.rawList.length, 1);
      expect(res.total, 1); // no pagination → list length
    });

    test('falls back to a legacy { orders: [...] }', () {
      final res = parseOrdersEnvelope({
        'data': {
          'orders': [
            {'orderNumber': 'TK-1'},
          ],
          'total': 5,
          'totalPages': 1,
        },
      });
      expect(res.rawList.length, 1);
      expect(res.total, 5);
    });

    test('empty / unexpected → empty list, no throw', () {
      expect(parseOrdersEnvelope(null).rawList, isEmpty);
      expect(parseOrdersEnvelope({'success': true}).rawList, isEmpty);
      expect(parseOrdersEnvelope({'data': 42}).rawList, isEmpty);
    });
  });
}
