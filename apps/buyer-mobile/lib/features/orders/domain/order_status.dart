/// Presentation of the API's order / payment enums — ONE mapping for the whole
/// buyer app (PR D3, 2026-09-07).
///
/// The enums themselves are the API's contract and are never translated on the
/// wire: `OrderStatus` and `PaymentStatus` values travel as they are, and only
/// what a buyer READS is French. Before this file the mapping lived in three
/// places (the status badge, the orders-screen filter chips, the payment chip
/// in order detail), each with its own subset — so `REFUNDED`, the two
/// Teka-custody statuses and any future value leaked to buyers as raw English
/// (`order_detail_screen.dart` printed the enum itself, and the checkout
/// success screen printed `order.status`).
///
/// Wording is the terminology already used across Teka (buyer-web's
/// `OrderStatusBadge`, seller-mobile, seller-web and admin-web) — nothing new
/// was invented here.
library;

/// Every status a buyer's order can be in, in workflow order. Mirrors the
/// API's `OrderStatus` enum (`apps/api/prisma/schema.prisma`).
enum BuyerOrderStatus {
  pending('PENDING', 'En attente', 'En attente'),
  confirmed('CONFIRMED', 'Confirmée', 'Confirmées'),
  processing('PROCESSING', 'En préparation', 'En préparation'),
  readyForTekaPickup(
      'READY_FOR_TEKA_PICKUP', 'Prête pour collecte', 'Prêtes pour collecte'),
  receivedAtTeka('RECEIVED_AT_TEKA', 'Reçue par Teka', 'Reçues par Teka'),
  shipped('SHIPPED', 'Expédiée', 'Expédiées'),
  outForDelivery('OUT_FOR_DELIVERY', 'En livraison', 'En livraison'),
  delivered('DELIVERED', 'Livrée', 'Livrées'),
  cancelled('CANCELLED', 'Annulée', 'Annulées'),
  returned('RETURNED', 'Retournée', 'Retournées');

  const BuyerOrderStatus(this.wire, this.label, this.pluralLabel);

  /// The value the API sends and expects back (never shown to a buyer).
  final String wire;

  /// Singular label — badges, timelines, one order.
  final String label;

  /// Plural label — filter chips over a list of orders.
  final String pluralLabel;

  static BuyerOrderStatus? fromWire(String? value) {
    if (value == null) return null;
    final v = value.trim().toUpperCase();
    for (final s in BuyerOrderStatus.values) {
      if (s.wire == v) return s;
    }
    return null;
  }
}

/// French label for an order status. An unknown value (a status added to the
/// API before this app is updated) reads as « Statut inconnu » rather than
/// leaking `SOME_NEW_ENUM` to the buyer.
String orderStatusLabel(String? status) =>
    BuyerOrderStatus.fromWire(status)?.label ?? 'Statut inconnu';

/// Payment statuses a buyer sees (`PaymentStatus` in the API). COD orders sit
/// at PENDING until the cash is collected, then COMPLETED; REFUNDED exists for
/// returns and used to render as the raw English enum.
String paymentStatusLabel(String? status) {
  switch ((status ?? '').trim().toUpperCase()) {
    case 'COMPLETED':
    case 'PAID':
      return 'Payé';
    case 'FAILED':
      return 'Échoué';
    case 'REFUNDED':
      return 'Remboursé';
    case 'PENDING':
    case 'PROCESSING':
      return 'En attente';
    default:
      return 'Statut inconnu';
  }
}

/// The status filter chips on « Mes commandes », in workflow order.
///
/// `null` = « Toutes ». Every status a buyer's order can reach is offered —
/// `RETURNED` and the two Teka-custody steps used to be missing, so a returned
/// order could not be found by filtering at all.
class OrderStatusFilter {
  final BuyerOrderStatus? status;
  final String label;

  const OrderStatusFilter(this.status, this.label);

  /// The value passed to the API (`?status=`); null for « Toutes ».
  String? get wire => status?.wire;
}

const List<OrderStatusFilter> orderStatusFilters = [
  OrderStatusFilter(null, 'Toutes'),
  OrderStatusFilter(BuyerOrderStatus.pending, 'En attente'),
  OrderStatusFilter(BuyerOrderStatus.confirmed, 'Confirmées'),
  OrderStatusFilter(BuyerOrderStatus.processing, 'En préparation'),
  OrderStatusFilter(BuyerOrderStatus.readyForTekaPickup, 'Prêtes pour collecte'),
  OrderStatusFilter(BuyerOrderStatus.receivedAtTeka, 'Reçues par Teka'),
  OrderStatusFilter(BuyerOrderStatus.shipped, 'Expédiées'),
  OrderStatusFilter(BuyerOrderStatus.outForDelivery, 'En livraison'),
  OrderStatusFilter(BuyerOrderStatus.delivered, 'Livrées'),
  OrderStatusFilter(BuyerOrderStatus.cancelled, 'Annulées'),
  OrderStatusFilter(BuyerOrderStatus.returned, 'Retournées'),
];
